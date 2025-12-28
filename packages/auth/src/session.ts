import { createClient } from '@supabase/supabase-js'
import { createBrowserClient as createBrowserClientSSR, createServerClient as createServerClientSSR } from '@supabase/ssr'

// Legacy browser client (for backward compatibility)
export function createSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// SSR-compatible server client
export function createServerClient(cookieStore: any) {
  return createServerClientSSR(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you're using Server Components.
          }
        },
      },
    }
  )
}

// Browser client for client components
export function createBrowserClient() {
  // #region agent log
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  fetch('http://127.0.0.1:7246/ingest/476ce0c7-201e-4257-ab00-c987a877a23c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/auth/src/session.ts:39',message:'createBrowserClient env check',data:{urlExists:!!url,keyExists:!!key,urlLength:url?.length||0,keyLength:key?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  if (!url || !key) {
    throw new Error(
      `Missing Supabase environment variables. ` +
      `NEXT_PUBLIC_SUPABASE_URL: ${url ? 'set' : 'missing'}, ` +
      `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${key ? 'set' : 'missing'}. ` +
      `Please create apps/web/.env.local with these variables.`
    );
  }
  
  return createBrowserClientSSR(url, key);
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