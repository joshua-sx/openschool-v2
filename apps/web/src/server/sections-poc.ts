import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  accountSessions,
  closeDatabaseExecutionPoolsForProof,
  courses,
  createMigrationClient,
  sectionRosterMemberships,
  sectionStaffAssignments,
  sections,
  withPolicyTenantTransaction,
} from '@openschool/db'
import {
  CAPABILITIES,
  CURRENT_POLICY_BUNDLE,
  type PolicyContext,
  type PolicyDecision,
  evaluatePolicy,
} from '@openschool/rbac'
import { eq, inArray } from 'drizzle-orm'
import { toDatabasePolicyContext } from '../services/database-context'
import {
  addSectionRosterMember,
  assignSectionStaff,
  closeSection,
  createCourse,
  createSection,
  getSectionWorkspace,
} from '../services/sections'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B_SCHOOL = '00000000-0000-4000-8000-000000000103'
const SCHOOL_PRIMARY = '00000000-0000-4000-8000-000000000101'
const SCHOOL_HIGH = '00000000-0000-4000-8000-000000000102'
const HIGH_YEAR = '00000000-0000-4000-8000-000000001202'
const HIGH_TERM = '00000000-0000-4000-8000-000000001221'
const HIGH_LEVEL = '00000000-0000-4000-8000-000000001323'
const HIGH_STUDENT_ENROLLMENT = '00000000-0000-4000-8000-000000001002'
const ORG_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const ORG_ADMIN_PERSON = '00000000-0000-4000-8000-000000000901'
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const SCHOOL_ADMIN_PERSON = '00000000-0000-4000-8000-000000000902'
const TEACHER_ACCOUNT = '00000000-0000-4000-8000-000000000203'
const TEACHER_PERSON = '00000000-0000-4000-8000-000000000903'
const ORG_ROOT = '00000000-0000-4000-8000-000000000001'
const RUN_ID = crypto.randomUUID()
const ORG_SESSION = `sections-org-${RUN_ID}`
const SCHOOL_SESSION = `sections-school-${RUN_ID}`
const TEACHER_SESSION = `sections-teacher-${RUN_ID}`

function assertDisposable(): void {
  if (process.env.ALLOW_SECTIONS_POC !== 'true') {
    throw new Error('Sections proof refused: ALLOW_SECTIONS_POC must be exactly "true".')
  }
  const host = new URL(getServerEnv().DATABASE_RUNTIME_URL).hostname
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(host)) {
    throw new Error('Sections proof refused: database host must be loopback.')
  }
}

const orgContext: PolicyContext = Object.freeze({
  accountId: ORG_ADMIN_ACCOUNT,
  personId: ORG_ADMIN_PERSON,
  tenantId: TENANT_A,
  roleTemplateKeys: ['org_admin'],
  assuranceLevel: 'aal2',
  activeEducationOrganizationId: ORG_ROOT,
})
const schoolContext: PolicyContext = Object.freeze({
  accountId: SCHOOL_ADMIN_ACCOUNT,
  personId: SCHOOL_ADMIN_PERSON,
  tenantId: TENANT_A,
  roleTemplateKeys: ['school_admin'],
  assuranceLevel: 'aal2',
  activeSchoolId: SCHOOL_PRIMARY,
})
const teacherContext: PolicyContext = Object.freeze({
  accountId: TEACHER_ACCOUNT,
  personId: TEACHER_PERSON,
  tenantId: TENANT_A,
  roleTemplateKeys: ['teacher'],
  assuranceLevel: 'aal1',
  activeSchoolId: SCHOOL_HIGH,
})

function allow(
  context: PolicyContext,
  capability: typeof CAPABILITIES.SECTIONS_READ | typeof CAPABILITIES.SECTIONS_MANAGE,
  requestedScope?: 'school' | 'class'
): Extract<PolicyDecision, { effect: 'allow' }> {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context,
    capability,
    ...(requestedScope ? { requestedScope } : {}),
    resource: { kind: 'section', tenantId: TENANT_A },
  })
  assert.equal(decision.effect, 'allow')
  if (decision.effect !== 'allow') throw new Error('SECTIONS_POLICY_DENIED')
  return decision
}

function databaseContext(
  actor: 'org' | 'school' | 'teacher',
  requestId: string
): TenantDatabaseContext {
  const context = actor === 'org' ? orgContext : actor === 'school' ? schoolContext : teacherContext
  assert.ok(context.personId)
  return Object.freeze({
    accountId: context.accountId,
    personId: context.personId,
    tenantId: TENANT_A,
    sessionId:
      actor === 'org' ? ORG_SESSION : actor === 'school' ? SCHOOL_SESSION : TEACHER_SESSION,
    requestId,
    assuranceLevel: context.assuranceLevel,
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    ...(context.activeSchoolId ? { activeSchoolId: context.activeSchoolId } : {}),
    ...(context.activeEducationOrganizationId
      ? { activeEducationOrganizationId: context.activeEducationOrganizationId }
      : {}),
  })
}

