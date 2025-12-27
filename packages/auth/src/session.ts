import { createClient } from '@supabase/supabase-js'

export function createSupabaseClient() {
  return createClient(
    [process.env.NEXT](http://process.env.NEXT)_PUBLIC_SUPABASE_URL!,
    [process.env.NEXT](http://process.env.NEXT)_PUBLIC_SUPABASE_ANON_KEY!
  )
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