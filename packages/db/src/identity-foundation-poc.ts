import assert from 'node:assert/strict'
import { getMigrationEnv } from '@openschool/config/server'
import { and, sql as drizzleSql, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { activateAccountLink, revokeAccountLink } from './account-link-lifecycle'
import {
  PersonDirectoryError,
  findDuplicatePersonCandidates,
  recordPersonMergeProposal,
} from './person-directory'
import * as schema from './schema'
import {
  accountLinks,
  accounts,
  affiliations,
  identityMigrationEvents,
  people,
  personMergeEvidence,
  studentProfiles,
} from './schema'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const ACTOR_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const SHARED_ACCOUNT = '00000000-0000-4000-8000-000000000203'
const SHARED_PERSON_A = '00000000-0000-4000-8000-000000000903'
const SHARED_PERSON_B = '00000000-0000-4000-8000-000000000904'
const STUDENT_WITHOUT_LOGIN = '00000000-0000-4000-8000-000000000911'
const LIFECYCLE_ACCOUNT = '00000000-0000-4000-8000-000000000851'
const LIFECYCLE_PERSON = '00000000-0000-4000-8000-000000000852'
const LIFECYCLE_LINK = '00000000-0000-4000-8000-000000000853'
const ROLLBACK_ACCOUNT = '00000000-0000-4000-8000-000000000854'
const ROLLBACK_PERSON = '00000000-0000-4000-8000-000000000855'
const ROLLBACK_LINK = '00000000-0000-4000-8000-000000000856'
const DUPLICATE_PERSON_A = '00000000-0000-4000-8000-000000000857'
const DUPLICATE_PERSON_B = '00000000-0000-4000-8000-000000000858'
const NOW = new Date('2026-08-02T12:00:00Z')

interface PostgresErrorLike {
  code?: string
  cause?: unknown
}

function isPostgresErrorWithCode(error: unknown, code: string): boolean {
  let current = error
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return false
    }
    const postgresError = current as PostgresErrorLike
    if (postgresError.code === code) {
      return true
    }
    current = postgresError.cause
  }
  return false
}

