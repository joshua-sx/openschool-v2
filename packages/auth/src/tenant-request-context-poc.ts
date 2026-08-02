import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import { accounts, affiliations, roleTemplateAssignments } from '@openschool/db'
import * as schema from '@openschool/db'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  TenantRequestContextError,
  listAvailableTenantContexts,
  resolveTenantRequestContext,
  revokeAccountSession,
} from './tenant-request-context'
import type { VerifiedAccountIdentity } from './verified-identity'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const SCHOOL_A_PRIMARY = '00000000-0000-4000-8000-000000000101'
const SCHOOL_A_HIGH = '00000000-0000-4000-8000-000000000102'
const SCHOOL_B = '00000000-0000-4000-8000-000000000103'
const ORG_A_DISTRICT = '00000000-0000-4000-8000-000000000013'
const TEACHER_ACCOUNT = '00000000-0000-4000-8000-000000000203'
const TEACHER_PERSON_A = '00000000-0000-4000-8000-000000000903'
const TEACHER_PERSON_B = '00000000-0000-4000-8000-000000000904'
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const ISLAND_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000207'
const EXPANSION_AFFILIATION = '00000000-0000-4000-8000-000000000871'
const EXPANSION_ROLE = '00000000-0000-4000-8000-000000000872'
const NOW = new Date('2026-08-02T12:00:00Z')

function assertLocalDisposableDatabase(databaseUrl: URL): void {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
  if (process.env.ALLOW_TENANT_CONTEXT_POC !== 'true') {
    throw new Error(
      'Tenant Request Context proof refused: ALLOW_TENANT_CONTEXT_POC must be exactly "true".'
    )
  }
  if (!loopbackHosts.has(databaseUrl.hostname)) {
    throw new Error('Tenant Request Context proof refused: database host must be loopback.')
  }
}

function identity(accountId: string, sessionId: string, assuranceLevel: 'aal1' | 'aal2' = 'aal1') {
  return Object.freeze({
    provider: 'supabase' as const,
    subject: accountId,
    sessionId,
    email: `${accountId}@proof.test`,
    assuranceLevel,
    issuedAt: '2026-08-02T11:00:00.000Z',
    expiresAt: '2026-08-02T13:00:00.000Z',
  }) satisfies VerifiedAccountIdentity
}

async function expectDenial(
  reason: TenantRequestContextError['reason'],
  operation: () => Promise<unknown>
): Promise<void> {
  await assert.rejects(
    operation,
    (error: unknown) => error instanceof TenantRequestContextError && error.reason === reason
  )
}