async function runProof(): Promise<void> {
  assertDisposable()
  const admin = createMigrationClient()
  const now = new Date()
  const orgRead = allow(orgContext, CAPABILITIES.SECTIONS_READ)
  const orgManage = allow(orgContext, CAPABILITIES.SECTIONS_MANAGE)
  const schoolRead = allow(schoolContext, CAPABILITIES.SECTIONS_READ, 'school')
  const teacherRead = allow(teacherContext, CAPABILITIES.SECTIONS_READ, 'class')
  let courseId: string | undefined
  let sectionId: string | undefined
  try {
    await admin.insert(accountSessions).values([
      {
        accountId: ORG_ADMIN_ACCOUNT,
        providerSessionId: ORG_SESSION,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
      },
      {
        accountId: SCHOOL_ADMIN_ACCOUNT,
        providerSessionId: SCHOOL_SESSION,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
      },
      {
        accountId: TEACHER_ACCOUNT,
        providerSessionId: TEACHER_SESSION,
        status: 'active',
        assuranceLevel: 'aal1',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
      },
    ])

    const course = await createCourse(
      databaseContext('org', `sections-course-${RUN_ID}`),
      orgContext,
      orgManage,
      {
        schoolId: SCHOOL_HIGH,
        code: `MATH-${RUN_ID.slice(0, 8)}`,
        name: 'Proof Mathematics',
        courseType: 'subject',
        subjectArea: 'Mathematics',
        creditValue: 1,
        reason: 'Disposable Section proof',
      }
    )
    courseId = course.id
    const section = await createSection(
      databaseContext('org', `sections-create-${RUN_ID}`),
      orgContext,
      orgManage,
      {
        schoolId: SCHOOL_HIGH,
        academicYearId: HIGH_YEAR,
        academicTermId: HIGH_TERM,
        learnerLevelId: HIGH_LEVEL,
        courseId,
        code: `ALG-${RUN_ID.slice(0, 8)}`,
        name: 'Proof Algebra',
        sectionType: 'course',
        startDate: '2026-08-17',
        endDate: '2026-12-18',
        capacity: 0 + 1,
        reason: 'Disposable Section proof',
      }
    )
    sectionId = section.id
    await assignSectionStaff(
      databaseContext('org', `sections-staff-${RUN_ID}`),
      orgContext,
      orgManage,
      {
        sectionId,
        personId: TEACHER_PERSON,
        role: 'lead_teacher',
        isPrimary: true,
        validFrom: '2026-08-17T00:00:00.000Z',
        validUntil: '2026-12-19T00:00:00.000Z',
        reason: 'Disposable Section proof',
      }
    )
    const roster = await addSectionRosterMember(
      databaseContext('org', `sections-roster-${RUN_ID}`),
      orgContext,
      orgManage,
      {
        sectionId,
        schoolEnrollmentId: HIGH_STUDENT_ENROLLMENT,
        validFrom: '2026-08-17T00:00:00.000Z',
        validUntil: '2026-12-19T00:00:00.000Z',
        reason: 'Disposable Section proof',
      }
    )
    assert.equal(roster.capacityExceeded, false)

    const teacherWorkspace = await getSectionWorkspace(
      databaseContext('teacher', `sections-teacher-read-${RUN_ID}`),
      teacherContext,
      teacherRead,
      SCHOOL_HIGH
    )
    assert.equal(
      teacherWorkspace.sections.some(({ id }) => id === sectionId),
      false
    )
    assert.equal(teacherWorkspace.rosterMemberships.length, 0)
    assert.equal(teacherWorkspace.studentCandidates.length, 0)

    await assert.rejects(
      getSectionWorkspace(
        databaseContext('school', `sections-sibling-${RUN_ID}`),
        schoolContext,
        schoolRead,
        SCHOOL_HIGH
      ),
      /POLICY_SCOPE_MISMATCH/
    )
    await assert.rejects(
      getSectionWorkspace(
        databaseContext('org', `sections-cross-${RUN_ID}`),
        orgContext,
        orgRead,
        TENANT_B_SCHOOL
      ),
      /POLICY_SCOPE_MISMATCH/
    )
    await assert.rejects(
      withPolicyTenantTransaction(
        databaseContext('org', `sections-direct-${RUN_ID}`),
        toDatabasePolicyContext(orgManage),
        (db) =>
          db.insert(courses).values({
            tenantId: TENANT_A,
            schoolId: SCHOOL_HIGH,
            code: `DIRECT-${RUN_ID.slice(0, 8)}`,
            name: 'Forbidden direct write',
            courseType: 'general',
            createdByAccountId: ORG_ADMIN_ACCOUNT,
            creationReason: 'Must fail',
          })
      )
    )

    await closeSection(
      databaseContext('org', `sections-close-${RUN_ID}`),
      orgContext,
      orgManage,
      sectionId,
      'Disposable Section proof complete'
    )
    const history = await getSectionWorkspace(
      databaseContext('org', `sections-history-${RUN_ID}`),
      orgContext,
      orgRead,
      SCHOOL_HIGH
    )
    assert.equal(history.sections.find(({ id }) => id === sectionId)?.status, 'closed')
    assert.equal(
      history.staffAssignments.find(({ sectionId: id }) => id === sectionId)?.status,
      'ended'
    )
    assert.equal(
      history.rosterMemberships.find(({ sectionId: id }) => id === sectionId)?.status,
      'ended'
    )
    console.info('Courses and Sections proof passed')
  } finally {
    if (sectionId) {
      await admin
        .delete(sectionRosterMemberships)
        .where(eq(sectionRosterMemberships.sectionId, sectionId))
      await admin
        .delete(sectionStaffAssignments)
        .where(eq(sectionStaffAssignments.sectionId, sectionId))
      await admin.delete(sections).where(eq(sections.id, sectionId))
    }
    if (courseId) await admin.delete(courses).where(eq(courses.id, courseId))
    await admin
      .delete(accountSessions)
      .where(
        inArray(accountSessions.providerSessionId, [ORG_SESSION, SCHOOL_SESSION, TEACHER_SESSION])
      )
    await admin.$client.end()
    await closeDatabaseExecutionPoolsForProof()
  }
}

await runProof()
