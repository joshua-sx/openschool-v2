import { getServerEnv } from '@openschool/config/server'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import {
  accountLinks,
  accounts,
  affiliations,
  classes,
  educationOrganizations,
  employeeProfiles,
  enrollments,
  grades,
  guardianProfiles,
  identityMigrationEvents,
  organizationTreeVersions,
  organizations,
  parentStudent,
  people,
  personRelationships,
  roleTemplateAssignments,
  schoolGovernanceAssignments,
  schools,
  studentProfiles,
  students,
  teacherProfiles,
  teachersOnClass,
  tenantPlacements,
  tenants,
  users,
  usersOnOrg,
  usersOnSchool,
} from './schema'
import { insertOrganizationTreeVersion } from './tenant-hierarchy'

const HORIZON_TENANT_ID = '00000000-0000-4000-8000-000000000001'
const ISLAND_TENANT_ID = '00000000-0000-4000-8000-000000000002'
const HORIZON_BOARD_ID = '00000000-0000-4000-8000-000000000011'
const HORIZON_NETWORK_ID = '00000000-0000-4000-8000-000000000012'
const HORIZON_DISTRICT_ID = '00000000-0000-4000-8000-000000000013'
const ISLAND_DISTRICT_ID = '00000000-0000-4000-8000-000000000021'

