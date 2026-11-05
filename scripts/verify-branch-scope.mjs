/**
 * Verifies branch access control end to end.
 *
 *   - Employees and branch managers are blocked from another branch's records
 *     by the API (assertBranchScope) and by Row Level Security.
 *   - Administrators keep system-wide access.
 *
 * Creates throwaway staff accounts and customers in two branches, runs the
 * checks, then deletes everything it created. Requires the API to be running
 * (`npm run dev`) and SUPABASE_* keys in .env.
 *
 * Usage: node scripts/verify-branch-scope.mjs
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const API = process.env.API_BASE ?? 'http://127.0.0.1:8787'
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const anonKey = process.env.SUPABASE_ANON_KEY

const authUserIds = []
const customerIds = []
const results = []

function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

async function makeStaff(role, branchId, canCreate = false) {
  const email = `scope-${role}-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`
  const password = `Scope-${randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  })
  if (error) throw new Error(`createUser ${role}: ${error.message}`)
  authUserIds.push(data.user.id)

  const { error: profileError } = await admin.from('profiles').insert({
    id: data.user.id,
    full_name: `Scope ${role}`,
    email,
    role,
    branch_id: branchId,
    status: 'active',
    can_create_employees: canCreate,
  })
  if (profileError) throw new Error(`profile ${role}: ${profileError.message}`)

  const client = createClient(process.env.SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) throw new Error(`sign-in ${role}: ${signInError.message}`)
  return { id: data.user.id, client, token: session.session.access_token }
}

async function makeCustomer(branchId, label) {
  const { data, error } = await admin
    .from('customers')
    .insert({
      full_name: `${label} Customer`,
      contact_number: '09171234567',
      address: '1 Scope Test Street',
      city: 'Test City',
      branch_id: branchId,
      installation_status: 'not_scheduled',
    })
    .select('id, account_number, branch_id')
    .single()
  if (error) throw new Error(`customer ${label}: ${error.message}`)
  customerIds.push(data.id)
  return data
}

async function post(path, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, message: json?.message ?? '' }
}

async function postBody(path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, message: json?.message ?? '' }
}

async function cleanup() {
  for (const id of customerIds) {
    await admin.from('support_tickets').delete().eq('customer_id', id)
    await admin.from('installations').delete().eq('customer_id', id)
    await admin.from('account_change_requests').delete().eq('customer_id', id)
    await admin.from('audit_logs').delete().eq('entity_id', id)
    await admin.from('customers').delete().eq('id', id)
  }
  for (const id of authUserIds) {
    await admin.from('audit_logs').delete().eq('entity_id', id)
    await admin.from('employee_presence').delete().eq('profile_id', id)
    await admin.from('profiles').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
}

const { data: branches } = await admin
  .from('branches')
  .select('id, name')
  .eq('is_active', true)
  .limit(2)

if (!branches || branches.length < 2) {
  console.error('Need two active branches to verify branch scope.')
}
const [branchA, branchB] = branches ?? []

try {
  const employee = await makeStaff('employee', branchA.id)
  const manager = await makeStaff('branch_manager', branchA.id, true)
  const adminStaff = await makeStaff('admin', null)

  const customerA = await makeCustomer(branchA.id, 'Own Branch')
  const customerB = await makeCustomer(branchB.id, 'Other Branch')

  // --- API scope checks (service-role routes) -------------------------
  const ticketOut = await postBody(`/api/staff/customers/${customerB.id}/tickets`, employee.token, {
    category: 'technical',
    subject: 'Cross branch attempt',
    description: 'This must be refused by branch scope validation.',
  })
  check(
    'employee cannot open a ticket on another branch customer',
    ticketOut.status === 403,
    `status ${ticketOut.status}`,
  )

  const installOut = await post(`/api/staff/customers/${customerB.id}/installations`, employee.token)
  check(
    'employee cannot request installation for another branch customer',
    installOut.status === 403,
    `status ${installOut.status}`,
  )

  const changeOut = await postBody(
    `/api/staff/customers/${customerB.id}/change-requests`,
    employee.token,
    { reason: 'Attempting a cross branch correction request.', changes: { city: 'Elsewhere' } },
  )
  check(
    'employee cannot file a correction for another branch customer',
    changeOut.status === 403,
    `status ${changeOut.status}`,
  )

  const ticketIn = await postBody(`/api/staff/customers/${customerA.id}/tickets`, employee.token, {
    category: 'technical',
    subject: 'Own branch ticket',
    description: 'Created by the scope verification script.',
  })
  check(
    'employee can work on their own branch customer',
    ticketIn.status === 201,
    `status ${ticketIn.status}`,
  )

  const managerOut = await postBody(
    `/api/staff/customers/${customerB.id}/tickets`,
    manager.token,
    {
      category: 'billing',
      subject: 'Manager cross branch',
      description: 'This must be refused for a branch manager too.',
    },
  )
  check(
    'branch manager cannot work on another branch customer',
    managerOut.status === 403,
    `status ${managerOut.status}`,
  )

  const adminOut = await postBody(`/api/staff/customers/${customerB.id}/tickets`, adminStaff.token, {
    category: 'billing',
    subject: 'Admin system wide',
    description: 'Administrators keep system-wide access.',
  })
  check(
    'administrator keeps system-wide access',
    adminOut.status === 201,
    `status ${adminOut.status}`,
  )

  // --- RLS checks (direct Supabase reads from the browser client) -----
  const ownCustomers = await employee.client.from('customers').select('id, branch_id')
  const ownIds = (ownCustomers.data ?? []).map((row) => row.id)
  check(
    'RLS hides other branch customers from staff',
    !ownIds.includes(customerB.id) && ownIds.includes(customerA.id),
    `visible ${ownIds.length} row(s)`,
  )

  const otherBranchProfiles = await employee.client
    .from('profiles')
    .select('id, branch_id')
    .eq('branch_id', branchB.id)
  check(
    'RLS hides other branch staff profiles',
    (otherBranchProfiles.data ?? []).length === 0,
    `${otherBranchProfiles.data?.length ?? 0} row(s)`,
  )

  const adminCustomers = await adminStaff.client
    .from('customers')
    .select('id, branch_id')
  const adminIds = (adminCustomers.data ?? []).map((row) => row.id)
  check(
    'RLS lets an administrator read every branch',
    adminIds.includes(customerA.id) && adminIds.includes(customerB.id),
    `visible ${adminIds.length} row(s)`,
  )
} catch (caught) {
  console.error('verification error   :', caught instanceof Error ? caught.stack : caught)
  results.push({ name: 'verification run', ok: false })
} finally {
  await cleanup()
  const failed = results.filter((row) => !row.ok)
  console.log(failed.length === 0 ? '\nALL BRANCH SCOPE CHECKS PASSED' : `\n${failed.length} CHECK(S) FAILED`)
  process.exit(failed.length === 0 ? 0 : 1)
}
