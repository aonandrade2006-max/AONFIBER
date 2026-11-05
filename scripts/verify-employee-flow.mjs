/**
 * End-to-end check for employee creation, branch scope and audit logging.
 * Creates throwaway accounts, exercises the running API, then removes everything.
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const API = process.env.API_BASE ?? 'http://127.0.0.1:8787'
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const anonKey = process.env.SUPABASE_ANON_KEY

const createdAuthUsers = []
const createdProfileIds = []
const results = []

function log(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

async function makeStaff({ role, branchId, canCreate }) {
  const email = `e2e-${role}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`
  const password = `E2e-${randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  createdAuthUsers.push(data.user.id)

  const { error: profileError } = await admin.from('profiles').insert({
    id: data.user.id,
    full_name: `E2E ${role}`,
    email,
    role,
    branch_id: branchId,
    status: 'active',
    can_create_employees: Boolean(canCreate),
  })
  if (profileError) throw new Error(`profile insert: ${profileError.message}`)
  createdProfileIds.push(data.user.id)

  const client = createClient(process.env.SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) throw new Error(`sign-in: ${signInError.message}`)
  return { id: data.user.id, email, token: session.session.access_token }
}

async function call(path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function cleanup() {
  // Remove only the accounts this script created.
  const { data: leftover } = await admin
    .from('profiles')
    .select('id, email')
    .like('email', 'e2e-%@example.com')
  for (const row of leftover ?? []) {
    await admin.from('audit_logs').delete().eq('actor_id', row.id)
    await admin.from('audit_logs').delete().eq('entity_id', row.id)
    await admin.from('employee_presence').delete().eq('profile_id', row.id)
    await admin.from('profiles').delete().eq('id', row.id)
    await admin.auth.admin.deleteUser(row.id)
  }
  for (const id of createdProfileIds) {
    await admin.from('employee_presence').delete().eq('profile_id', id)
    await admin.from('profiles').delete().eq('id', id)
  }
  for (const id of createdAuthUsers) {
    await admin.auth.admin.deleteUser(id)
  }
  return
}

const { data: branches } = await admin
  .from('branches')
  .select('id, name, is_active')
  .eq('is_active', true)
  .limit(2)

if (!branches || branches.length < 2) {
  console.error('Need at least two active branches to test branch scope.')
  process.exit(1)
}
const [branchA, branchB] = branches

try {
  const adminStaff = await makeStaff({ role: 'admin', branchId: null, canCreate: true })

  // 1. Administrator creates an Employee account.
  const created = await call('/api/staff/employees', adminStaff.token, {
    fullName: 'E2E Created Employee',
    email: `e2e-created-${Date.now()}@example.com`,
    role: 'employee',
    branchId: branchA.id,
    contactNumber: '09171234567',
    password: 'ChosenPassword1',
  })
  log('admin creates employee account', created.status === 201, `status ${created.status}`)
  log(
    'employee account uses the chosen password verbatim',
    created.json?.temporaryPassword === 'ChosenPassword1',
    created.json?.temporaryPassword ? 'password returned' : 'no password in response',
  )

  const newProfileId = created.json?.employee?.id
  if (newProfileId) createdProfileIds.push(newProfileId)

  // 2. Audit logging recorded the employee creation without an FK failure.
  const { data: auditRows, error: auditError } = await admin
    .from('audit_logs')
    .select('id, action, actor_id, actor_name, entity_type, entity_id')
    .eq('entity_id', newProfileId)
    .order('created_at', { ascending: false })
  log(
    'audit rows recorded for the created employee',
    !auditError && (auditRows ?? []).length > 0,
    auditError ? auditError.message : `${auditRows?.length ?? 0} row(s)`,
  )
  console.log(
    '      actor attribution  :',
    (auditRows ?? []).map((row) => `${row.action}/${row.actor_name ?? 'null'}`).join(', ') || 'none',
  )

  // 3. Branch manager permission + branch scope.
  const manager = await makeStaff({
    role: 'branch_manager',
    branchId: branchA.id,
    canCreate: true,
  })

  const ownBranch = await call('/api/staff/employees', manager.token, {
    fullName: 'E2E Branch Employee',
    email: `e2e-branch-${Date.now()}@example.com`,
    role: 'employee',
    branchId: branchA.id,
    contactNumber: '09171234568',
    password: 'ChosenPassword1',
  })
  log(
    'branch manager creates an employee for their own branch',
    ownBranch.status === 201,
    `status ${ownBranch.status}`,
  )
  if (ownBranch.json?.employee?.id) createdProfileIds.push(ownBranch.json.employee.id)

  const otherBranch = await call('/api/staff/employees', manager.token, {
    fullName: 'E2E Out of Scope',
    email: `e2e-scope-${Date.now()}@example.com`,
    role: 'employee',
    branchId: branchB.id,
    contactNumber: '09171234569',
    password: 'ChosenPassword1',
  })
  log(
    'branch manager blocked from another branch (assertBranchScope)',
    otherBranch.status === 403,
    `status ${otherBranch.status}: ${otherBranch.json?.message ?? ''}`,
  )

  const noPermission = await makeStaff({
    role: 'branch_manager',
    branchId: branchA.id,
    canCreate: false,
  })
  const forbidden = await call('/api/staff/employees', noPermission.token, {
    fullName: 'E2E No Grant',
    email: `e2e-nogrant-${Date.now()}@example.com`,
    role: 'employee',
    branchId: branchA.id,
    contactNumber: '09171234570',
    password: 'ChosenPassword1',
  })
  log(
    'branch manager without the grant is refused',
    forbidden.status === 403,
    `status ${forbidden.status}`,
  )
} finally {
  await cleanup()
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@example.com')
  console.log('\nleftover throwaway profiles:', count ?? 0)
  const failed = results.filter((row) => !row.ok)
  console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`)
  process.exit(failed.length === 0 ? 0 : 1)
}