async function run(): Promise<void> {
  const databaseUrl = new URL(getServerEnv().DATABASE_URL)
  assertLocalDisposableDatabase(databaseUrl)
  const client = postgres(databaseUrl.toString(), { max: 1, prepare: false })
  const db = drizzle(client, { schema })
  const teacherIdentity = identity(TEACHER_ACCOUNT, 'context-proof-teacher')

  try {
    await expectDenial('CONTEXT_REQUIRED', () =>
      resolveTenantRequestContext(
        teacherIdentity,
        {},
        { requestId: 'multi-tenant' },
        { at: NOW },
        db
      )
    )
    await expectDenial('CONTEXT_REQUIRED', () =>
      resolveTenantRequestContext(
        teacherIdentity,
        { tenantId: TENANT_A },
        { requestId: 'multi-school' },
        { at: NOW },
        db
      )
    )

    const primaryContext = await resolveTenantRequestContext(
      teacherIdentity,
      { tenantId: TENANT_A, schoolId: SCHOOL_A_PRIMARY },
      { requestId: 'primary' },
      { at: NOW },
      db
    )
    assert.deepEqual(
      {
        tenantId: primaryContext.tenantId,
        personId: primaryContext.personId,
        schoolId: primaryContext.activeSchoolId,
        schoolName: primaryContext.activeSchoolName,
        roles: primaryContext.roleTemplateKeys,
        comparison: primaryContext.legacyComparison,
      },
      {
        tenantId: TENANT_A,
        personId: TEACHER_PERSON_A,
        schoolId: SCHOOL_A_PRIMARY,
        schoolName: 'Horizon Primary School',
        roles: ['teacher'],
        comparison: 'matched',
      }
    )
    assert.equal(Object.isFrozen(primaryContext), true)
    assert.equal(Object.isFrozen(primaryContext.roleTemplateKeys), true)
    assert.equal('schoolIds' in primaryContext, false)

    const islandContext = await resolveTenantRequestContext(
      teacherIdentity,
      { tenantId: TENANT_B, schoolId: SCHOOL_B },
      { requestId: 'island' },
      { at: NOW },
      db
    )
    assert.equal(islandContext.personId, TEACHER_PERSON_B)

    const options = await listAvailableTenantContexts(teacherIdentity, { at: NOW }, db)
    assert.deepEqual(
      options.map(({ tenantId, schoolId }) => `${tenantId}:${schoolId}`).sort(),
      [
        `${TENANT_A}:${SCHOOL_A_PRIMARY}`,
        `${TENANT_A}:${SCHOOL_A_HIGH}`,
        `${TENANT_B}:${SCHOOL_B}`,
      ].sort()
    )

    await expectDenial('TENANT_DENIED', () =>
      resolveTenantRequestContext(
        teacherIdentity,
        { tenantId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
        { requestId: 'wrong-tenant' },
        { at: NOW },
        db
      )
    )
    await expectDenial('SCHOOL_DENIED', () =>
      resolveTenantRequestContext(
        teacherIdentity,
        { tenantId: TENANT_A, schoolId: SCHOOL_B },
        { requestId: 'cross-tenant-school' },
        { at: NOW },
        db
      )
    )
    await expectDenial('SCHOOL_DENIED', () =>
      resolveTenantRequestContext(
        identity(SCHOOL_ADMIN_ACCOUNT, 'context-proof-school-admin'),
        { tenantId: TENANT_A, schoolId: SCHOOL_A_HIGH },
        { requestId: 'sibling-school' },
        { at: NOW },
        db
      )
    )
    await expectDenial('SCOPE_MISMATCH', () =>
      resolveTenantRequestContext(
        teacherIdentity,
        {
          tenantId: TENANT_A,
          educationOrganizationId: ORG_A_DISTRICT,
          schoolId: SCHOOL_A_HIGH,
        },
        { requestId: 'mismatched-subtree' },
        { at: NOW },
        db
      )
    )
    await expectDenial('MFA_REQUIRED', () =>
      resolveTenantRequestContext(
        teacherIdentity,
        { tenantId: TENANT_A, schoolId: SCHOOL_A_PRIMARY },
        { requestId: 'mfa' },
        { at: NOW, requiredAssuranceLevel: 'aal2' },
        db
      )
    )

    await revokeAccountSession(
      {
        providerSessionId: teacherIdentity.sessionId,
        reason: 'Proof immediate session revocation',
        revokedByAccountId: SCHOOL_ADMIN_ACCOUNT,
        at: NOW,
      },
      undefined,
      db
    )
    await assert.rejects(
      db
        .update(schema.accountSessions)
        .set({ status: 'active', updatedAt: new Date(NOW.getTime() + 1) })
        .where(eq(schema.accountSessions.providerSessionId, teacherIdentity.sessionId))
    )
    await expectDenial('SESSION_REVOKED', () =>
      resolveTenantRequestContext(
        teacherIdentity,
        { tenantId: TENANT_A, schoolId: SCHOOL_A_PRIMARY },
        { requestId: 'revoked-session' },
        { at: NOW },
        db
      )
    )

    const disabledIdentity = identity(ISLAND_ADMIN_ACCOUNT, 'context-proof-disabled')
    await db
      .update(accounts)
      .set({ status: 'disabled', disabledAt: NOW, disabledReason: 'Context proof' })
      .where(eq(accounts.id, ISLAND_ADMIN_ACCOUNT))
    await expectDenial('ACCOUNT_DISABLED', () =>
      resolveTenantRequestContext(
        disabledIdentity,
        { tenantId: TENANT_B },
        { requestId: 'disabled-account' },
        { at: NOW },
        db
      )
    )

    const expansionIdentity = identity(TEACHER_ACCOUNT, 'context-proof-expansion')
    await db.insert(affiliations).values({
      id: EXPANSION_AFFILIATION,
      tenantId: TENANT_A,
      personId: TEACHER_PERSON_A,
      kind: 'administrator',
      scopeType: 'school',
      schoolId: SCHOOL_A_PRIMARY,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      issuanceReason: 'Legacy comparison negative proof',
    })
    await db.insert(roleTemplateAssignments).values({
      id: EXPANSION_ROLE,
      tenantId: TENANT_A,
      affiliationId: EXPANSION_AFFILIATION,
      roleTemplateKey: 'school_admin',
      validFrom: new Date('2026-01-01T00:00:00Z'),
      issuanceReason: 'Legacy comparison negative proof',
    })
    await expectDenial('POLICY_DENIED', () =>
      resolveTenantRequestContext(
        expansionIdentity,
        { tenantId: TENANT_A, schoolId: SCHOOL_A_PRIMARY },
        { requestId: 'legacy-expansion' },
        { at: NOW, comparisonMode: 'enforce' },
        db
      )
    )
    const observedExpansion = await resolveTenantRequestContext(
      expansionIdentity,
      { tenantId: TENANT_A, schoolId: SCHOOL_A_PRIMARY },
      { requestId: 'legacy-expansion-observe' },
      { at: NOW, comparisonMode: 'observe' },
      db
    )
    assert.equal(observedExpansion.legacyComparison, 'observed_expansion')

    console.log(
      'Tenant Request Context proof passed: verified Account sessions, explicit multi-context selection, bounded roles, Tenant/School/subtree denials, MFA, revocation, disablement, and legacy expansion enforcement.'
    )
  } finally {
    await client.end()
  }
}

await run()
