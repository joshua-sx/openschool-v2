import { router } from '../trpc/context'
import { exampleRouter } from './example'
import { studentsRouter } from './students'
import { schoolsRouter } from './schools'

export const appRouter = router({
  example: exampleRouter,
  students: studentsRouter,
  schools: schoolsRouter,
})

export type AppRouter = typeof appRouter

