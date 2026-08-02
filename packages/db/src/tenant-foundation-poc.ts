import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import { and, desc, sql as drizzleSql, eq, lte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import {
  organizationTreeClosure,
  organizationTreeNodes,
  organizationTreeVersions,
  schoolGovernanceAssignments,
  schools,
} from './schema'
import { insertOrganizationTreeVersion } from './tenant-hierarchy'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const TENANT_A_ROOT = TENANT_A
const TENANT_A_BOARD = '00000000-0000-4000-8000-000000000011'
const TENANT_A_NETWORK = '00000000-0000-4000-8000-000000000012'
const TENANT_A_DISTRICT = '00000000-0000-4000-8000-000000000013'
const TENANT_A_PRIMARY = '00000000-0000-4000-8000-000000000101'
const TENANT_A_HIGH = '00000000-0000-4000-8000-000000000102'
const TENANT_B_SCHOOL = '00000000-0000-4000-8000-000000000103'
const TENANT_A_STUDENT = '00000000-0000-4000-8000-000000000401'
const TENANT_A_GOVERNANCE = '00000000-0000-4000-8000-000000000041'
const TREE_V2 = '00000000-0000-4000-8000-000000000801'
const TREE_INVALID = '00000000-0000-4000-8000-000000000802'

interface PostgresErrorLike {
  code?: string
}

class ExpectedProofRollback extends Error {}

function isPostgresErrorWithCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as PostgresErrorLike).code === code
}

function assertLocalDisposableDatabase(databaseUrl: URL): void {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])

  if (process.env.ALLOW_TENANT_FOUNDATION_POC !== 'true') {
    throw new Error(
      'Tenant foundation proof refused: ALLOW_TENANT_FOUNDATION_POC must be exactly "true".'
    )
  }
  if (!loopbackHosts.has(databaseUrl.hostname)) {
    throw new Error(
      `Tenant foundation proof refused: DATABASE_URL host must be loopback, received ${databaseUrl.hostname}.`
    )
  }
}

async function expectSqlState(
  label: string,
  code: string,
  operation: () => Promise<unknown>
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.equal(
      isPostgresErrorWithCode(error, code),
      true,
      `${label} should fail with SQLSTATE ${code}`
    )
    return true
  })
}

