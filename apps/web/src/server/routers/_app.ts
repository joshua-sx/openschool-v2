import { router } from '../trpc/context'
import { accountSecurityRouter } from './account-security'
import { exampleRouter } from './example'
import { invitationsRouter } from './invitations'
import { platformRouter } from './platform'
import { schoolsRouter } from './schools'
import { studentsRouter } from './students'

export const appRouter = router({
  example: exampleRouter,
  accountSecurity: accountSecurityRouter,
  students: studentsRouter,
  schools: schoolsRouter,
  invitations: invitationsRouter,
  platform: platformRouter,
})

export type AppRouter = typeof appRouter
