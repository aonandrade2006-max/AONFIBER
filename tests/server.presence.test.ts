import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeSupabase, type Row } from './support/fake-supabase'

const h = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  tokens: new Map<string, { id: string; email: string }>(),
}))

vi.mock('../server/lib/supabase', () => ({
  getAdminClient: () => h.db,
  getAnonClient: () => ({}),
  getAuthUser: async (token: string) => h.tokens.get(token) ?? null,
}))

const { createServer } = await import('../server/index')

const BRANCH = '11111111-1111-4111-8111-111111111111'

function profile(id: string, name: string, role: 'admin' | 'employee', branchId: string | null): Row {
  return {
    id,
    full_name: name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@aonfiber.example`,
    role,
    branch_id: branchId,
    status: 'active',
    can_create_employees: false,
    last_login_at: null,
    last_activity_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EMP1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const EMP2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const EMP3 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

let app: ReturnType<typeof createServer>
let port = 0

beforeAll(() => {
  app = createServer(0)
  const address = app.address() as AddressInfo | null
  port = typeof address?.port === 'number' ? address.port : 0
})

afterAll(() => {
  app?.close()
})

beforeEach(() => {
  h.db = new FakeSupabase({
    branches: [
      { id: BRANCH, name: 'AON FIBER – Quezon City', city: 'Quezon City', province: 'Metro Manila' },
    ],
    profiles: [
      profile(ADMIN, 'Admin User', 'admin', null),
      profile(EMP1, 'Employee One', 'employee', BRANCH),
      profile(EMP2, 'Employee Two', 'employee', BRANCH),
      profile(EMP3, 'Employee Three', 'employee', BRANCH),
    ],
    // The seed_presence trigger creates this row when a profile is created.
    employee_presence: [
      { profile_id: EMP1, branch_id: BRANCH, is_online: false, last_seen_at: null, last_activity_at: null, updated_at: new Date().toISOString() },
      { profile_id: EMP2, branch_id: BRANCH, is_online: false, last_seen_at: null, last_activity_at: null, updated_at: new Date().toISOString() },
    ],
  })

  h.tokens.clear()
  h.tokens.set('admin-token', { id: ADMIN, email: 'admin@aonfiber.example' })
  h.tokens.set('emp1-token', { id: EMP1, email: 'employee.one@aonfiber.example' })
  h.tokens.set('emp2-token', { id: EMP2, email: 'employee.two@aonfiber.example' })
  h.tokens.set('emp3-token', { id: EMP3, email: 'employee.three@aonfiber.example' })
})

function call(method: 'POST' | 'GET', path: string, token?: string, body?: unknown) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function monitoring(token = 'admin-token') {
  const res = await call('GET', '/api/staff/monitoring', token)
  expect(res.status).toBe(200)
  const payload = await res.json()
  const byId = new Map<string, { online: boolean; lastActivityAt: string | null }>(
    payload.employees.map((employee: { profileId: string; online: boolean }) => [
      employee.profileId,
      employee,
    ]),
  )
  return { payload, byId }
}

describe('live monitoring presence', () => {
  it('marks an employee online from the very first heartbeat (login) and keeps both online', async () => {
    expect((await monitoring()).byId.get(EMP1)?.online).toBe(false)

    const first = await call('POST', '/api/staff/presence/heartbeat', 'emp1-token', { sessionStart: true })
    expect(first.status).toBe(200)
    expect((await first.json()).online).toBe(true)

    const second = await call('POST', '/api/staff/presence/heartbeat', 'emp2-token', { sessionStart: true })
    expect(second.status).toBe(200)

    const { byId } = await monitoring()
    expect(byId.get(EMP1)?.online).toBe(true)
    expect(byId.get(EMP2)?.online).toBe(true)
    expect(byId.get(EMP1)?.lastActivityAt).toBeTruthy()
  })

  it('records login time, activity time and the employee id on the presence row', async () => {
    await call('POST', '/api/staff/presence/heartbeat', 'emp1-token', { sessionStart: true })

    const row = h.db.rows('employee_presence').find((r) => r.profile_id === EMP1)
    expect(row).toBeTruthy()
    expect(row!.is_online).toBe(true)
    expect(row!.last_login_at).toBeTruthy()
    expect(row!.last_seen_at).toBeTruthy()
    expect(row!.session_started_at).toBeTruthy()
    expect(row!.branch_id).toBe(BRANCH)
  })

  it('creates the presence row when it is missing instead of failing silently', async () => {
    expect(h.db.rows('employee_presence').some((r) => r.profile_id === EMP3)).toBe(false)

    const res = await call('POST', '/api/staff/presence/heartbeat', 'emp3-token', { sessionStart: true })
    expect(res.status).toBe(200)

    const row = h.db.rows('employee_presence').find((r) => r.profile_id === EMP3)
    expect(row?.is_online).toBe(true)
    expect((await monitoring()).byId.get(EMP3)?.online).toBe(true)
  })

  it('logout marks only that employee offline and leaves the others online', async () => {
    await call('POST', '/api/staff/presence/heartbeat', 'emp1-token', { sessionStart: true })
    await call('POST', '/api/staff/presence/heartbeat', 'emp2-token', { sessionStart: true })

    const offline = await call('POST', '/api/staff/presence/offline', 'emp1-token')
    expect(offline.status).toBe(200)

    const { byId } = await monitoring()
    expect(byId.get(EMP1)?.online).toBe(false)
    expect(byId.get(EMP2)?.online).toBe(true)
  })

  it('reports an employee offline once the last heartbeat is older than the timeout', async () => {
    await call('POST', '/api/staff/presence/heartbeat', 'emp2-token', { sessionStart: true })

    const row = h.db.rows('employee_presence').find((r) => r.profile_id === EMP2)!
    row.last_seen_at = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    expect((await monitoring()).byId.get(EMP2)?.online).toBe(false)
  })

  it('keeps at least five employees online at the same time', async () => {
    const extra = [1, 2, 3, 4, 5].map((index) => profile(`eeeeeeee-eeee-4eee-8eee-00000000000${index}`, `Extra ${index}`, 'employee', BRANCH))
    h.db.tables.profiles.push(...extra)
    for (const row of extra) {
      h.tokens.set(`extra-${row.id}`, { id: String(row.id), email: String(row.email) })
      const res = await call('POST', '/api/staff/presence/heartbeat', `extra-${row.id}`, { sessionStart: true })
      expect(res.status).toBe(200)
    }

    const { payload, byId } = await monitoring()
    for (const row of extra) expect(byId.get(String(row.id))?.online).toBe(true)
    expect(payload.employees.length).toBeGreaterThanOrEqual(8)
  })

  it('rejects a heartbeat without a valid session and writes nothing', async () => {
    const anonymous = await call('POST', '/api/staff/presence/heartbeat', undefined, { sessionStart: true })
    expect(anonymous.status).toBe(401)

    const forged = await call('POST', '/api/staff/presence/heartbeat', 'not-a-real-token', { sessionStart: true })
    expect(forged.status).toBe(401)

    expect(h.db.rows('employee_presence').every((r) => r.is_online === false)).toBe(true)
  })

  it('never creates duplicate presence rows across repeated heartbeats', async () => {
    for (let index = 0; index < 3; index += 1) {
      const res = await call('POST', '/api/staff/presence/heartbeat', 'emp3-token', {
        sessionStart: index === 0,
      })
      expect(res.status).toBe(200)
    }

    const rows = h.db.rows('employee_presence').filter((row) => row.profile_id === EMP3)
    expect(rows).toHaveLength(1)
    expect(rows[0].is_online).toBe(true)
  })

  it('surfaces a failed presence write instead of silently reporting online', async () => {
    h.db.failures.employee_presence = {
      code: '42703',
      message: 'column employee_presence.last_seen_at does not exist',
    }

    const res = await call('POST', '/api/staff/presence/heartbeat', 'emp1-token', { sessionStart: true })
    expect(res.status).toBe(500)
    const payload = await res.json()
    expect(payload.ok).toBe(false)
    expect(payload.message).toMatch(/supabase\/migrations/)
  })

  it('only lets administrators and branch managers read the monitoring feed', async () => {
    const res = await call('GET', '/api/staff/monitoring', 'emp1-token')
    expect(res.status).toBe(403)
  })
})
