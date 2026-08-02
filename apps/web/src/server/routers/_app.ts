import { router } from '../trpc/context'
import { exampleRouter } from './example'
import { schoolsRouter } from './schools'
import { studentsRouter } from './students'

export const appRouter = router({
  example: exampleRouter,
  students: studentsRouter,
  schools: schoolsRouter,
})

export type AppRouter = typeof appRouter
