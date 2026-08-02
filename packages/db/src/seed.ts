import { getServerEnv } from '@openschool/config/server'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  classes,
  enrollments,
  grades,
  organizations,
  parentStudent,
  schools,
  students,
  teachersOnClass,
  users,
  usersOnOrg,
  usersOnSchool,
} from './schema'

const seed = {
  organizations: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Horizon Education Board',
      slug: 'horizon-education-board',
      settings: { locale: 'en', timezone: 'America/Lower_Princes' },
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Island Schools Trust',
      slug: 'island-schools-trust',
      settings: { locale: 'en', timezone: 'America/Lower_Princes' },
    },
  ] satisfies Array<typeof organizations.$inferInsert>,
  schools: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      orgId: '00000000-0000-4000-8000-000000000001',
      name: 'Horizon Primary School',
      slug: 'horizon-primary',
      academicYear: '2026-2027',
      terms: [{ name: 'Term 1', startsOn: '2026-08-17', endsOn: '2026-12-18' }],
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      orgId: '00000000-0000-4000-8000-000000000001',
      name: 'Horizon High School',
      slug: 'horizon-high',
      academicYear: '2026-2027',
      terms: [{ name: 'Semester 1', startsOn: '2026-08-17', endsOn: '2026-12-18' }],
    },
    {
      id: '00000000-0000-4000-8000-000000000103',
      orgId: '00000000-0000-4000-8000-000000000002',
      name: 'Island Community School',
      slug: 'island-community',
      academicYear: '2026-2027',
      terms: [{ name: 'Term 1', startsOn: '2026-08-17', endsOn: '2026-12-18' }],
    },
  ] satisfies Array<typeof schools.$inferInsert>,
  users: [
    {
      id: '00000000-0000-4000-8000-000000000201',
      email: 'org.admin@horizon.test',
      firstName: 'Avery',
      lastName: 'Morgan',
    },
    {
      id: '00000000-0000-4000-8000-000000000202',
      email: 'primary.admin@horizon.test',
      firstName: 'Jordan',
      lastName: 'Lee',
    },
    {
      id: '00000000-0000-4000-8000-000000000203',
      email: 'teacher@horizon.test',
      firstName: 'Taylor',
      lastName: 'James',
    },
    {
      id: '00000000-0000-4000-8000-000000000204',
      email: 'staff@horizon.test',
      firstName: 'Sam',
      lastName: 'Wilson',
    },
    {
      id: '00000000-0000-4000-8000-000000000205',
      email: 'parent@horizon.test',
      firstName: 'Riley',
      lastName: 'Brown',
    },
    {
      id: '00000000-0000-4000-8000-000000000206',
      email: 'org.viewer@horizon.test',
      firstName: 'Casey',
      lastName: 'Thomas',
    },
    {
      id: '00000000-0000-4000-8000-000000000207',
      email: 'org.admin@island.test',
      firstName: 'Alex',
      lastName: 'Martinez',
    },
  ] satisfies Array<typeof users.$inferInsert>,
  classes: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      schoolId: '00000000-0000-4000-8000-000000000101',
      name: 'Grade 5',
      gradeLevel: 5,
      academicYear: '2026-2027',
    },
    {
      id: '00000000-0000-4000-8000-000000000302',
      schoolId: '00000000-0000-4000-8000-000000000102',
      name: 'Grade 10 Mathematics',
      gradeLevel: 10,
      academicYear: '2026-2027',
    },
    {
      id: '00000000-0000-4000-8000-000000000303',
      schoolId: '00000000-0000-4000-8000-000000000103',
      name: 'Grade 7',
      gradeLevel: 7,
      academicYear: '2026-2027',
    },
  ] satisfies Array<typeof classes.$inferInsert>,
  students: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      schoolId: '00000000-0000-4000-8000-000000000101',
      firstName: 'Mia',
      lastName: 'Morgan',
      dateOfBirth: '2016-03-12',
      studentNumber: 'HPS-0001',
    },
    {
      id: '00000000-0000-4000-8000-000000000402',
      schoolId: '00000000-0000-4000-8000-000000000102',
      firstName: 'Noah',
      lastName: 'Brown',
      dateOfBirth: '2011-06-24',
      studentNumber: 'HHS-0001',
    },
    {
      id: '00000000-0000-4000-8000-000000000403',
      schoolId: '00000000-0000-4000-8000-000000000103',
      firstName: 'Ava',
      lastName: 'Martinez',
      dateOfBirth: '2014-01-08',
      studentNumber: 'ICS-0001',
    },
  ] satisfies Array<typeof students.$inferInsert>,
  usersOnOrg: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      userId: '00000000-0000-4000-8000-000000000201',
      orgId: '00000000-0000-4000-8000-000000000001',
      role: 'org_admin',
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      userId: '00000000-0000-4000-8000-000000000206',
      orgId: '00000000-0000-4000-8000-000000000001',
      role: 'org_viewer',
    },
    {
      id: '00000000-0000-4000-8000-000000000503',
      userId: '00000000-0000-4000-8000-000000000207',
      orgId: '00000000-0000-4000-8000-000000000002',
      role: 'org_admin',
    },
  ] satisfies Array<typeof usersOnOrg.$inferInsert>,
  usersOnSchool: [
    {
      id: '00000000-0000-4000-8000-000000000511',
      userId: '00000000-0000-4000-8000-000000000202',
      schoolId: '00000000-0000-4000-8000-000000000101',
      role: 'school_admin',
    },
    {
      id: '00000000-0000-4000-8000-000000000512',
      userId: '00000000-0000-4000-8000-000000000203',
      schoolId: '00000000-0000-4000-8000-000000000102',
      role: 'teacher',
    },
    {
      id: '00000000-0000-4000-8000-000000000513',
      userId: '00000000-0000-4000-8000-000000000204',
      schoolId: '00000000-0000-4000-8000-000000000102',
      role: 'staff',
    },
  ] satisfies Array<typeof usersOnSchool.$inferInsert>,
  teachersOnClass: [
    {
      id: '00000000-0000-4000-8000-000000000521',
      userId: '00000000-0000-4000-8000-000000000203',
      classId: '00000000-0000-4000-8000-000000000302',
      isPrimary: true,
    },
  ] satisfies Array<typeof teachersOnClass.$inferInsert>,
  parentStudent: [
    {
      id: '00000000-0000-4000-8000-000000000531',
      parentId: '00000000-0000-4000-8000-000000000205',
      studentId: '00000000-0000-4000-8000-000000000402',
      relationship: 'father',
    },
  ] satisfies Array<typeof parentStudent.$inferInsert>,
  enrollments: [
    {
      id: '00000000-0000-4000-8000-000000000601',
      studentId: '00000000-0000-4000-8000-000000000401',
      classId: '00000000-0000-4000-8000-000000000301',
    },
    {
      id: '00000000-0000-4000-8000-000000000602',
      studentId: '00000000-0000-4000-8000-000000000402',
      classId: '00000000-0000-4000-8000-000000000302',
    },
    {
      id: '00000000-0000-4000-8000-000000000603',
      studentId: '00000000-0000-4000-8000-000000000403',
      classId: '00000000-0000-4000-8000-000000000303',
    },
  ] satisfies Array<typeof enrollments.$inferInsert>,
  grades: [
    {
      id: '00000000-0000-4000-8000-000000000701',
      enrollmentId: '00000000-0000-4000-8000-000000000602',
      assignmentName: 'Algebra readiness check',
      score: '86.00',
      maxScore: '100.00',
      gradedBy: '00000000-0000-4000-8000-000000000203',
      gradedAt: new Date('2026-08-21T14:00:00Z'),
    },
  ] satisfies Array<typeof grades.$inferInsert>,
} as const

