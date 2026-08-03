import assert from 'node:assert/strict'
import type { TenantRequestContext } from '@openschool/auth/server'
import { getServerEnv } from '@openschool/config/server'
import {
  accountSessions,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
} from '@openschool/db'
import { ISOLATION_FIXTURES } from '@openschool/isolation'
import type { PolicyContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { inArray } from 'drizzle-orm'
import { appRouter } from './routers'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const F = ISOLATION_FIXTURES
const PERSON_A_PRIMARY = '00000000-0000-4000-8000-000000000911'
const PROOF_RUN_ID = crypto.randomUUID()
const SESSION_IDS = [
  `api-isolation-${PROOF_RUN_ID}-organization-admin`,
  `api-isolation-${PROOF_RUN_ID}-school-admin`,
] as const

function assertGuardedProof(): void {
  if (process.env.ALLOW_API_ISOLATION_POC !== 'true') {
    throw new Error('API isolation proof refused: ALLOW_API_ISOLATION_POC must be exactly "true".')
  }
  const url = new URL(getServerEnv().DATABASE_RUNTIME_URL)
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('API isolation proof refused: the runtime database host must be loopback.')
  }
}

function tenantRequestContext(input: {
  accountId: string
  personId: string
  roleTemplateKeys: readonly string[]
  sessionId: string
  tenantId?: string
  activeEducationOrganizationId?: string
  activeSchoolId?: string
}): TenantRequestContext {
  const now = new Date()
  return Object.freeze({
    version: 1,
    contextPolicyVersion: 1,
    accountId: input.accountId,
    personId: input.personId,
    tenantId: input.tenantId ?? F.tenantA,
    tenantName: 'Isolation fixture',
    sessionId: input.sessionId,
    membershipVersion: 1,
    securityVersion: 1,
    assuranceLevel: 'aal1',
    ...(input.activeEducationOrganizationId
      ? { activeEducationOrganizationId: input.activeEducationOrganizationId }
      : {}),
    ...(input.activeSchoolId ? { activeSchoolId: input.activeSchoolId } : {}),
    roleTemplateKeys: Object.freeze([...input.roleTemplateKeys]),
    requestId: crypto.randomUUID(),
    resolvedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    legacyComparison: 'not_applicable',
  })
}

function policyContext(context: TenantRequestContext): PolicyContext {
  return Object.freeze({
    accountId: context.accountId,
    personId: context.personId,
    tenantId: context.tenantId,
    roleTemplateKeys: context.roleTemplateKeys,
    assuranceLevel: context.assuranceLevel,
    ...(context.activeEducationOrganizationId
      ? { activeEducationOrganizationId: context.activeEducationOrganizationId }
      : {}),
    ...(context.activeSchoolId ? { activeSchoolId: context.activeSchoolId } : {}),
  })
}

function caller(context: TenantRequestContext, policy = policyContext(context)) {
  return appRouter.createCaller({
    denialReason: null,
    identity: null,
    requestContext: context,
    policyContext: policy,
    userId: context.accountId,
  })
}

async function trpcFailure(
  operation: Promise<unknown>
): Promise<Readonly<{ code: string; message: string }>> {
  try {
    await operation
  } catch (error) {
    assert.ok(error instanceof TRPCError)
    return Object.freeze({ code: error.code, message: error.message })
  }
  assert.fail('Expected tRPC operation to fail')
}

