import { getPublicEnv } from '@openschool/config/public'
import { getSupabaseAdminEnv } from '@openschool/config/server'
import { createClient } from '@supabase/supabase-js'

export interface MfaAdministrationAdapter {
  resetFactors(providerSubject: string): Promise<number>
}

interface SupabaseMfaAdminClient {
  auth: {
    admin: {
      mfa: {
        listFactors(input: { userId: string }): Promise<{
          data: { factors: readonly { id: string }[] } | null
          error: unknown | null
        }>
        deleteFactor(input: { userId: string; id: string }): Promise<{
          error: unknown | null
        }>
      }
    }
  }
}

export function supabaseMfaAdministrationAdapter(
  supabase: SupabaseMfaAdminClient
): MfaAdministrationAdapter {
  return Object.freeze({
    async resetFactors(providerSubject: string): Promise<number> {
      const listed = await supabase.auth.admin.mfa.listFactors({ userId: providerSubject })
      if (listed.error || !listed.data) {
        const error = new Error('SUPABASE_MFA_FACTOR_LIST_FAILED')
        error.cause = listed.error
        throw error
      }

      let deleted = 0
      for (const factor of listed.data.factors) {
        const result = await supabase.auth.admin.mfa.deleteFactor({
          userId: providerSubject,
          id: factor.id,
        })
        if (result.error) {
          const error = new Error('SUPABASE_MFA_FACTOR_DELETE_FAILED')
          error.cause = result.error
          throw error
        }
        deleted += 1
      }
      return deleted
    },
  })
}

export function createSupabaseMfaAdministrationAdapter(): MfaAdministrationAdapter {
  const publicEnvironment = getPublicEnv()
  const { SUPABASE_SECRET_KEY } = getSupabaseAdminEnv()
  const supabase = createClient(publicEnvironment.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return supabaseMfaAdministrationAdapter(supabase)
}
