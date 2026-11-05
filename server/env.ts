
import 'dotenv/config'

function first(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value && value.trim().length > 0) return value.trim()
  }
  return ''
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  supabaseUrl: first(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL),
  anonKey: first(process.env.SUPABASE_ANON_KEY, process.env.VITE_SUPABASE_ANON_KEY),
  serviceRoleKey: first(process.env.SUPABASE_SERVICE_ROLE_KEY),
  appOrigin: first(process.env.APP_ORIGIN, 'http://localhost:5173'),
  otpPepper: first(process.env.OTP_PEPPER, 'local-development-pepper'),

  otpDevMode:
    process.env.OTP_DEMO_MODE === 'true' ||
    process.env.OTP_DEV_MODE === 'true' ||
    (process.env.OTP_DEV_MODE !== 'false' && process.env.NODE_ENV !== 'production'),

  notifyWebhookUrl: first(process.env.NOTIFY_WEBHOOK_URL),
  presenceTimeoutMs: Number(process.env.PRESENCE_TIMEOUT_MS ?? 120_000),
  isProduction: process.env.NODE_ENV === 'production',
}

export const supabaseConfigured = Boolean(
  env.supabaseUrl && env.anonKey && env.serviceRoleKey,
)

export function assertSupabaseConfigured(): void {
  if (!supabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and set SUPABASE_URL, ' +
        'SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
}
