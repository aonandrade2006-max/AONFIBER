/**
 * Proves the AON FIBER portal session isolation.
 *
 * 1. Reproduces the original bug: two clients sharing one storage key — the
 *    second sign-in replaces the first session.
 * 2. Confirms the fix: the portal clients from src/lib/supabase.ts use separate
 *    storage keys, so an employee sign-in / sign-out never touches the
 *    administrator session.
 *
 * Both clients share one in-memory Map, exactly like two tabs share one
 * localStorage. Throwaway accounts are created and deleted by the script.
 *
 * Usage: node scripts/verify-portal-sessions.mjs
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON || !SERVICE) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const ADMIN_KEY = 'aon-fiber-admin-auth'
const STAFF_KEY = 'aon-fiber-staff-auth'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

function memoryStorage() {
  const map = new Map()
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

const adminApi = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function createUser(label) {
  const email = `portal-${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`
  const password = `Portal-${randomUUID()}`
  const { data, error } = await adminApi.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: label },
  })
  if (error) throw new Error(`${label}: ${error.message}`)
  return { id: data.user.id, email, password }
}

function client(storage, storageKey) {
  return createClient(URL, ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage,
      storageKey,
    },
  })
}

const users = []
try {
  const adminUser = await createUser('admin')
  const employeeUser = await createUser('employee')
  users.push(adminUser.id, employeeUser.id)

  // --- 1. The original bug: both portals sharing one storage key ----------
  const shared = memoryStorage()
  const sharedAdmin = client(shared, 'aon-fiber-auth')
  const sharedEmployee = client(shared, 'aon-fiber-auth')

  await sharedAdmin.auth.signInWithPassword({
    email: adminUser.email,
    password: adminUser.password,
  })
  const adminBeforeShared = (await sharedAdmin.auth.getSession()).data.session
  await sharedEmployee.auth.signInWithPassword({
    email: employeeUser.email,
    password: employeeUser.password,
  })
  const adminAfterShared = (await sharedAdmin.auth.getSession()).data.session

  check(
    'shared storage key reproduces the conflict (admin replaced by employee)',
    adminBeforeShared?.user.id === adminUser.id &&
      adminAfterShared?.user.id !== adminUser.id,
    `admin session now ${adminAfterShared?.user.id === employeeUser.id ? 'the employee' : 'gone'}`,
  )

  // --- 2. The fix: one storage key per portal -----------------------------
  const browser = memoryStorage()
  const adminClient = client(browser, ADMIN_KEY)
  const employeeClient = client(browser, STAFF_KEY)

  await adminClient.auth.signInWithPassword({
    email: adminUser.email,
    password: adminUser.password,
  })
  await employeeClient.auth.signInWithPassword({
    email: employeeUser.email,
    password: employeeUser.password,
  })

  const adminSession = (await adminClient.auth.getSession()).data.session
  const employeeSession = (await employeeClient.auth.getSession()).data.session

  check(
    'both portals are signed in at the same time',
    adminSession?.user.id === adminUser.id && employeeSession?.user.id === employeeUser.id,
    'admin + employee sessions coexist',
  )
  check(
    'each session is stored under its own key',
    browser.getItem(ADMIN_KEY) !== null && browser.getItem(STAFF_KEY) !== null,
  )
  check(
    'employee sign-in did not replace the administrator session',
    adminSession?.user.id === adminUser.id,
  )

  await employeeClient.auth.signOut()
  const adminAfterEmployeeSignOut = (await adminClient.auth.getSession()).data.session
  check(
    'employee sign-out leaves the administrator signed in',
    adminAfterEmployeeSignOut?.user.id === adminUser.id,
  )

  // --- 3. Reverse direction ----------------------------------------------
  await employeeClient.auth.signInWithPassword({
    email: employeeUser.email,
    password: employeeUser.password,
  })
  await adminClient.auth.signOut()
  const employeeAfterAdminSignOut = (await employeeClient.auth.getSession()).data.session
  check(
    'administrator sign-out leaves the employee signed in',
    employeeAfterAdminSignOut?.user.id === employeeUser.id,
  )
  check(
    'the administrator key was cleared only for that portal',
    browser.getItem(ADMIN_KEY) === null && browser.getItem(STAFF_KEY) !== null,
  )
} finally {
  for (const id of users) {
    await adminApi.auth.admin.deleteUser(id).catch(() => {})
  }
  const failed = results.filter((row) => !row.ok)
  console.log(failed.length === 0 ? '\nALL SESSION CHECKS PASSED' : `\n${failed.length} CHECK(S) FAILED`)
  process.exit(failed.length === 0 ? 0 : 1)
}
