import { router } from '../trpc/context'
import { academicStructureRouter } from './academic-structure'
import { accountSecurityRouter } from './account-security'
import { duplicatePeopleRouter } from './duplicate-people'
import { exampleRouter } from './example'
import { guardianContactsRouter } from './guardian-contacts'
import { householdsRouter } from './households'
import { invitationsRouter } from './invitations'
import { platformRouter } from './platform'
import { schoolsRouter } from './schools'
import { sectionsRouter } from './sections'
import { studentEnrollmentsRouter } from './student-enrollments'
import { studentsRouter } from './students'
import { supportAccessRouter } from './support-access'

export const appRouter = router({
  example: exampleRouter,
  guardianContacts: guardianContactsRouter,
  households: householdsRouter,
  accountSecurity: accountSecurityRouter,
  academicStructure: academicStructureRouter,
  students: studentsRouter,
  studentEnrollments: studentEnrollmentsRouter,
  schools: schoolsRouter,
  sections: sectionsRouter,
  duplicatePeople: duplicatePeopleRouter,
  invitations: invitationsRouter,
  platform: platformRouter,
  supportAccess: supportAccessRouter,
})

export type AppRouter = typeof appRouter
