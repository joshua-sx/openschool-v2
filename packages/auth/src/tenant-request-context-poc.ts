import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import {
  accountLinks,
  accounts,
  affiliations,
  personRelationships,
  roleTemplateAssignments,
} from '@openschool/db'
import * as schema from '@openschool/db'
import { eq, inArray } from 'drizzle-orm'
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
const ORG_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const STAFF_ACCOUNT = '00000000-0000-4000-8000-000000000204'
const PARENT_ACCOUNT = '00000000-0000-4000-8000-000000000205'
const ISLAND_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000207'
const EXPANSION_AFFILIATION = '00000000-0000-4000-8000-000000000871'
const EXPANSION_ROLE = '00000000-0000-4000-8000-000000000872'
const NON_GUARDIAN_AFFILIATION = '00000000-0000-4000-8000-000000000873'
const NON_GUARDIAN_ROLE = '00000000-0000-4000-8000-000000000874'
const NON_GUARDIAN_RELATIONSHIP = '00000000-0000-4000-8000-000000000875'
const AMBIGUOUS_ACCOUNT_LINK = '00000000-0000-4000-8000-000000000876'
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
  const runId = crypto.randomUUID()
  const proofSessionId = (label: string) => `context-proof-${label}-${runId}`
  const teacherIdentity = identity(TEACHER_ACCOUNT, proofSessionId('teacher'))
  const orgAdminIdentity = identity(ORG_ADMIN_ACCOUNT, proofSessionId('org-admin'))
  const schoolAdminIdentity = identity(SCHOOL_ADMIN_ACCOUNT, proofSessionId('school-admin'))
  const parentIdentity = identity(PARENT_ACCOUNT, proofSessionId('parent'))
  const staffIdentity = identity(STAFF_ACCOUNT, proofSessionId('staff'))
  const disabledIdentity = identity(ISLAND_ADMIN_ACCOUNT, proofSessionId('disabled'))
  const expansionIdentity = identity(TEACHER_ACCOUNT, proofSessionId('expansion'))
  const blankRevocationSessionId = proofSessionId('blank-revocation')
  const sessionIds = [
    teacherIdentity.sessionId,
    orgAdminIdentity.sessionId,
    schoolAdminIdentity.sessionId,
    parentIdentity.sessionId,
    staffIdentity.sessionId,
    disabledIdentity.sessionId,
    expansionIdentity.sessionId,
    blankRevocationSessionId,
  ]

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

    const parentContext = await resolveTenantRequestContext(
      parentIdentity,
      {},
      { requestId: 'guardian-school' },
      { at: NOW },
      db
    )
    assert.deepEqual(
      {
        schoolId: parentContext.activeSchoolId,
        roles: parentContext.roleTemplateKeys,
      },
      { schoolId: SCHOOL_A_HIGH, roles: ['parent'] }
    )
    const parentOptions = await listAvailableTenantContexts(parentIdentity, { at: NOW }, db)
    assert.deepEqual(
      parentOptions.map(({ schoolId, roleTemplateKeys }) => ({ schoolId, roleTemplateKeys })),
      [{ schoolId: SCHOOL_A_HIGH, roleTemplateKeys: ['parent'] }]
    )
    await expectDenial('POLICY_DENIED', () =>
      resolveTenantRequestContext(
        orgAdminIdentity,
        { tenantId: TENANT_A, educationOrganizationId: ORG_A_DISTRICT },
        { requestId: 'legacy-sibling-organization-expansion' },
        { at: NOW, comparisonMode: 'enforce' },
        db
      )
    )

    await db.insert(affiliations).values({
      id: NON_GUARDIAN_AFFILIATION,
      tenantId: TENANT_A,
      personId: '00000000-0000-4000-8000-000000000905',
      kind: 'guardian',
      scopeType: 'tenant',
      validFrom: new Date('2026-01-01T00:00:00Z'),
      issuanceReason: 'Non-guardian relationship negative proof',
    })
    await db.insert(roleTemplateAssignments).values({
      id: NON_GUARDIAN_ROLE,
      tenantId: TENANT_A,
      affiliationId: NON_GUARDIAN_AFFILIATION,
      roleTemplateKey: 'parent',
      validFrom: new Date('2026-01-01T00:00:00Z'),
      issuanceReason: 'Non-guardian relationship negative proof',
    })
    await db.insert(personRelationships).values({
      id: NON_GUARDIAN_RELATIONSHIP,
      tenantId: TENANT_A,
      subjectPersonId: '00000000-0000-4000-8000-000000000905',
      relatedPersonId: '00000000-0000-4000-8000-000000000912',
      type: 'emergency_contact_of',
      validFrom: new Date('2026-01-01T00:00:00Z'),
      issuanceReason: 'Non-guardian relationship negative proof',
    })
    const nonGuardianContext = await resolveTenantRequestContext(
      staffIdentity,
      { tenantId: TENANT_A, schoolId: SCHOOL_A_HIGH },
      { requestId: 'non-guardian-relationship' },
      { at: NOW },
      db
    )
    assert.deepEqual(nonGuardianContext.roleTemplateKeys, ['staff'])

    await assert.rejects(
      db.insert(accountLinks).values({
        id: AMBIGUOUS_ACCOUNT_LINK,
        tenantId: TENANT_A,
        accountId: STAFF_ACCOUNT,
        personId: '00000000-0000-4000-8000-000000000907',
        status: 'active',
        validFrom: new Date('2026-01-01T00:00:00Z'),
        issuanceReason: 'Ambiguous same-Tenant Account Link negative proof',
        activatedAt: NOW,
      }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'constraint_name' in error &&
        error.constraint_name === 'account_links_account_no_active_overlap'
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
        schoolAdminIdentity,
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
        .where(eq(schema.accountSessions.providerSessionId, teacherIdentity.sessionId)),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes('inactive Account Session records are immutable')
    )
    await assert.rejects(
      db.insert(schema.accountSessions).values({
        accountId: TEACHER_ACCOUNT,
        providerSessionId: blankRevocationSessionId,
        status: 'revoked',
        assuranceLevel: 'aal1',
        securityVersion: 1,
        authenticatedAt: new Date('2026-08-02T11:00:00Z'),
        expiresAt: new Date('2026-08-02T13:00:00Z'),
        revokedAt: NOW,
        revocationReason: '   ',
      }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'constraint_name' in error &&
        error.constraint_name === 'account_sessions_revocation_evidence_check'
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
      'Tenant Request Context proof passed: verified Account sessions, explicit multi-context selection, guardian relationship boundaries, ambiguous-link prevention, bounded roles, Tenant/School/subtree denials, MFA, immutable revocation, disablement, and scope-aware legacy expansion enforcement.'
    )
  } finally {
    await db.delete(accountLinks).where(eq(accountLinks.id, AMBIGUOUS_ACCOUNT_LINK))
    await db
      .delete(personRelationships)
      .where(eq(personRelationships.id, NON_GUARDIAN_RELATIONSHIP))
    await db
      .delete(roleTemplateAssignments)
      .where(eq(roleTemplateAssignments.id, NON_GUARDIAN_ROLE))
    await db.delete(affiliations).where(eq(affiliations.id, NON_GUARDIAN_AFFILIATION))
    await db.delete(roleTemplateAssignments).where(eq(roleTemplateAssignments.id, EXPANSION_ROLE))
    await db.delete(affiliations).where(eq(affiliations.id, EXPANSION_AFFILIATION))
    await db
      .update(accounts)
      .set({ status: 'active', disabledAt: null, disabledReason: null, updatedAt: NOW })
      .where(eq(accounts.id, ISLAND_ADMIN_ACCOUNT))
    await db
      .delete(schema.accountSessions)
      .where(inArray(schema.accountSessions.providerSessionId, sessionIds))
    await client.end()
  }
}

await run()
