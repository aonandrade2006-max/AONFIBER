import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, supabaseConfigured } from '../env.js'

let cachedAdmin: SupabaseClient | null = null
let cachedAnon: SupabaseClient | null = null

/** Service-role client. Never import this module into browser code. */
export function getAdminClient(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error('Supabase environment variables are missing.')
  }
  if (!cachedAdmin) {
    cachedAdmin = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'aon-fiber-api' } },
    })
  }
  return cachedAdmin
}

export function getAnonClient(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error('Supabase environment variables are missing.')
  }
  if (!cachedAnon) {
    cachedAnon = createClient(env.supabaseUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'aon-fiber-api' } },
    })
  }
  return cachedAnon
}

export type AuthUserProfile = {
  id: string
  email: string
  app_metadata?: Record<string, unknown> | null
  user_metadata?: { full_name?: string } | null
}

export async function getAuthUser(accessToken: string): Promise<AuthUserProfile | null> {
  const { data, error } = await getAnonClient().auth.getUser(accessToken)
  if (error || !data.user) return null
  return {
    id: data.user.id,
    email: data.user.email ?? '',
    app_metadata: data.user.app_metadata ?? null,
    user_metadata: data.user.user_metadata ?? null,
  }
}