function valuesWithoutId<T extends { id: string }>(row: T): Omit<T, 'id'> {
  const { id: _, ...values } = row
  return values
}

function assertCount(label: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`Seed verification failed for ${label}: expected ${expected}, found ${actual}`)
  }
}

const sql = postgres(getServerEnv().DATABASE_URL, { prepare: false, max: 1 })
const db = drizzle(sql)

try {
  await db.transaction(async (tx) => {
    for (const row of seed.organizations) {
      await tx
        .insert(organizations)
        .values(row)
        .onConflictDoUpdate({ target: organizations.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.schools) {
      await tx
        .insert(schools)
        .values(row)
        .onConflictDoUpdate({ target: schools.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.users) {
      await tx
        .insert(users)
        .values(row)
        .onConflictDoUpdate({ target: users.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.classes) {
      await tx
        .insert(classes)
        .values(row)
        .onConflictDoUpdate({ target: classes.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.students) {
      await tx
        .insert(students)
        .values(row)
        .onConflictDoUpdate({ target: students.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.usersOnOrg) {
      await tx
        .insert(usersOnOrg)
        .values(row)
        .onConflictDoUpdate({ target: usersOnOrg.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.usersOnSchool) {
      await tx
        .insert(usersOnSchool)
        .values(row)
        .onConflictDoUpdate({ target: usersOnSchool.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.teachersOnClass) {
      await tx
        .insert(teachersOnClass)
        .values(row)
        .onConflictDoUpdate({ target: teachersOnClass.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.parentStudent) {
      await tx
        .insert(parentStudent)
        .values(row)
        .onConflictDoUpdate({ target: parentStudent.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.enrollments) {
      await tx
        .insert(enrollments)
        .values(row)
        .onConflictDoUpdate({ target: enrollments.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.grades) {
      await tx
        .insert(grades)
        .values(row)
        .onConflictDoUpdate({ target: grades.id, set: valuesWithoutId(row) })
    }
  })

  const seededOrganizations = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      inArray(
        organizations.id,
        seed.organizations.map(({ id }) => id)
      )
    )
  const seededSchools = await db
    .select({ id: schools.id })
    .from(schools)
    .where(
      inArray(
        schools.id,
        seed.schools.map(({ id }) => id)
      )
    )
  const seededUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      inArray(
        users.id,
        seed.users.map(({ id }) => id)
      )
    )
  const seededStudents = await db
    .select({ id: students.id })
    .from(students)
    .where(
      inArray(
        students.id,
        seed.students.map(({ id }) => id)
      )
    )
  const seededOrgRoles = await db
    .select({ id: usersOnOrg.id })
    .from(usersOnOrg)
    .where(
      inArray(
        usersOnOrg.id,
        seed.usersOnOrg.map(({ id }) => id)
      )
    )
  const seededSchoolRoles = await db
    .select({ id: usersOnSchool.id })
    .from(usersOnSchool)
    .where(
      inArray(
        usersOnSchool.id,
        seed.usersOnSchool.map(({ id }) => id)
      )
    )

  assertCount('organizations', seededOrganizations.length, seed.organizations.length)
  assertCount('schools', seededSchools.length, seed.schools.length)
  assertCount('users', seededUsers.length, seed.users.length)
  assertCount('students', seededStudents.length, seed.students.length)
  assertCount('organization roles', seededOrgRoles.length, seed.usersOnOrg.length)
  assertCount('school roles', seededSchoolRoles.length, seed.usersOnSchool.length)

  console.log(
    `Seed verified: ${seededOrganizations.length} organizations, ${seededSchools.length} schools, ` +
      `${seededUsers.length} users, ${seededStudents.length} students, ` +
      `${seededOrgRoles.length + seededSchoolRoles.length} role assignments.`
  )
} finally {
  await sql.end()
}
