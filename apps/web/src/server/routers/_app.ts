import { router } from '../trpc/context'
import { exampleRouter } from './example'
import { invitationsRouter } from './invitations'
import { schoolsRouter } from './schools'
import { studentsRouter } from './students'

export const appRouter = router({
  example: exampleRouter,
  students: studentsRouter,
  schools: schoolsRouter,
  invitations: invitationsRouter,
})

export type AppRouter = typeof appRouter
