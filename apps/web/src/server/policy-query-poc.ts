import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import {
  CAPABILITIES,
  CURRENT_POLICY_BUNDLE,
  type PolicyContext,
  evaluatePolicy,
} from '@openschool/rbac'
import { getAccessibleSchools, getSchoolById } from '../services/schools'
import { getStudentById, getStudentsBySchool } from '../services/students'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const SCHOOL_A_PRIMARY = '00000000-0000-4000-8000-000000000101'
const SCHOOL_A_HIGH = '00000000-0000-4000-8000-000000000102'
const SCHOOL_B = '00000000-0000-4000-8000-000000000103'
const STUDENT_A_PRIMARY = '00000000-0000-4000-8000-000000000401'
const STUDENT_A_HIGH = '00000000-0000-4000-8000-000000000402'
const STUDENT_B = '00000000-0000-4000-8000-000000000403'

function assertLocalDisposableDatabase(): void {
  if (process.env.ALLOW_POLICY_QUERY_POC !== 'true') {
    throw new Error('Policy query proof refused: ALLOW_POLICY_QUERY_POC must be exactly "true".')
  }
  const databaseUrl = new URL(getServerEnv().DATABASE_URL)
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(databaseUrl.hostname)) {
    throw new Error('Policy query proof refused: database host must be loopback.')
  }
}

function context(overrides: Partial<PolicyContext>): PolicyContext {
  return {
    accountId: 'proof-account',
    personId: 'proof-person',
    tenantId: TENANT_A,
    roleTemplateKeys: ['school_admin'],
    assuranceLevel: 'aal1',
    activeSchoolId: SCHOOL_A_PRIMARY,
    ...overrides,
  }
}

function allow(
  policyContext: PolicyContext,
  capability: (typeof CAPABILITIES)[keyof typeof CAPABILITIES],
  resource: { kind: 'school' | 'student'; tenantId: string }
) {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context: policyContext,
    capability,
    resource,
  })
  assert.equal(decision.effect, 'allow', `${capability} should be allowed for proof context`)
  if (decision.effect !== 'allow') throw new Error('Policy proof did not produce an allow decision')
  return decision
}

assertLocalDisposableDatabase()

const organizationAdmin = context({
  accountId: '00000000-0000-4000-8000-000000000201',
  personId: '00000000-0000-4000-8000-000000000901',
  roleTemplateKeys: ['org_admin'],
  activeSchoolId: undefined,
  activeEducationOrganizationId: TENANT_A,
})
const organizationSchools = allow(organizationAdmin, CAPABILITIES.SCHOOLS_READ, {
  kind: 'school',
  tenantId: TENANT_A,
})
assert.deepEqual(
  (await getAccessibleSchools(organizationAdmin, organizationSchools)).map(({ id }) => id).sort(),
  [SCHOOL_A_PRIMARY, SCHOOL_A_HIGH].sort()
)
assert.equal(
  await getSchoolById(organizationAdmin, organizationSchools, SCHOOL_B, CAPABILITIES.SCHOOLS_READ),
  null
)

const schoolAdmin = context({
  accountId: '00000000-0000-4000-8000-000000000202',
  personId: '00000000-0000-4000-8000-000000000902',
})
const schoolAdminSchools = allow(schoolAdmin, CAPABILITIES.SCHOOLS_READ, {
  kind: 'school',
  tenantId: TENANT_A,
})
assert.deepEqual(
  (await getAccessibleSchools(schoolAdmin, schoolAdminSchools)).map(({ id }) => id),
  [SCHOOL_A_PRIMARY]
)
assert.equal(
  await getSchoolById(schoolAdmin, schoolAdminSchools, SCHOOL_A_HIGH, CAPABILITIES.SCHOOLS_READ),
  null
)

const teacher = context({
  accountId: '00000000-0000-4000-8000-000000000203',
  personId: '00000000-0000-4000-8000-000000000903',
  roleTemplateKeys: ['teacher'],
  activeSchoolId: SCHOOL_A_HIGH,
})
const teacherStudents = allow(teacher, CAPABILITIES.STUDENTS_READ, {
  kind: 'student',
  tenantId: TENANT_A,
})
const teacherSchoolWide = evaluatePolicy({
  bundle: CURRENT_POLICY_BUNDLE,
  context: teacher,
  capability: CAPABILITIES.STUDENTS_READ,
  requestedScope: 'school',
  resource: { kind: 'student', tenantId: TENANT_A },
})
assert.equal(teacherSchoolWide.effect, 'deny')
assert.equal(teacherSchoolWide.reason, 'SCOPE_NOT_GRANTED')
assert.equal((await getStudentById(teacher, teacherStudents, STUDENT_A_HIGH))?.id, STUDENT_A_HIGH)
assert.equal(await getStudentById(teacher, teacherStudents, STUDENT_A_PRIMARY), null)
assert.deepEqual(
  (await getStudentsBySchool(teacher, teacherStudents, SCHOOL_A_HIGH)).map(({ id }) => id),
  [STUDENT_A_HIGH]
)
assert.deepEqual(await getStudentsBySchool(teacher, teacherStudents, SCHOOL_A_PRIMARY), [])

const guardian = context({
  accountId: '00000000-0000-4000-8000-000000000205',
  personId: '00000000-0000-4000-8000-000000000906',
  roleTemplateKeys: ['parent'],
  activeSchoolId: SCHOOL_A_HIGH,
})
const guardianStudents = allow(guardian, CAPABILITIES.STUDENTS_READ, {
  kind: 'student',
  tenantId: TENANT_A,
})
assert.equal((await getStudentById(guardian, guardianStudents, STUDENT_A_HIGH))?.id, STUDENT_A_HIGH)
assert.equal(await getStudentById(guardian, guardianStudents, STUDENT_A_PRIMARY), null)

const student = context({
  accountId: 'proof-student-account',
  personId: '00000000-0000-4000-8000-000000000912',
  roleTemplateKeys: ['student'],
  activeSchoolId: SCHOOL_A_HIGH,
})
const selfStudents = allow(student, CAPABILITIES.STUDENTS_READ, {
  kind: 'student',
  tenantId: TENANT_A,
})
assert.equal((await getStudentById(student, selfStudents, STUDENT_A_HIGH))?.id, STUDENT_A_HIGH)
assert.equal(await getStudentById(student, selfStudents, STUDENT_A_PRIMARY), null)
const organizationStudents = allow(organizationAdmin, CAPABILITIES.STUDENTS_READ, {
  kind: 'student',
  tenantId: TENANT_A,
})
await assert.rejects(
  getStudentById(organizationAdmin, organizationSchools, STUDENT_A_HIGH),
  (error: unknown) => error instanceof Error && error.message === 'POLICY_SCOPE_MISMATCH'
)
assert.equal(await getStudentById(organizationAdmin, organizationStudents, STUDENT_B), null)

console.log(
  'Capability policy query proof passed: expected-Capability, Organization subtree, School, assigned-class, linked-student, self, sibling-School, and cross-Tenant constraints all held against seeded PostgreSQL data.'
)