async function run(): Promise<void> {
  assertGuardedProof()
  const admin = createMigrationClient()
  let failure: unknown
  try {
    const now = new Date()
    await admin.insert(accountSessions).values([
      {
        accountId: F.organizationAdminAccount,
        providerSessionId: SESSION_IDS[0],
        status: 'active',
        assuranceLevel: 'aal1',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
      {
        accountId: F.schoolAdminAccount,
        providerSessionId: SESSION_IDS[1],
        status: 'active',
        assuranceLevel: 'aal1',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    ])

    const organizationContext = tenantRequestContext({
      accountId: F.organizationAdminAccount,
      personId: F.organizationAdminPerson,
      roleTemplateKeys: ['org_admin'],
      sessionId: SESSION_IDS[0],
      activeEducationOrganizationId: F.organizationA,
    })
    const organizationCaller = caller(organizationContext)
    const visibleSchools = await organizationCaller.schools.list()
    assert.deepEqual(
      visibleSchools.map(({ id }) => id).sort(),
      [F.schoolAPrimary, F.schoolAHigh].sort()
    )
    assert.equal(
      visibleSchools.some(({ id }) => id === F.schoolB),
      false
    )

    const schoolContext = tenantRequestContext({
      accountId: F.schoolAdminAccount,
      personId: F.schoolAdminPerson,
      roleTemplateKeys: ['school_admin'],
      sessionId: SESSION_IDS[1],
      activeSchoolId: F.schoolAPrimary,
    })
    const schoolCaller = caller(schoolContext)
    assert.equal(
      (await schoolCaller.schools.getById({ schoolId: F.schoolAPrimary })).id,
      F.schoolAPrimary
    )
    const primaryStudent = await schoolCaller.students.getById({
      studentId: F.studentAPrimary,
    })
    assert.equal(primaryStudent.id, PERSON_A_PRIMARY)
    assert.equal(primaryStudent.legacyStudentId, F.studentAPrimary)

    const [knownSiblingSchool, crossTenantSchool, unknownSchool] = await Promise.all([
      trpcFailure(schoolCaller.schools.getById({ schoolId: F.schoolAHigh })),
      trpcFailure(schoolCaller.schools.getById({ schoolId: F.schoolB })),
      trpcFailure(schoolCaller.schools.getById({ schoolId: F.unknownSchool })),
    ])
    assert.deepEqual(knownSiblingSchool, unknownSchool)
    assert.deepEqual(crossTenantSchool, unknownSchool)

    const [knownSiblingStudent, crossTenantStudent, unknownStudent] = await Promise.all([
      trpcFailure(schoolCaller.students.getById({ studentId: F.studentAHigh })),
      trpcFailure(schoolCaller.students.getById({ studentId: F.studentB })),
      trpcFailure(schoolCaller.students.getById({ studentId: F.unknownStudent })),
    ])
    assert.deepEqual(knownSiblingStudent, unknownStudent)
    assert.deepEqual(crossTenantStudent, unknownStudent)

    const [sameScopeBatch, siblingBatch, crossTenantBatch] = await Promise.all([
      schoolCaller.students.getBySchool({ schoolId: F.schoolAPrimary }),
      schoolCaller.students.getBySchool({ schoolId: F.schoolAHigh }),
      schoolCaller.students.getBySchool({ schoolId: F.schoolB }),
    ])
    assert.equal(
      sameScopeBatch.some(({ legacyStudentId }) => legacyStudentId === F.studentAPrimary),
      true
    )
    assert.deepEqual(siblingBatch, [])
    assert.deepEqual(crossTenantBatch, [])
    assert.equal(
      sameScopeBatch.every(
        ({ tenantId, schoolId }) => tenantId === F.tenantA && schoolId === F.schoolAPrimary
      ),
      true
    )

    const forgedPolicy: PolicyContext = {
      ...policyContext(schoolContext),
      tenantId: F.tenantB,
      activeSchoolId: F.schoolB,
    }
    assert.deepEqual(await trpcFailure(caller(schoolContext, forgedPolicy).schools.list()), {
      code: 'FORBIDDEN',
      message: 'DATABASE_POLICY_CONTEXT_MISMATCH',
    })

    console.log(
      'API isolation proof passed: actual tRPC middleware/services/runtime roles preserve same-scope access, valid sibling and cross-Tenant IDOR denials, indistinguishable errors, concurrent batch isolation, bounded result scope, and context/Policy replay rejection.'
    )
  } catch (error) {
    failure = error
  } finally {
    const cleanup = await Promise.allSettled([
      admin.delete(accountSessions).where(inArray(accountSessions.providerSessionId, SESSION_IDS)),
      closeDatabaseExecutionPoolsForProof(),
    ])
    await admin.$client.end({ timeout: 5 })
    const cleanupFailure = cleanup.find((result) => result.status === 'rejected')
    if (!failure && cleanupFailure?.status === 'rejected') failure = cleanupFailure.reason
  }
  if (failure) throw failure
}

await run()
