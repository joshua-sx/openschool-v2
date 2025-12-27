// Client-safe exports only (for use in client components)
export {
  createBrowserClient,
  createSupabaseClient,
  getSession,
  getUser,
} from './session'

// Server-only exports are available via '@openschool/auth/server'
// This prevents Next.js from bundling server-only code (like postgres) in client components