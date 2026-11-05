/**
 * Verifies public.audit_logs accepts an actor that has no public.profiles row.
 *
 * Customers sign in with their own Supabase auth user and are stored in
 * public.customers, so they have no profiles row. Before migration
 * 0005_audit_actor_scope.sql every customer-triggered audit entry failed with:
 *   insert or update on table "audit_logs" violates foreign key constraint
 *   "audit_logs_actor_id_fkey"
 *
 * The script creates a throwaway auth user without a profile, calls
 * public.log_audit() as that user and then removes both the throwaway user and
 * the audit row it produced. It never touches existing accounts or logs.
 *
 * Usage: node scripts/verify-audit-logging.mjs
 * Exit code 0 = audit logging works, 1 = still failing (run migration 0005).
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.SUPABASE_ANON_KEY

if (!url || !serviceKey || !anonKey) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const email = `audit-verify-${Date.now()}@example.com`
const password = `Verify-${randomUUID()}`

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: 'customer' },
})
if (createError || !created.user) {
  console.error('Could not create the throwaway auth user:', createError?.message)
  process.exit(1)
}

const userId = created.user.id
let failed = false

try {
  const { data: profileRow } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  console.log('throwaway auth user     :', userId)
  console.log('has a profiles row      :', Boolean(profileRow))

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`sign-in failed: ${signInError.message}`)

  const { error: rpcError } = await client.rpc('log_audit', {
    p_action: 'verify.audit_logging',
    p_entity_type: 'diagnostic',
    p_entity_id: userId,
    p_branch_id: null,
    p_details: { source: 'scripts/verify-audit-logging.mjs' },
  })

  if (rpcError) {
    failed = true
    console.log('log_audit result        : FAILED ->', rpcError.message)
  } else {
    const { data: rows } = await admin
      .from('audit_logs')
      .select('id, actor_id, actor_name, actor_role, action')
      .eq('entity_id', userId)
    console.log('log_audit result        : OK')
    for (const row of rows ?? []) {
      console.log(
        '  row                   :',
        row.action,
        '| actor_id:',
        row.actor_id,
        '| actor_name:',
        row.actor_name,
        '| actor_role:',
        row.actor_role,
      )
      await admin.from('audit_logs').delete().eq('id', row.id)
    }
  }
} catch (caught) {
  failed = true
  console.log('verification error      :', caught instanceof Error ? caught.message : caught)
} finally {
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  console.log('throwaway user removed  :', deleteError ? deleteError.message : 'yes')
}

if (failed) {
  console.log('\nAudit logging for customers still fails. Apply supabase/migrations/0005_audit_actor_scope.sql in the Supabase SQL Editor, then run this script again.')
  process.exit(1)
}

console.log('\nAudit logging accepts customer actors without a profiles row.')
process.exit(0)
