import { router } from '../trpc/context'
import { exampleRouter } from './example'
import { studentsRouter } from './students'
import { onboardingRouter } from './onboarding'

export const appRouter = router({
  example: exampleRouter,
  students: studentsRouter,
  onboarding: onboardingRouter,
})

export type AppRouter = typeof appRouter

