import {
  type CookieOptions,
  createBrowserClient as createBrowserClientSSR,
  createServerClient as createServerClientSSR,
} from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

interface ServerCookieStore {
  getAll(): Array<{ name: string; value: string }>
  set(name: string, value: string, options: CookieOptions): void
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      `Missing Supabase environment variables. NEXT_PUBLIC_SUPABASE_URL: ${
        url ? 'set' : 'missing'
      }, NEXT_PUBLIC_SUPABASE_ANON_KEY: ${
        key ? 'set' : 'missing'
      }. Please create apps/web/.env.local with these variables.`
    )
  }

  return { url, key }
}

// Legacy browser client (for backward compatibility)
export function createSupabaseClient() {
  const { url, key } = getSupabaseConfig()
  return createClient(url, key)
}

// SSR-compatible server client
export function createServerClient(cookieStore: ServerCookieStore) {
  const { url, key } = getSupabaseConfig()

  return createServerClientSSR(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you're using Server Components.
        }
      },
    },
  })
}

// Browser client for client components
export function createBrowserClient() {
  const { url, key } = getSupabaseConfig()
  return createBrowserClientSSR(url, key)
}

export async function getSession(supabase: ReturnType<typeof createSupabaseClient>) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

export async function getUser(supabase: ReturnType<typeof createSupabaseClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
