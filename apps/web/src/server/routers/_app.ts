import { router } from '../trpc/context'
import { exampleRouter } from './example'
import { studentsRouter } from './students'

export const appRouter = router({
  example: exampleRouter,
  students: studentsRouter,
})

export type AppRouter = typeof appRouter

