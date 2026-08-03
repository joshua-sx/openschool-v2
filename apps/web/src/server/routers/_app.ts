import { router } from '../trpc/context'
import { accountSecurityRouter } from './account-security'
import { exampleRouter } from './example'
import { invitationsRouter } from './invitations'
import { schoolsRouter } from './schools'
import { studentsRouter } from './students'

export const appRouter = router({
  example: exampleRouter,
  accountSecurity: accountSecurityRouter,
  students: studentsRouter,
  schools: schoolsRouter,
  invitations: invitationsRouter,
})

export type AppRouter = typeof appRouter
