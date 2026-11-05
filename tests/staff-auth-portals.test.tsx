import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { StaffAuthProvider, useStaffAuth } from '../src/context/StaffAuth'
import type { StaffProfile } from '../src/lib/types'

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  signOut: vi.fn(async () => ({ error: null })),
  signInWithPassword: vi.fn(async () => ({
    data: { user: { id: 'staff-1' }, session: { user: { id: 'staff-1' } } },
    error: null,
  })),
  heartbeat: vi.fn(async () => ({ ok: true })),
}))

function builder(rows: unknown[]) {
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
  }
  return query
}

vi.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  CONFIG_MESSAGE: '',
  staffSupabase: {},
  adminSupabase: {},
  customerSupabase: {},
  audienceForPath: (pathname: string) =>
    pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/portal') ? 'customer' : 'staff',
  supabase: {
    from: (table: string) =>
      builder(table === 'profiles' && h.profile ? [h.profile] : []),
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: h.signInWithPassword,
      signOut: h.signOut,
    },
  },
}))

vi.mock('../src/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: { heartbeat: h.heartbeat, goOffline: async () => ({ ok: true }) },
}))

let auth: ReturnType<typeof useStaffAuth> | null = null

function Harness({ children }: { children?: ReactNode }) {
  auth = useStaffAuth()
  return <>{children}</>
}

function renderAuth() {
  render(
    <StaffAuthProvider>
      <Harness />
    </StaffAuthProvider>,
  )
}

function staffProfile(role: StaffProfile['role']): Record<string, unknown> {
  return {
    id: 'staff-1',
    full_name: 'Portal Tester',
    email: 'tester@aonfiber.example',
    role,
    branch_id: null,
    status: 'active',
    can_create_employees: false,
    contact_number: null,
    last_login_at: null,
    last_activity_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

beforeEach(() => {
  h.profile = null
  h.signOut.mockClear()
  h.signInWithPassword.mockClear()
  window.history.replaceState({}, '', '/staff/login')
})

describe('portal login audiences', () => {
  it('refuses an employee at the Admin Portal and clears only that attempt', async () => {
    window.history.replaceState({}, '', '/admin/login')
    h.profile = staffProfile('employee')
    renderAuth()
    await waitFor(() => expect(auth).not.toBeNull())

    await expect(auth!.signIn('employee@aonfiber.example', 'secret')).rejects.toThrow(
      /Admin Portal/i,
    )
    expect(h.signOut).toHaveBeenCalledTimes(1)
  })

  it('refuses an administrator in the Employee Portal without touching the admin session', async () => {
    window.history.replaceState({}, '', '/staff/login')
    h.profile = staffProfile('admin')
    renderAuth()
    await waitFor(() => expect(auth).not.toBeNull())

    await expect(auth!.signIn('admin@aonfiber.example', 'secret')).rejects.toThrow(
      /Admin Portal \(/i,
    )
    expect(h.signOut).toHaveBeenCalledTimes(1)
  })

  it('accepts an employee in the Employee Portal', async () => {
    h.profile = staffProfile('employee')
    renderAuth()
    await waitFor(() => expect(auth).not.toBeNull())

    const profile = await auth!.signIn('employee@aonfiber.example', 'secret')
    expect(profile.role).toBe('employee')
    expect(h.signOut).not.toHaveBeenCalled()
  })

  it('accepts a branch manager in the Employee Portal', async () => {
    h.profile = staffProfile('branch_manager')
    renderAuth()
    await waitFor(() => expect(auth).not.toBeNull())

    const profile = await auth!.signIn('manager@aonfiber.example', 'secret')
    expect(profile.role).toBe('branch_manager')
  })

  it('accepts an administrator at the Admin Portal', async () => {
    window.history.replaceState({}, '', '/admin/login')
    h.profile = staffProfile('admin')
    renderAuth()
    await waitFor(() => expect(auth).not.toBeNull())

    const profile = await auth!.signIn('admin@aonfiber.example', 'secret')
    expect(profile.role).toBe('admin')
    expect(h.signOut).not.toHaveBeenCalled()
  })
})
