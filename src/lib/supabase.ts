import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

export const supabaseConfigured = Boolean(url && anonKey)

/** Placeholder endpoint keeps the UI renderable before .env is filled in. */
const FALLBACK_URL = 'http://localhost:54321'
const FALLBACK_KEY = 'public-anon-key'

export type PortalAudience = 'admin' | 'staff' | 'customer'

/**
 * Every portal keeps its own Supabase auth session in its own localStorage key.
 * Sharing one key made a second sign-in (e.g. an employee in another tab)
 * overwrite the administrator's session and sign them out.
 */
export const AUTH_STORAGE_KEYS: Record<PortalAudience, string> = {
  admin: 'aon-fiber-admin-auth',
  staff: 'aon-fiber-staff-auth',
  customer: 'aon-fiber-customer-auth',
}

function build(audience: PortalAudience): SupabaseClient {
  return createClient(
    supabaseConfigured ? url : FALLBACK_URL,
    supabaseConfigured ? anonKey : FALLBACK_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: AUTH_STORAGE_KEYS[audience],
      },
    },
  )
}

/** Administrator portal session (only ever holds an admin sign-in). */
export const adminSupabase = build('admin')
/** Employee / branch manager portal session. */
export const staffSupabase = build('staff')
/** Customer portal session. */
export const customerSupabase = build('customer')

export function audienceForPath(pathname: string): PortalAudience {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin'
  if (pathname === '/portal' || pathname.startsWith('/portal/')) return 'customer'
  return 'staff'
}

export function clientForPath(pathname: string): SupabaseClient {
  const audience = audienceForPath(pathname)
  if (audience === 'admin') return adminSupabase
  if (audience === 'customer') return customerSupabase
  return staffSupabase
}

const initialPath = typeof window === 'undefined' ? '/' : window.location.pathname

/**
 * Client for the portal that loaded this page. Each portal is a separate page
 * load, so links between portals use full page loads (not client-side routing)
 * to pick the matching session. That keeps the three sessions independent.
 */
export const supabase = clientForPath(initialPath)

export const CONFIG_MESSAGE =
  'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env and restart the dev server.'