function assertLocalDisposableDatabase(databaseUrl: URL): void {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
  if (process.env.ALLOW_IDENTITY_FOUNDATION_POC !== 'true') {
    throw new Error(
      'Identity foundation proof refused: ALLOW_IDENTITY_FOUNDATION_POC must be exactly "true".'
    )
  }
  if (!loopbackHosts.has(databaseUrl.hostname)) {
    throw new Error('Identity foundation proof refused: database host must be loopback.')
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
  const databaseUrl = new URL(getMigrationEnv().DATABASE_MIGRATION_URL)
  assertLocalDisposableDatabase(databaseUrl)
  const client = postgres(databaseUrl.toString(), { max: 1, prepare: false })
  const db = drizzle(client, { schema })

  try {
    const sharedPeople = await db
      .select({ id: people.id, tenantId: people.tenantId, email: people.email })
      .from(accountLinks)
      .innerJoin(
        people,
        and(eq(people.tenantId, accountLinks.tenantId), eq(people.id, accountLinks.personId))
      )
      .where(eq(accountLinks.accountId, SHARED_ACCOUNT))

    assert.deepEqual(
      sharedPeople.sort((left, right) => left.tenantId.localeCompare(right.tenantId)),
      [
        { id: SHARED_PERSON_A, tenantId: TENANT_A, email: 'teacher@horizon.test' },
        { id: SHARED_PERSON_B, tenantId: TENANT_B, email: 'teacher@horizon.test' },
      ]
    )
    const tenantAView = sharedPeople.filter(({ tenantId }) => tenantId === TENANT_A)
    assert.deepEqual(
      tenantAView.map(({ id }) => id),
      [SHARED_PERSON_A]
    )

    const currentRoles = await db
      .select({
        scopeType: affiliations.scopeType,
        schoolId: affiliations.schoolId,
        classId: affiliations.classId,
      })
      .from(affiliations)
      .where(
        and(
          eq(affiliations.tenantId, TENANT_A),
          eq(affiliations.personId, SHARED_PERSON_A),
          eq(affiliations.status, 'active'),
          lte(affiliations.validFrom, NOW),
          or(isNull(affiliations.validUntil), gt(affiliations.validUntil, NOW))
        )
      )
    assert.equal(currentRoles.filter(({ scopeType }) => scopeType === 'school').length, 2)
    assert.equal(currentRoles.filter(({ scopeType }) => scopeType === 'class').length, 1)

    const [studentLogin] = await db
      .select({ links: drizzleSql<number>`count(${accountLinks.id})::int` })
      .from(studentProfiles)
      .leftJoin(
        accountLinks,
        and(
          eq(accountLinks.tenantId, studentProfiles.tenantId),
          eq(accountLinks.personId, studentProfiles.personId)
        )
      )
      .where(eq(studentProfiles.personId, STUDENT_WITHOUT_LOGIN))
    assert.deepEqual(studentLogin, { links: 0 })

    await db.insert(accounts).values([
      {
        id: LIFECYCLE_ACCOUNT,
        identityProvider: 'proof',
        providerSubject: LIFECYCLE_ACCOUNT,
        primaryEmail: 'lifecycle@proof.test',
      },
      {
        id: ROLLBACK_ACCOUNT,
        identityProvider: 'proof',
        providerSubject: ROLLBACK_ACCOUNT,
        primaryEmail: 'rollback@proof.test',
      },
    ])
    await db.insert(people).values([
      {
        id: LIFECYCLE_PERSON,
        tenantId: TENANT_A,
        displayName: 'Lifecycle Proof',
        normalizedDisplayName: 'lifecycle proof',
      },
      {
        id: ROLLBACK_PERSON,
        tenantId: TENANT_A,
        displayName: 'Rollback Proof',
        normalizedDisplayName: 'rollback proof',
      },
      {
        id: DUPLICATE_PERSON_A,
        tenantId: TENANT_A,
        displayName: 'Taylor James',
        normalizedDisplayName: 'taylor james',
        email: 'teacher@horizon.test',
        normalizedEmail: 'teacher@horizon.test',
      },
      {
        id: DUPLICATE_PERSON_B,
        tenantId: TENANT_B,
        displayName: 'Taylor James',
        normalizedDisplayName: 'taylor james',
        email: 'teacher@horizon.test',
        normalizedEmail: 'teacher@horizon.test',
      },
    ])
    await db.insert(accountLinks).values([
      {
        id: LIFECYCLE_LINK,
        tenantId: TENANT_A,
        accountId: LIFECYCLE_ACCOUNT,
        personId: LIFECYCLE_PERSON,
        issuanceReason: 'Lifecycle proof',
      },
      {
        id: ROLLBACK_LINK,
        tenantId: TENANT_A,
        accountId: ROLLBACK_ACCOUNT,
        personId: ROLLBACK_PERSON,
        issuanceReason: 'Atomic rollback proof',
      },
    ])
    await db.insert(affiliations).values([
      {
        id: '00000000-0000-4000-8000-000000000861',
        tenantId: TENANT_A,
        personId: LIFECYCLE_PERSON,
        kind: 'employee',
        scopeType: 'tenant',
        status: 'active',
        validFrom: new Date('2026-09-01T00:00:00Z'),
        issuanceReason: 'Future grant proof',
      },
      {
        id: '00000000-0000-4000-8000-000000000862',
        tenantId: TENANT_A,
        personId: LIFECYCLE_PERSON,
        kind: 'teacher',
        scopeType: 'tenant',
        status: 'suspended',
        validFrom: new Date('2026-01-01T00:00:00Z'),
        issuanceReason: 'Suspended grant proof',
      },
      {
        id: '00000000-0000-4000-8000-000000000863',
        tenantId: TENANT_A,
        personId: LIFECYCLE_PERSON,
        kind: 'member',
        scopeType: 'tenant',
        status: 'revoked',
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validUntil: new Date('2026-07-01T00:00:00Z'),
        revokedAt: new Date('2026-07-01T00:00:00Z'),
        revocationReason: 'Revoked grant proof',
        issuanceReason: 'Revoked grant proof',
      },
      {
        id: '00000000-0000-4000-8000-000000000864',
        tenantId: TENANT_A,
        personId: LIFECYCLE_PERSON,
        kind: 'guardian',
        scopeType: 'tenant',
        status: 'active',
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validUntil: new Date('2026-07-01T00:00:00Z'),
        issuanceReason: 'Expired grant proof',
      },
    ])
    const effectiveInvalidGrants = await db
      .select({ id: affiliations.id })
      .from(affiliations)
      .where(
        and(
          eq(affiliations.tenantId, TENANT_A),
          eq(affiliations.personId, LIFECYCLE_PERSON),
          eq(affiliations.status, 'active'),
          lte(affiliations.validFrom, NOW),
          or(isNull(affiliations.validUntil), gt(affiliations.validUntil, NOW))
        )
      )
    assert.deepEqual(effectiveInvalidGrants, [])

    const activated = await db.transaction((tx) =>
      activateAccountLink(tx, {
        tenantId: TENANT_A,
        accountLinkId: LIFECYCLE_LINK,
        actorAccountId: ACTOR_ACCOUNT,
        reason: 'Identity proof accepted',
        at: NOW,
      })
    )
    assert.equal(activated.membershipVersion, 2)

    const revoked = await db.transaction((tx) =>
      revokeAccountLink(tx, {
        tenantId: TENANT_A,
        accountLinkId: LIFECYCLE_LINK,
        actorAccountId: ACTOR_ACCOUNT,
        reason: 'Proof access withdrawn',
        at: new Date('2026-08-02T13:00:00Z'),
      })
    )
    assert.equal(revoked.membershipVersion, 3)

    const [lifecycleState] = await db
      .select({
        status: accountLinks.status,
        membershipVersion: accounts.membershipVersion,
      })
      .from(accountLinks)
      .innerJoin(accounts, eq(accounts.id, accountLinks.accountId))
      .where(eq(accountLinks.id, LIFECYCLE_LINK))
    assert.deepEqual(lifecycleState, { status: 'revoked', membershipVersion: 3 })

    const lifecycleEvents = await db
      .select({ eventType: identityMigrationEvents.eventType })
      .from(identityMigrationEvents)
      .where(eq(identityMigrationEvents.accountLinkId, LIFECYCLE_LINK))
    assert.deepEqual(
      lifecycleEvents.map(({ eventType }) => eventType),
      ['account_link_activated', 'account_link_revoked']
    )

    await expectSqlState('atomic lifecycle rollback', '23503', () =>
      db.transaction((tx) =>
        activateAccountLink(tx, {
          tenantId: TENANT_A,
          accountLinkId: ROLLBACK_LINK,
          actorAccountId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          reason: 'This event must fail its actor foreign key',
          at: NOW,
        })
      )
    )
    const [rollbackState] = await db
      .select({ status: accountLinks.status, version: accounts.membershipVersion })
      .from(accountLinks)
      .innerJoin(accounts, eq(accounts.id, accountLinks.accountId))
      .where(eq(accountLinks.id, ROLLBACK_LINK))
    assert.deepEqual(rollbackState, { status: 'pending', version: 1 })

    const candidates = await db.transaction((tx) =>
      findDuplicatePersonCandidates(tx, {
        tenantId: TENANT_A,
        displayName: 'Taylor James',
        email: 'teacher@horizon.test',
      })
    )
    assert.deepEqual(
      candidates.map(({ id }) => id).sort(),
      [DUPLICATE_PERSON_A, SHARED_PERSON_A].sort()
    )
    assert.equal(
      candidates.some(({ tenantId }) => tenantId !== TENANT_A),
      false
    )

    const mergeEvidenceId = await db.transaction((tx) =>
      recordPersonMergeProposal(tx, {
        tenantId: TENANT_A,
        sourcePersonId: DUPLICATE_PERSON_A,
        targetPersonId: SHARED_PERSON_A,
        reason: 'Exact email and normalized name require administrator review',
        evidence: { signals: ['same_email', 'same_name'] },
        recordedByAccountId: ACTOR_ACCOUNT,
      })
    )
    const [mergeEvidence] = await db
      .select({ id: personMergeEvidence.id, status: personMergeEvidence.status })
      .from(personMergeEvidence)
      .where(eq(personMergeEvidence.id, mergeEvidenceId))
    assert.deepEqual(mergeEvidence, { id: mergeEvidenceId, status: 'proposed' })

    await assert.rejects(
      db.transaction((tx) =>
        recordPersonMergeProposal(tx, {
          tenantId: TENANT_A,
          sourcePersonId: DUPLICATE_PERSON_A,
          targetPersonId: DUPLICATE_PERSON_B,
          reason: 'Cross-Tenant proposal must fail',
          evidence: {},
          recordedByAccountId: ACTOR_ACCOUNT,
        })
      ),
      (error: unknown) => error instanceof PersonDirectoryError && error.code === 'person_not_found'
    )

    await expectSqlState('cross-Tenant Account Link', '23503', () =>
      db.insert(accountLinks).values({
        tenantId: TENANT_B,
        accountId: ACTOR_ACCOUNT,
        personId: SHARED_PERSON_A,
        issuanceReason: 'Forbidden cross-Tenant proof',
      })
    )
    await expectSqlState('overlapping active Account Link', '23P01', () =>
      db.insert(accountLinks).values({
        tenantId: TENANT_A,
        accountId: ACTOR_ACCOUNT,
        personId: SHARED_PERSON_A,
        status: 'active',
        validFrom: NOW,
        activatedAt: NOW,
        issuanceReason: 'Forbidden overlapping proof',
      })
    )
    await expectSqlState('immutable Person tenant key', '23514', () =>
      db.update(people).set({ tenantId: TENANT_B }).where(eq(people.id, SHARED_PERSON_A))
    )
    await expectSqlState('append-only identity event', '55000', () =>
      db
        .update(identityMigrationEvents)
        .set({ evidence: { changed: true } })
        .where(eq(identityMigrationEvents.accountLinkId, LIFECYCLE_LINK))
    )

    console.log(
      'Identity foundation proof passed: Account and Person isolation, multi-School roles, non-login profiles, atomic link versioning, duplicate review, temporal exclusions, and immutable evidence.'
    )
  } finally {
    await client.end()
  }
}

await run()