const seed = {
  tenants: [
    {
      id: HORIZON_TENANT_ID,
      name: 'Horizon Education System',
      slug: 'horizon-education-system',
      settings: { locale: 'en', timezone: 'America/Lower_Princes' },
    },
    {
      id: ISLAND_TENANT_ID,
      name: 'Island Schools Trust',
      slug: 'island-schools-trust-tenant',
      settings: { locale: 'en', timezone: 'America/Lower_Princes' },
    },
  ] satisfies Array<typeof tenants.$inferInsert>,
  tenantPlacements: [
    {
      id: '00000000-0000-4000-8000-000000000031',
      tenantId: HORIZON_TENANT_ID,
      adapter: 'pooled',
      placementKey: 'primary',
      region: 'sx',
    },
    {
      id: '00000000-0000-4000-8000-000000000032',
      tenantId: ISLAND_TENANT_ID,
      adapter: 'pooled',
      placementKey: 'primary',
      region: 'sx',
    },
  ] satisfies Array<typeof tenantPlacements.$inferInsert>,
  organizations: [
    {
      id: HORIZON_TENANT_ID,
      tenantId: HORIZON_TENANT_ID,
      name: 'Horizon Ministry of Education',
      slug: 'horizon-ministry-of-education',
      settings: { locale: 'en', timezone: 'America/Lower_Princes' },
    },
    {
      id: ISLAND_TENANT_ID,
      tenantId: ISLAND_TENANT_ID,
      name: 'Island Schools Trust',
      slug: 'island-schools-trust',
      settings: { locale: 'en', timezone: 'America/Lower_Princes' },
    },
  ] satisfies Array<typeof organizations.$inferInsert>,
  educationOrganizations: [
    {
      id: HORIZON_TENANT_ID,
      tenantId: HORIZON_TENANT_ID,
      legacyOrganizationId: HORIZON_TENANT_ID,
      name: 'Horizon Ministry of Education',
      slug: 'horizon-ministry',
      type: 'ministry',
    },
    {
      id: HORIZON_BOARD_ID,
      tenantId: HORIZON_TENANT_ID,
      name: 'Horizon Public School Board',
      slug: 'horizon-public-board',
      type: 'school_board',
    },
    {
      id: HORIZON_NETWORK_ID,
      tenantId: HORIZON_TENANT_ID,
      name: 'Horizon Secondary Network',
      slug: 'horizon-secondary-network',
      type: 'network',
    },
    {
      id: HORIZON_DISTRICT_ID,
      tenantId: HORIZON_TENANT_ID,
      name: 'Eastern Primary District',
      slug: 'eastern-primary-district',
      type: 'district',
    },
    {
      id: ISLAND_TENANT_ID,
      tenantId: ISLAND_TENANT_ID,
      legacyOrganizationId: ISLAND_TENANT_ID,
      name: 'Island Schools Trust',
      slug: 'island-schools-trust',
      type: 'network',
    },
    {
      id: ISLAND_DISTRICT_ID,
      tenantId: ISLAND_TENANT_ID,
      name: 'Island Community District',
      slug: 'island-community-district',
      type: 'district',
    },
  ] satisfies Array<typeof educationOrganizations.$inferInsert>,
  treeVersions: [
    {
      id: HORIZON_TENANT_ID,
      tenantId: HORIZON_TENANT_ID,
      version: 1,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      reason: 'Representative ministry, board, network, and district hierarchy',
      nodes: [
        { organizationId: HORIZON_TENANT_ID, parentOrganizationId: null },
        { organizationId: HORIZON_BOARD_ID, parentOrganizationId: HORIZON_TENANT_ID },
        { organizationId: HORIZON_NETWORK_ID, parentOrganizationId: HORIZON_TENANT_ID },
        { organizationId: HORIZON_DISTRICT_ID, parentOrganizationId: HORIZON_BOARD_ID },
      ],
    },
    {
      id: ISLAND_TENANT_ID,
      tenantId: ISLAND_TENANT_ID,
      version: 1,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      reason: 'Representative second-Tenant hierarchy',
      nodes: [
        { organizationId: ISLAND_TENANT_ID, parentOrganizationId: null },
        { organizationId: ISLAND_DISTRICT_ID, parentOrganizationId: ISLAND_TENANT_ID },
      ],
    },
  ],
  schools: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      tenantId: HORIZON_TENANT_ID,
      orgId: HORIZON_TENANT_ID,
      name: 'Horizon Primary School',
      slug: 'horizon-primary',
      profile: 'primary',
      academicYear: '2026-2027',
      terms: [{ name: 'Term 1', startsOn: '2026-08-17', endsOn: '2026-12-18' }],
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      tenantId: HORIZON_TENANT_ID,
      orgId: HORIZON_TENANT_ID,
      name: 'Horizon High School',
      slug: 'horizon-high',
      profile: 'secondary',
      academicYear: '2026-2027',
      terms: [{ name: 'Semester 1', startsOn: '2026-08-17', endsOn: '2026-12-18' }],
    },
    {
      id: '00000000-0000-4000-8000-000000000103',
      tenantId: ISLAND_TENANT_ID,
      orgId: ISLAND_TENANT_ID,
      name: 'Island Community School',
      slug: 'island-community',
      profile: 'all_through',
      academicYear: '2026-2027',
      terms: [{ name: 'Term 1', startsOn: '2026-08-17', endsOn: '2026-12-18' }],
    },
  ] satisfies Array<typeof schools.$inferInsert>,
  schoolGovernanceAssignments: [
    {
      id: '00000000-0000-4000-8000-000000000041',
      tenantId: HORIZON_TENANT_ID,
      schoolId: '00000000-0000-4000-8000-000000000101',
      educationOrganizationId: HORIZON_DISTRICT_ID,
      validFrom: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000042',
      tenantId: HORIZON_TENANT_ID,
      schoolId: '00000000-0000-4000-8000-000000000102',
      educationOrganizationId: HORIZON_NETWORK_ID,
      validFrom: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000043',
      tenantId: ISLAND_TENANT_ID,
      schoolId: '00000000-0000-4000-8000-000000000103',
      educationOrganizationId: ISLAND_DISTRICT_ID,
      validFrom: new Date('2026-01-01T00:00:00Z'),
    },
  ] satisfies Array<typeof schoolGovernanceAssignments.$inferInsert>,
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
      tenantId: HORIZON_TENANT_ID,
      schoolId: '00000000-0000-4000-8000-000000000101',
      name: 'Grade 5',
      gradeLevel: 5,
      academicYear: '2026-2027',
    },
    {
      id: '00000000-0000-4000-8000-000000000302',
      tenantId: HORIZON_TENANT_ID,
      schoolId: '00000000-0000-4000-8000-000000000102',
      name: 'Grade 10 Mathematics',
      gradeLevel: 10,
      academicYear: '2026-2027',
    },
    {
      id: '00000000-0000-4000-8000-000000000303',
      tenantId: ISLAND_TENANT_ID,
      schoolId: '00000000-0000-4000-8000-000000000103',
      name: 'Grade 7',
      gradeLevel: 7,
      academicYear: '2026-2027',
    },
  ] satisfies Array<typeof classes.$inferInsert>,
  students: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      tenantId: HORIZON_TENANT_ID,
      schoolId: '00000000-0000-4000-8000-000000000101',
      firstName: 'Mia',
      lastName: 'Morgan',
      dateOfBirth: '2016-03-12',
      studentNumber: 'HPS-0001',
    },
    {
      id: '00000000-0000-4000-8000-000000000402',
      tenantId: HORIZON_TENANT_ID,
      schoolId: '00000000-0000-4000-8000-000000000102',
      firstName: 'Noah',
      lastName: 'Brown',
      dateOfBirth: '2011-06-24',
      studentNumber: 'HHS-0001',
    },
    {
      id: '00000000-0000-4000-8000-000000000403',
      tenantId: ISLAND_TENANT_ID,
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
      tenantId: HORIZON_TENANT_ID,
      userId: '00000000-0000-4000-8000-000000000201',
      orgId: '00000000-0000-4000-8000-000000000001',
      role: 'org_admin',
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      tenantId: HORIZON_TENANT_ID,
      userId: '00000000-0000-4000-8000-000000000206',
      orgId: '00000000-0000-4000-8000-000000000001',
      role: 'org_viewer',
    },
    {
      id: '00000000-0000-4000-8000-000000000503',
      tenantId: ISLAND_TENANT_ID,
      userId: '00000000-0000-4000-8000-000000000207',
      orgId: '00000000-0000-4000-8000-000000000002',
      role: 'org_admin',
    },
  ] satisfies Array<typeof usersOnOrg.$inferInsert>,
  usersOnSchool: [
    {
      id: '00000000-0000-4000-8000-000000000511',
      tenantId: HORIZON_TENANT_ID,
      userId: '00000000-0000-4000-8000-000000000202',
      schoolId: '00000000-0000-4000-8000-000000000101',
      role: 'school_admin',
    },
    {
      id: '00000000-0000-4000-8000-000000000512',
      tenantId: HORIZON_TENANT_ID,
      userId: '00000000-0000-4000-8000-000000000203',
      schoolId: '00000000-0000-4000-8000-000000000102',
      role: 'teacher',
    },
    {
      id: '00000000-0000-4000-8000-000000000513',
      tenantId: HORIZON_TENANT_ID,
      userId: '00000000-0000-4000-8000-000000000204',
      schoolId: '00000000-0000-4000-8000-000000000102',
      role: 'staff',
    },
    {
      id: '00000000-0000-4000-8000-000000000514',
      tenantId: HORIZON_TENANT_ID,
      userId: '00000000-0000-4000-8000-000000000203',
      schoolId: '00000000-0000-4000-8000-000000000101',
      role: 'teacher',
    },
    {
      id: '00000000-0000-4000-8000-000000000515',
      tenantId: ISLAND_TENANT_ID,
      userId: '00000000-0000-4000-8000-000000000203',
      schoolId: '00000000-0000-4000-8000-000000000103',
      role: 'teacher',
    },
  ] satisfies Array<typeof usersOnSchool.$inferInsert>,
  teachersOnClass: [
    {
      id: '00000000-0000-4000-8000-000000000521',
      tenantId: HORIZON_TENANT_ID,
      userId: '00000000-0000-4000-8000-000000000203',
      classId: '00000000-0000-4000-8000-000000000302',
      isPrimary: true,
    },
  ] satisfies Array<typeof teachersOnClass.$inferInsert>,
  parentStudent: [
    {
      id: '00000000-0000-4000-8000-000000000531',
      tenantId: HORIZON_TENANT_ID,
      parentId: '00000000-0000-4000-8000-000000000205',
      studentId: '00000000-0000-4000-8000-000000000402',
      relationship: 'father',
    },
  ] satisfies Array<typeof parentStudent.$inferInsert>,
  enrollments: [
    {
      id: '00000000-0000-4000-8000-000000000601',
      tenantId: HORIZON_TENANT_ID,
      studentId: '00000000-0000-4000-8000-000000000401',
      classId: '00000000-0000-4000-8000-000000000301',
    },
    {
      id: '00000000-0000-4000-8000-000000000602',
      tenantId: HORIZON_TENANT_ID,
      studentId: '00000000-0000-4000-8000-000000000402',
      classId: '00000000-0000-4000-8000-000000000302',
    },
    {
      id: '00000000-0000-4000-8000-000000000603',
      tenantId: ISLAND_TENANT_ID,
      studentId: '00000000-0000-4000-8000-000000000403',
      classId: '00000000-0000-4000-8000-000000000303',
    },
  ] satisfies Array<typeof enrollments.$inferInsert>,
  grades: [
    {
      id: '00000000-0000-4000-8000-000000000701',
      tenantId: HORIZON_TENANT_ID,
      enrollmentId: '00000000-0000-4000-8000-000000000602',
      assignmentName: 'Algebra readiness check',
      score: '86.00',
      maxScore: '100.00',
      gradedBy: '00000000-0000-4000-8000-000000000203',
      gradedAt: new Date('2026-08-21T14:00:00Z'),
    },
  ] satisfies Array<typeof grades.$inferInsert>,
  accounts: [
    {
      id: '00000000-0000-4000-8000-000000000201',
      legacyUserId: '00000000-0000-4000-8000-000000000201',
      identityProvider: 'supabase',
      providerSubject: '00000000-0000-4000-8000-000000000201',
      primaryEmail: 'org.admin@horizon.test',
    },
    {
      id: '00000000-0000-4000-8000-000000000202',
      legacyUserId: '00000000-0000-4000-8000-000000000202',
      identityProvider: 'supabase',
      providerSubject: '00000000-0000-4000-8000-000000000202',
      primaryEmail: 'primary.admin@horizon.test',
    },
    {
      id: '00000000-0000-4000-8000-000000000203',
      legacyUserId: '00000000-0000-4000-8000-000000000203',
      identityProvider: 'supabase',
      providerSubject: '00000000-0000-4000-8000-000000000203',
      primaryEmail: 'teacher@horizon.test',
    },
    {
      id: '00000000-0000-4000-8000-000000000204',
      legacyUserId: '00000000-0000-4000-8000-000000000204',
      identityProvider: 'supabase',
      providerSubject: '00000000-0000-4000-8000-000000000204',
      primaryEmail: 'staff@horizon.test',
    },
    {
      id: '00000000-0000-4000-8000-000000000205',
      legacyUserId: '00000000-0000-4000-8000-000000000205',
      identityProvider: 'supabase',
      providerSubject: '00000000-0000-4000-8000-000000000205',
      primaryEmail: 'parent@horizon.test',
    },
    {
      id: '00000000-0000-4000-8000-000000000206',
      legacyUserId: '00000000-0000-4000-8000-000000000206',
      identityProvider: 'supabase',
      providerSubject: '00000000-0000-4000-8000-000000000206',
      primaryEmail: 'org.viewer@horizon.test',
    },
    {
      id: '00000000-0000-4000-8000-000000000207',
      legacyUserId: '00000000-0000-4000-8000-000000000207',
      identityProvider: 'supabase',
      providerSubject: '00000000-0000-4000-8000-000000000207',
      primaryEmail: 'org.admin@island.test',
    },
  ] satisfies Array<typeof accounts.$inferInsert>,
  people: [
    {
      id: '00000000-0000-4000-8000-000000000901',
      tenantId: HORIZON_TENANT_ID,
      legacyUserId: '00000000-0000-4000-8000-000000000201',
      displayName: 'Avery Morgan',
      normalizedDisplayName: 'avery morgan',
      firstName: 'Avery',
      lastName: 'Morgan',
      email: 'org.admin@horizon.test',
      normalizedEmail: 'org.admin@horizon.test',
      source: 'legacy_user',
    },
    {
      id: '00000000-0000-4000-8000-000000000902',
      tenantId: HORIZON_TENANT_ID,
      legacyUserId: '00000000-0000-4000-8000-000000000202',
      displayName: 'Jordan Lee',
      normalizedDisplayName: 'jordan lee',
      firstName: 'Jordan',
      lastName: 'Lee',
      email: 'primary.admin@horizon.test',
      normalizedEmail: 'primary.admin@horizon.test',
      source: 'legacy_user',
    },
    {
      id: '00000000-0000-4000-8000-000000000903',
      tenantId: HORIZON_TENANT_ID,
      legacyUserId: '00000000-0000-4000-8000-000000000203',
      displayName: 'Taylor James',
      normalizedDisplayName: 'taylor james',
      firstName: 'Taylor',
      lastName: 'James',
      email: 'teacher@horizon.test',
      normalizedEmail: 'teacher@horizon.test',
      source: 'legacy_user',
    },
    {
      id: '00000000-0000-4000-8000-000000000904',
      tenantId: ISLAND_TENANT_ID,
      legacyUserId: '00000000-0000-4000-8000-000000000203',
      displayName: 'Taylor James',
      normalizedDisplayName: 'taylor james',
      firstName: 'Taylor',
      lastName: 'James',
      email: 'teacher@horizon.test',
      normalizedEmail: 'teacher@horizon.test',
      source: 'legacy_user',
    },
    {
      id: '00000000-0000-4000-8000-000000000905',
      tenantId: HORIZON_TENANT_ID,
      legacyUserId: '00000000-0000-4000-8000-000000000204',
      displayName: 'Sam Wilson',
      normalizedDisplayName: 'sam wilson',
      firstName: 'Sam',
      lastName: 'Wilson',
      email: 'staff@horizon.test',
      normalizedEmail: 'staff@horizon.test',
      source: 'legacy_user',
    },
    {
      id: '00000000-0000-4000-8000-000000000906',
      tenantId: HORIZON_TENANT_ID,
      legacyUserId: '00000000-0000-4000-8000-000000000205',
      displayName: 'Riley Brown',
      normalizedDisplayName: 'riley brown',
      firstName: 'Riley',
      lastName: 'Brown',
      email: 'parent@horizon.test',
      normalizedEmail: 'parent@horizon.test',
      source: 'legacy_user',
    },
    {
      id: '00000000-0000-4000-8000-000000000907',
      tenantId: HORIZON_TENANT_ID,
      legacyUserId: '00000000-0000-4000-8000-000000000206',
      displayName: 'Casey Thomas',
      normalizedDisplayName: 'casey thomas',
      firstName: 'Casey',
      lastName: 'Thomas',
      email: 'org.viewer@horizon.test',
      normalizedEmail: 'org.viewer@horizon.test',
      source: 'legacy_user',
    },
    {
      id: '00000000-0000-4000-8000-000000000908',
      tenantId: ISLAND_TENANT_ID,
      legacyUserId: '00000000-0000-4000-8000-000000000207',
      displayName: 'Alex Martinez',
      normalizedDisplayName: 'alex martinez',
      firstName: 'Alex',
      lastName: 'Martinez',
      email: 'org.admin@island.test',
      normalizedEmail: 'org.admin@island.test',
      source: 'legacy_user',
    },
    {
      id: '00000000-0000-4000-8000-000000000911',
      tenantId: HORIZON_TENANT_ID,
      legacyStudentId: '00000000-0000-4000-8000-000000000401',
      displayName: 'Mia Morgan',
      normalizedDisplayName: 'mia morgan',
      firstName: 'Mia',
      lastName: 'Morgan',
      dateOfBirth: '2016-03-12',
      source: 'legacy_student',
    },
    {
      id: '00000000-0000-4000-8000-000000000912',
      tenantId: HORIZON_TENANT_ID,
      legacyStudentId: '00000000-0000-4000-8000-000000000402',
      displayName: 'Noah Brown',
      normalizedDisplayName: 'noah brown',
      firstName: 'Noah',
      lastName: 'Brown',
      dateOfBirth: '2011-06-24',
      source: 'legacy_student',
    },
    {
      id: '00000000-0000-4000-8000-000000000913',
      tenantId: ISLAND_TENANT_ID,
      legacyStudentId: '00000000-0000-4000-8000-000000000403',
      displayName: 'Ava Martinez',
      normalizedDisplayName: 'ava martinez',
      firstName: 'Ava',
      lastName: 'Martinez',
      dateOfBirth: '2014-01-08',
      source: 'legacy_student',
    },
  ] satisfies Array<typeof people.$inferInsert>,
  accountLinks: [
    ['921', HORIZON_TENANT_ID, '201', '901'],
    ['922', HORIZON_TENANT_ID, '202', '902'],
    ['923', HORIZON_TENANT_ID, '203', '903'],
    ['924', ISLAND_TENANT_ID, '203', '904'],
    ['925', HORIZON_TENANT_ID, '204', '905'],
    ['926', HORIZON_TENANT_ID, '205', '906'],
    ['927', HORIZON_TENANT_ID, '206', '907'],
    ['928', ISLAND_TENANT_ID, '207', '908'],
  ].map(([suffix, tenantId, accountSuffix, personSuffix]) => ({
    id: `00000000-0000-4000-8000-000000000${suffix}`,
    tenantId,
    accountId: `00000000-0000-4000-8000-000000000${accountSuffix}`,
    personId: `00000000-0000-4000-8000-000000000${personSuffix}`,
    status: 'active' as const,
    validFrom: new Date('2026-01-01T00:00:00Z'),
    issuanceReason: 'Accepted representative development fixture',
    activatedAt: new Date('2026-01-01T00:00:00Z'),
  })) satisfies Array<typeof accountLinks.$inferInsert>,
  studentProfiles: [
    ['911', HORIZON_TENANT_ID, '401', 'HPS-0001'],
    ['912', HORIZON_TENANT_ID, '402', 'HHS-0001'],
    ['913', ISLAND_TENANT_ID, '403', 'ICS-0001'],
  ].map(([personSuffix, tenantId, studentSuffix, studentNumber]) => ({
    tenantId,
    personId: `00000000-0000-4000-8000-000000000${personSuffix}`,
    legacyStudentId: `00000000-0000-4000-8000-000000000${studentSuffix}`,
    studentNumber,
  })) satisfies Array<typeof studentProfiles.$inferInsert>,
  guardianProfiles: [
    {
      tenantId: HORIZON_TENANT_ID,
      personId: '00000000-0000-4000-8000-000000000906',
    },
  ] satisfies Array<typeof guardianProfiles.$inferInsert>,
  employeeProfiles: [
    ['902', HORIZON_TENANT_ID, 'School administrator'],
    ['903', HORIZON_TENANT_ID, 'Teacher'],
    ['904', ISLAND_TENANT_ID, 'Teacher'],
    ['905', HORIZON_TENANT_ID, 'Staff'],
  ].map(([personSuffix, tenantId, jobTitle]) => ({
    tenantId,
    personId: `00000000-0000-4000-8000-000000000${personSuffix}`,
    jobTitle,
  })) satisfies Array<typeof employeeProfiles.$inferInsert>,
  teacherProfiles: [
    ['903', HORIZON_TENANT_ID],
    ['904', ISLAND_TENANT_ID],
  ].map(([personSuffix, tenantId]) => ({
    tenantId,
    personId: `00000000-0000-4000-8000-000000000${personSuffix}`,
  })) satisfies Array<typeof teacherProfiles.$inferInsert>,
  affiliations: [
    ['951', HORIZON_TENANT_ID, '901', 'administrator', 'education_organization', '001'],
    ['952', HORIZON_TENANT_ID, '907', 'member', 'education_organization', '001'],
    ['953', ISLAND_TENANT_ID, '908', 'administrator', 'education_organization', '002'],
    ['954', HORIZON_TENANT_ID, '902', 'administrator', 'school', '101'],
    ['955', HORIZON_TENANT_ID, '903', 'teacher', 'school', '102'],
    ['956', HORIZON_TENANT_ID, '905', 'employee', 'school', '102'],
    ['957', HORIZON_TENANT_ID, '903', 'teacher', 'school', '101'],
    ['958', ISLAND_TENANT_ID, '904', 'teacher', 'school', '103'],
    ['959', HORIZON_TENANT_ID, '903', 'teacher', 'class', '302'],
    ['961', HORIZON_TENANT_ID, '911', 'student', 'school', '101'],
    ['962', HORIZON_TENANT_ID, '912', 'student', 'school', '102'],
    ['963', ISLAND_TENANT_ID, '913', 'student', 'school', '103'],
    ['964', HORIZON_TENANT_ID, '906', 'guardian', 'tenant', ''],
  ].map(([suffix, tenantId, personSuffix, kind, scopeType, scopeSuffix]) => ({
    id: `00000000-0000-4000-8000-000000000${suffix}`,
    tenantId,
    personId: `00000000-0000-4000-8000-000000000${personSuffix}`,
    kind: kind as 'administrator' | 'member' | 'teacher' | 'employee' | 'student' | 'guardian',
    scopeType: scopeType as 'education_organization' | 'school' | 'class' | 'tenant',
    educationOrganizationId:
      scopeType === 'education_organization'
        ? `00000000-0000-4000-8000-000000000${scopeSuffix}`
        : undefined,
    schoolId:
      scopeType === 'school' ? `00000000-0000-4000-8000-000000000${scopeSuffix}` : undefined,
    classId: scopeType === 'class' ? `00000000-0000-4000-8000-000000000${scopeSuffix}` : undefined,
    validFrom: new Date('2026-01-01T00:00:00Z'),
    issuanceReason: 'Representative identity foundation fixture',
  })) satisfies Array<typeof affiliations.$inferInsert>,
  roleTemplateAssignments: [
    ['971', '951', 'org_admin'],
    ['972', '952', 'org_viewer'],
    ['973', '953', 'org_admin'],
    ['974', '954', 'school_admin'],
    ['975', '955', 'teacher'],
    ['976', '956', 'staff'],
    ['977', '957', 'teacher'],
    ['978', '958', 'teacher'],
    ['979', '959', 'teacher'],
    ['981', '961', 'student'],
    ['982', '962', 'student'],
    ['983', '963', 'student'],
    ['984', '964', 'parent'],
  ].map(([suffix, affiliationSuffix, roleTemplateKey]) => {
    const affiliation = seedAffiliationTenant(affiliationSuffix)
    return {
      id: `00000000-0000-4000-8000-000000000${suffix}`,
      tenantId: affiliation,
      affiliationId: `00000000-0000-4000-8000-000000000${affiliationSuffix}`,
      roleTemplateKey,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      issuanceReason: 'Representative identity foundation fixture',
    }
  }) satisfies Array<typeof roleTemplateAssignments.$inferInsert>,
  personRelationships: [
    {
      id: '00000000-0000-4000-8000-000000000991',
      tenantId: HORIZON_TENANT_ID,
      subjectPersonId: '00000000-0000-4000-8000-000000000906',
      relatedPersonId: '00000000-0000-4000-8000-000000000912',
      type: 'parent_of',
      validFrom: new Date('2026-01-01T00:00:00Z'),
      issuanceReason: 'Representative identity foundation fixture',
    },
  ] satisfies Array<typeof personRelationships.$inferInsert>,
  identityMigrationEvents: [
    ['941', '921', HORIZON_TENANT_ID, '201', '901'],
    ['942', '922', HORIZON_TENANT_ID, '202', '902'],
    ['943', '923', HORIZON_TENANT_ID, '203', '903'],
    ['944', '924', ISLAND_TENANT_ID, '203', '904'],
    ['945', '925', HORIZON_TENANT_ID, '204', '905'],
    ['946', '926', HORIZON_TENANT_ID, '205', '906'],
    ['947', '927', HORIZON_TENANT_ID, '206', '907'],
    ['948', '928', ISLAND_TENANT_ID, '207', '908'],
  ].map(([suffix, linkSuffix, tenantId, accountSuffix, personSuffix]) => ({
    id: `00000000-0000-4000-8000-000000000${suffix}`,
    tenantId,
    accountId: `00000000-0000-4000-8000-000000000${accountSuffix}`,
    personId: `00000000-0000-4000-8000-000000000${personSuffix}`,
    accountLinkId: `00000000-0000-4000-8000-000000000${linkSuffix}`,
    eventType: 'account_link_backfilled' as const,
    membershipVersion: 1,
    evidence: { fixture: true },
  })) satisfies Array<typeof identityMigrationEvents.$inferInsert>,
} as const

