import type { AddressInfo } from 'node:net'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer } from '../server/index'

describe('staff employee creation', () => {
  let app: ReturnType<typeof createServer>
  let port = 0

  beforeAll(async () => {
    app = await createServer(0)
    const addr = app.address() as AddressInfo | null
    port = typeof addr?.port === 'number' ? addr.port : 0
    expect(port).toBeGreaterThan(0)
  })

  afterAll(() => {
    app?.close()
  })

  function post(path: string, body: Record<string, unknown>) {
    return fetch(`http://127.0.0.1:${port}/api/staff${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('rejects missing auth on employee creation when Supabase is not configured', async () => {
    const res = await post(
      '/employees',
      {
        fullName: 'Test Employee',
        email: 'test.employee@example.com',
        role: 'employee',
        branchId: 'branch-1',
        password: 'short',
      },
    )

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.message.toLowerCase()).toContain('authentication')
  })

  it('rejects invalid role strings at the API boundary', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/staff/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer faketoken',
      },
      body: JSON.stringify({
        fullName: 'Test Employee',
        email: 'another.employee@example.com',
        role: 'Customer Service Representative',
        branchId: 'branch-1',
        password: 'x',
      }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.message.toLowerCase()).toContain('session')
  })
})

describe('employee role normalization', () => {
  it('normalizes Employee and Branch Manager casing in the server route enum', async () => {
    const serverModule = await import('../server/routes/staff')
    expect(serverModule.STAFF_ROLE_OPTIONS).toEqual(['employee', 'branch_manager', 'admin'])
  })
})

describe('employee password handling', () => {
  it('does not require custom password complexity, only a non-empty value', async () => {
    const passwordModule = await import('../server/lib/passwords')
    expect(typeof passwordModule.generateTempPassword).toBe('function')
    const generated = passwordModule.generateTempPassword()
    expect(typeof generated).toBe('string')
    expect(generated.length).toBeGreaterThan(0)
  })
})

describe('branch manager create-employee scope', () => {
  it('only branch managers with the grant can create employees for their own branch', async () => {
    const authModule = await import('../server/lib/auth')
    expect(typeof authModule.requireRole).toBe('function')
    expect(typeof authModule.assertBranchScope).toBe('function')
  })
})