async function run(): Promise<void> {
  const databaseUrl = new URL(getServerEnv().DATABASE_URL)
  assertLocalDisposableDatabase(databaseUrl)

  // Intentional raw-PostgreSQL exception: SQLSTATE, EXPLAIN output, trigger
  // behavior, and deferred constraints are the interface under test.
  const client = postgres(databaseUrl.toString(), { max: 1, prepare: false })
  const db = drizzle(client, { schema })

  try {
    const seededProfiles = await db
      .select({ id: schools.id, profile: schools.profile, tenantId: schools.tenantId })
      .from(schools)
      .where(eq(schools.tenantId, TENANT_A))

    assert.deepEqual(
      seededProfiles.sort((left, right) => left.id.localeCompare(right.id)),
      [
        { id: TENANT_A_PRIMARY, profile: 'primary', tenantId: TENANT_A },
        { id: TENANT_A_HIGH, profile: 'secondary', tenantId: TENANT_A },
      ]
    )

    await expectSqlState('cross-Tenant class reference', '23503', () =>
      client.begin(async (transaction) => {
        await transaction`
          insert into classes (tenant_id, school_id, name, academic_year)
          values (${TENANT_B}, ${TENANT_A_PRIMARY}, 'forbidden', '2026-2027')
        `
      })
    )
    await expectSqlState('cross-Tenant School governance', '23503', () =>
      client.begin(async (transaction) => {
        await transaction`
          insert into school_governance_assignments (
            tenant_id, school_id, education_organization_id, valid_from
          ) values (
            ${TENANT_A}, ${TENANT_B_SCHOOL}, ${TENANT_A_ROOT}, '2027-01-01T00:00:00Z'
          )
        `
      })
    )
    await expectSqlState('immutable tenant key', '23514', () =>
      client.begin(async (transaction) => {
        await transaction`
          update students set tenant_id = ${TENANT_B} where id = ${TENANT_A_STUDENT}
        `
      })
    )
    await expectSqlState('overlapping School governance', '23P01', () =>
      client.begin(async (transaction) => {
        await transaction`
          insert into school_governance_assignments (
            tenant_id, school_id, education_organization_id, valid_from
          ) values (
            ${TENANT_A}, ${TENANT_A_PRIMARY}, ${TENANT_A_BOARD}, '2026-06-01T00:00:00Z'
          )
        `
      })
    )

    await assert.rejects(
      db.transaction(async (tx) => {
        await insertOrganizationTreeVersion(tx, {
          id: TREE_V2,
          tenantId: TENANT_A,
          version: 2,
          effectiveFrom: new Date('2026-08-01T00:00:00Z'),
          reason: 'Proof move: transfer district from board to network',
          nodes: [
            { organizationId: TENANT_A_ROOT, parentOrganizationId: null },
            { organizationId: TENANT_A_BOARD, parentOrganizationId: TENANT_A_ROOT },
            { organizationId: TENANT_A_NETWORK, parentOrganizationId: TENANT_A_ROOT },
            { organizationId: TENANT_A_DISTRICT, parentOrganizationId: TENANT_A_NETWORK },
          ],
        })

        const networkDescendants = await tx
          .select({ id: organizationTreeClosure.descendantOrganizationId })
          .from(organizationTreeClosure)
          .where(
            and(
              eq(organizationTreeClosure.tenantId, TENANT_A),
              eq(organizationTreeClosure.treeVersionId, TREE_V2),
              eq(organizationTreeClosure.ancestorOrganizationId, TENANT_A_NETWORK),
              eq(organizationTreeClosure.depth, 1)
            )
          )
        assert.deepEqual(networkDescendants, [{ id: TENANT_A_DISTRICT }])

        const siblings = await tx
          .select({ id: organizationTreeNodes.organizationId })
          .from(organizationTreeNodes)
          .where(
            and(
              eq(organizationTreeNodes.tenantId, TENANT_A),
              eq(organizationTreeNodes.treeVersionId, TREE_V2),
              eq(organizationTreeNodes.parentOrganizationId, TENANT_A_ROOT)
            )
          )
        assert.deepEqual(
          siblings.map(({ id }) => id).sort(),
          [TENANT_A_BOARD, TENANT_A_NETWORK].sort()
        )

        const historicalVersion = await tx
          .select({ id: organizationTreeVersions.id })
          .from(organizationTreeVersions)
          .where(
            and(
              eq(organizationTreeVersions.tenantId, TENANT_A),
              lte(organizationTreeVersions.effectiveFrom, new Date('2026-07-31T23:59:59Z'))
            )
          )
          .orderBy(desc(organizationTreeVersions.effectiveFrom))
          .limit(1)
        const currentVersion = await tx
          .select({ id: organizationTreeVersions.id })
          .from(organizationTreeVersions)
          .where(
            and(
              eq(organizationTreeVersions.tenantId, TENANT_A),
              lte(organizationTreeVersions.effectiveFrom, new Date('2026-08-01T00:00:00Z'))
            )
          )
          .orderBy(desc(organizationTreeVersions.effectiveFrom))
          .limit(1)
        assert.deepEqual(historicalVersion, [{ id: TENANT_A_ROOT }])
        assert.deepEqual(currentVersion, [{ id: TREE_V2 }])

        await tx
          .update(schoolGovernanceAssignments)
          .set({ validUntil: new Date('2026-08-01T00:00:00Z') })
          .where(eq(schoolGovernanceAssignments.id, TENANT_A_GOVERNANCE))
        await tx.insert(schoolGovernanceAssignments).values({
          id: '00000000-0000-4000-8000-000000000804',
          tenantId: TENANT_A,
          schoolId: TENANT_A_PRIMARY,
          educationOrganizationId: TENANT_A_NETWORK,
          validFrom: new Date('2026-08-01T00:00:00Z'),
        })
        const historicalGovernance = await tx.execute(drizzleSql`
          select education_organization_id as "educationOrganizationId"
          from school_governance_assignments
          where tenant_id = ${TENANT_A}
            and school_id = ${TENANT_A_PRIMARY}
            and valid_from <= '2026-07-31T23:59:59Z'::timestamptz
            and (valid_until is null or valid_until > '2026-07-31T23:59:59Z'::timestamptz)
        `)
        const currentGovernance = await tx.execute(drizzleSql`
          select education_organization_id as "educationOrganizationId"
          from school_governance_assignments
          where tenant_id = ${TENANT_A}
            and school_id = ${TENANT_A_PRIMARY}
            and valid_from <= '2026-08-01T00:00:00Z'::timestamptz
            and (valid_until is null or valid_until > '2026-08-01T00:00:00Z'::timestamptz)
        `)
        assert.deepEqual(historicalGovernance, [{ educationOrganizationId: TENANT_A_DISTRICT }])
        assert.deepEqual(currentGovernance, [{ educationOrganizationId: TENANT_A_NETWORK }])

        await expectSqlState('sealed tree update', '55000', () =>
          tx.transaction(async (savepoint) => {
            await savepoint
              .update(organizationTreeVersions)
              .set({ reason: 'forbidden mutation' })
              .where(eq(organizationTreeVersions.id, TREE_V2))
          })
        )
        await expectSqlState('sealed tree insert', '55000', () =>
          tx.transaction(async (savepoint) => {
            await savepoint.insert(organizationTreeNodes).values({
              tenantId: TENANT_A,
              treeVersionId: TREE_V2,
              organizationId: TENANT_A_ROOT,
              parentOrganizationId: null,
            })
          })
        )

        await tx.execute(drizzleSql`set local enable_seqscan = off`)
        const closurePlan = await tx.execute(drizzleSql`
          explain (format json)
          select descendant_organization_id
          from organization_tree_closure
          where tenant_id = ${TENANT_A}
            and tree_version_id = ${TREE_V2}
            and ancestor_organization_id = ${TENANT_A_NETWORK}
          order by depth, descendant_organization_id
        `)
        const schoolPlan = await tx.execute(drizzleSql`
          explain (format json)
          select id from schools
          where tenant_id = ${TENANT_A} and org_id = ${TENANT_A_ROOT}
        `)
        assert.match(JSON.stringify(closurePlan), /organization_tree_closure_descendants_idx/)
        assert.match(JSON.stringify(schoolPlan), /schools_tenant_organization_idx/)

        throw new ExpectedProofRollback('rollback proof-only hierarchy changes')
      }),
      (error: unknown) => error instanceof ExpectedProofRollback
    )

    await expectSqlState('Organization Tree cycle', '23514', () =>
      db.transaction(async (tx) => {
        await tx.insert(organizationTreeNodes).values({
          tenantId: TENANT_A,
          treeVersionId: TREE_INVALID,
          organizationId: TENANT_A_BOARD,
          parentOrganizationId: TENANT_A_NETWORK,
        })
        await tx.insert(organizationTreeNodes).values({
          tenantId: TENANT_A,
          treeVersionId: TREE_INVALID,
          organizationId: TENANT_A_NETWORK,
          parentOrganizationId: TENANT_A_BOARD,
        })
      })
    )

    await expectSqlState('incomplete Organization Tree closure', '23514', () =>
      db.transaction(async (tx) => {
        await tx.insert(organizationTreeNodes).values([
          {
            tenantId: TENANT_A,
            treeVersionId: TREE_INVALID,
            organizationId: TENANT_A_ROOT,
            parentOrganizationId: null,
          },
          {
            tenantId: TENANT_A,
            treeVersionId: TREE_INVALID,
            organizationId: TENANT_A_BOARD,
            parentOrganizationId: TENANT_A_ROOT,
          },
        ])
        await tx.insert(organizationTreeClosure).values([
          {
            tenantId: TENANT_A,
            treeVersionId: TREE_INVALID,
            ancestorOrganizationId: TENANT_A_ROOT,
            descendantOrganizationId: TENANT_A_ROOT,
            depth: 0,
          },
          {
            tenantId: TENANT_A,
            treeVersionId: TREE_INVALID,
            ancestorOrganizationId: TENANT_A_BOARD,
            descendantOrganizationId: TENANT_A_BOARD,
            depth: 0,
          },
        ])
        await tx.insert(organizationTreeVersions).values({
          id: TREE_INVALID,
          tenantId: TENANT_A,
          version: 99,
          effectiveFrom: new Date('2099-01-01T00:00:00Z'),
          reason: 'must fail',
        })
      })
    )

    console.log(
      'Tenant foundation proof passed: composite isolation, immutable tenant keys, cycle-safe versioned hierarchy, historical governance, School profiles, and index plans.'
    )
  } finally {
    await client.end()
  }
}

await run()