function seedAffiliationTenant(affiliationSuffix: string): string {
  return affiliationSuffix === '953' || affiliationSuffix === '958' || affiliationSuffix === '963'
    ? ISLAND_TENANT_ID
    : HORIZON_TENANT_ID
}

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
const db = drizzle(sql, { schema })

try {
  await db.transaction(async (tx) => {
    for (const row of seed.tenants) {
      await tx
        .insert(tenants)
        .values(row)
        .onConflictDoUpdate({ target: tenants.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.tenantPlacements) {
      await tx
        .insert(tenantPlacements)
        .values(row)
        .onConflictDoUpdate({
          target: tenantPlacements.tenantId,
          set: valuesWithoutId(row),
        })
    }
    for (const row of seed.organizations) {
      await tx
        .insert(organizations)
        .values(row)
        .onConflictDoUpdate({ target: organizations.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.educationOrganizations) {
      await tx
        .insert(educationOrganizations)
        .values(row)
        .onConflictDoUpdate({
          target: educationOrganizations.id,
          set: valuesWithoutId(row),
        })
    }
    for (const treeVersion of seed.treeVersions) {
      await insertOrganizationTreeVersion(tx, treeVersion)
    }
    for (const row of seed.schools) {
      await tx
        .insert(schools)
        .values(row)
        .onConflictDoUpdate({ target: schools.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.schoolGovernanceAssignments) {
      await tx
        .insert(schoolGovernanceAssignments)
        .values(row)
        .onConflictDoUpdate({
          target: schoolGovernanceAssignments.id,
          set: valuesWithoutId(row),
        })
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
    for (const row of seed.accounts) {
      await tx
        .insert(accounts)
        .values(row)
        .onConflictDoUpdate({ target: accounts.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.people) {
      await tx
        .insert(people)
        .values(row)
        .onConflictDoUpdate({ target: people.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.accountLinks) {
      await tx
        .insert(accountLinks)
        .values(row)
        .onConflictDoUpdate({ target: accountLinks.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.studentProfiles) {
      await tx
        .insert(studentProfiles)
        .values(row)
        .onConflictDoUpdate({
          target: [studentProfiles.tenantId, studentProfiles.personId],
          set: {
            legacyStudentId: row.legacyStudentId,
            studentNumber: row.studentNumber,
          },
        })
    }
    for (const row of seed.guardianProfiles) {
      await tx.insert(guardianProfiles).values(row).onConflictDoNothing()
    }
    for (const row of seed.employeeProfiles) {
      await tx
        .insert(employeeProfiles)
        .values(row)
        .onConflictDoUpdate({
          target: [employeeProfiles.tenantId, employeeProfiles.personId],
          set: { jobTitle: row.jobTitle },
        })
    }
    for (const row of seed.teacherProfiles) {
      await tx.insert(teacherProfiles).values(row).onConflictDoNothing()
    }
    for (const row of seed.affiliations) {
      await tx
        .insert(affiliations)
        .values(row)
        .onConflictDoUpdate({ target: affiliations.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.roleTemplateAssignments) {
      await tx
        .insert(roleTemplateAssignments)
        .values(row)
        .onConflictDoUpdate({
          target: roleTemplateAssignments.id,
          set: valuesWithoutId(row),
        })
    }
    for (const row of seed.personRelationships) {
      await tx
        .insert(personRelationships)
        .values(row)
        .onConflictDoUpdate({ target: personRelationships.id, set: valuesWithoutId(row) })
    }
    for (const row of seed.identityMigrationEvents) {
      await tx.insert(identityMigrationEvents).values(row).onConflictDoNothing()
    }
  })

  const seededTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(
      inArray(
        tenants.id,
        seed.tenants.map(({ id }) => id)
      )
    )
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

  const seededEducationOrganizations = await db
    .select({ id: educationOrganizations.id })
    .from(educationOrganizations)
    .where(
      inArray(
        educationOrganizations.id,
        seed.educationOrganizations.map(({ id }) => id)
      )
    )
  const seededTreeVersions = await db
    .select({ id: organizationTreeVersions.id })
    .from(organizationTreeVersions)
    .where(
      inArray(
        organizationTreeVersions.id,
        seed.treeVersions.map(({ id }) => id)
      )
    )
  const seededGovernanceAssignments = await db
    .select({ id: schoolGovernanceAssignments.id })
    .from(schoolGovernanceAssignments)
    .where(
      inArray(
        schoolGovernanceAssignments.id,
        seed.schoolGovernanceAssignments.map(({ id }) => id)
      )
    )

  const seededAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      inArray(
        accounts.id,
        seed.accounts.map(({ id }) => id)
      )
    )
  const seededPeople = await db
    .select({ id: people.id })
    .from(people)
    .where(
      inArray(
        people.id,
        seed.people.map(({ id }) => id)
      )
    )
  const seededAccountLinks = await db
    .select({ id: accountLinks.id })
    .from(accountLinks)
    .where(
      inArray(
        accountLinks.id,
        seed.accountLinks.map(({ id }) => id)
      )
    )
  const seededAffiliations = await db
    .select({ id: affiliations.id })
    .from(affiliations)
    .where(
      inArray(
        affiliations.id,
        seed.affiliations.map(({ id }) => id)
      )
    )
  const seededRoleTemplateAssignments = await db
    .select({ id: roleTemplateAssignments.id })
    .from(roleTemplateAssignments)
    .where(
      inArray(
        roleTemplateAssignments.id,
        seed.roleTemplateAssignments.map(({ id }) => id)
      )
    )
  const seededRelationships = await db
    .select({ id: personRelationships.id })
    .from(personRelationships)
    .where(
      inArray(
        personRelationships.id,
        seed.personRelationships.map(({ id }) => id)
      )
    )

  assertCount('tenants', seededTenants.length, seed.tenants.length)
  assertCount('organizations', seededOrganizations.length, seed.organizations.length)
  assertCount(
    'education organizations',
    seededEducationOrganizations.length,
    seed.educationOrganizations.length
  )
  assertCount('tree versions', seededTreeVersions.length, seed.treeVersions.length)
  assertCount('schools', seededSchools.length, seed.schools.length)
  assertCount(
    'School governance assignments',
    seededGovernanceAssignments.length,
    seed.schoolGovernanceAssignments.length
  )
  assertCount('users', seededUsers.length, seed.users.length)
  assertCount('students', seededStudents.length, seed.students.length)
  assertCount('organization roles', seededOrgRoles.length, seed.usersOnOrg.length)
  assertCount('school roles', seededSchoolRoles.length, seed.usersOnSchool.length)
  assertCount('accounts', seededAccounts.length, seed.accounts.length)
  assertCount('people', seededPeople.length, seed.people.length)
  assertCount('Account Links', seededAccountLinks.length, seed.accountLinks.length)
  assertCount('affiliations', seededAffiliations.length, seed.affiliations.length)
  assertCount(
    'Role Template assignments',
    seededRoleTemplateAssignments.length,
    seed.roleTemplateAssignments.length
  )
  assertCount('Person relationships', seededRelationships.length, seed.personRelationships.length)

  console.log(
    `Seed verified: ${seededTenants.length} tenants, ` +
      `${seededEducationOrganizations.length} education organizations, ` +
      `${seededSchools.length} schools, ` +
      `${seededUsers.length} accounts, ${seededPeople.length} people, ` +
      `${seededStudents.length} students without required login, ` +
      `${seededAffiliations.length} effective affiliations.`
  )
} finally {
  await sql.end()
}
