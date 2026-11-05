import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'

const h = vi.hoisted(() => {
  const plans = [
    {
      id: 'plan-1',
      name: 'Fiber Plus',
      speed_mbps: 100,
      monthly_price: 1299,
      description: 'Family fiber',
      features: ['Unlimited data', 'Free installation'],
      is_active: true,
      sort_order: 1,
    },
    {
      id: 'plan-2',
      name: 'Fiber Max',
      speed_mbps: 300,
      monthly_price: 1899,
      description: 'Gaming fiber',
      features: ['Unlimited data'],
      is_active: true,
      sort_order: 2,
    },
  ]

  const branches = [
    {
      id: 'branch-1',
      name: 'AON FIBER – Quezon City',
      address: '88 Cyber Avenue',
      city: 'Quezon City',
      province: 'Metro Manila',
      contact_number: '(02) 8555-0110',
      email: 'qc@aonfiber.example',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  ]

  const coverage = [
    {
      id: 'coverage-1',
      branch_id: 'branch-1',
      city: 'Quezon City',
      barangay: 'Diliman',
      area: null,
      is_serviceable: true,
      notes: 'Fiber ready',
    },
  ]

  const customer = {
    id: 'customer-1',
    account_number: 'AON-100001',
    auth_user_id: 'user-1',
    full_name: 'Ana Villanueva',
    contact_number: '09171234567',
    email: 'ana.villanueva@example.com',
    address: '24 Sikatuna Street',
    city: 'Quezon City',
    barangay: 'Diliman',
    branch_id: 'branch-1',
    plan_id: 'plan-1',
    subscription_status: 'active',
    monthly_billing: 1299,
    due_date: '2026-12-01',
    installation_status: 'completed',
    notes: null,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  }

  const staffProfile = {
    id: 'staff-1',
    full_name: 'Paolo Santos',
    email: 'csr.qc@aonfiber.example',
    role: 'branch_manager',
    branch_id: 'branch-1',
    status: 'active',
    can_create_employees: false,
    contact_number: null,
    last_login_at: null,
    last_activity_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }

  const adminProfile = {
    id: 'staff-admin',
    full_name: 'AON Administrator',
    email: 'admin@aonfiber.example',
    role: 'admin',
    branch_id: null,
    status: 'active',
    can_create_employees: true,
    contact_number: null,
    last_login_at: null,
    last_activity_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }

  const tableRows: Record<string, unknown[]> = {
    internet_plans: plans,
    branches,
    branch_coverage: coverage,
    customers: [customer],
    billing_records: [],
    installations: [],
    support_tickets: [],
    customer_notifications: [],
    profiles: [],
    account_change_requests: [],
    audit_logs: [],
    employee_presence: [],
  }

  function builder(rows: unknown[]) {
    const query = {
      select: () => query,
      order: () => query,
      eq: () => query,
      neq: () => query,
      in: () => query,
      gte: () => query,
      lte: () => query,
      or: () => query,
      limit: () => query,
      insert: () => query,
      update: () => query,
      delete: () => query,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject),
    }
    return query
  }

  return {
    tableRows,
    staffProfile,
    adminProfile,
    builder,
    state: { session: null as { user: { id: string; email: string } } | null },
    auth: {
      getSession: async () => ({ data: { session: h.state.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      }),
      signOut: async () => ({ error: null }),
      verifyOtp: async () => {
        h.state.session = {
          user: { id: 'user-1', email: 'cust-aon-100001@customers.aonfiber.ph' },
        }
        return { data: {}, error: null }
      },
    },
    submitInquiry: vi.fn(async () => ({
      ok: true as const,
      referenceNumber: 'INQ-000123',
      message: 'Received',
    })),
    requestCustomerCode: vi.fn(async () => ({
      ok: true as const,
      message: 'If that account number is registered, a verification code has been sent.',
      externalNotifications: 'not_configured' as const,
      delivery: 'not_configured' as const,
      devCode: '123456',
    })),
    verifyCustomerCode: vi.fn(async () => ({
      ok: true as const,
      tokenHash: 'hashed-token',
      message: 'Verification successful.',
    })),
  }
})

vi.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  CONFIG_MESSAGE: '',
  adminSupabase: { auth: h.auth },
  staffSupabase: { auth: h.auth },
  customerSupabase: { auth: h.auth, from: (table: string) => h.builder(h.tableRows[table] ?? []) },
  audienceForPath: (pathname: string) =>
    pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/portal') ? 'customer' : 'staff',
  supabase: {
    from: (table: string) => h.builder(h.tableRows[table] ?? []),
    auth: {
      getSession: async () => ({ data: { session: h.state.session } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      }),
      signOut: async () => ({ error: null }),
      verifyOtp: async () => {
        h.state.session = { user: { id: 'user-1', email: 'cust-aon-100001@customers.aonfiber.ph' } }
        return { data: {}, error: null }
      },
    },
    channel: () => {
      const channel = {
        on: () => channel,
        subscribe: () => channel,
      }
      return channel
    },
    removeChannel: async () => {},
  },
}))

vi.mock('../src/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submitInquiry: h.submitInquiry,
    requestCustomerCode: h.requestCustomerCode,
    verifyCustomerCode: h.verifyCustomerCode,
    customerAuthStatus: async () => ({
      externalNotifications: 'not_configured',
      devMode: true,
    }),
    heartbeat: async () => ({ ok: true }),
    goOffline: async () => ({ ok: true }),
    monitoring: async () => ({
      ok: true,
      timeoutMs: 120000,
      generatedAt: new Date().toISOString(),
      employees: [],
      branches: [
        { id: 'branch-1', name: 'AON FIBER – Quezon City', city: 'Quezon City', province: 'Metro Manila' },
      ],
    }),
  },
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  h.state.session = null
  h.tableRows.profiles = []
  h.submitInquiry.mockClear()
  h.requestCustomerCode.mockClear()
  h.verifyCustomerCode.mockClear()
})

describe('public website', () => {
  it('renders the homepage with plans and navigates to the plans page', async () => {
    const user = userEvent.setup()
    renderAt('/')

    expect(
      await screen.findByRole('heading', { name: /Speed Without Limits/i }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Fiber Plus')).toBeInTheDocument()

    const mainNav = screen.getByRole('navigation', { name: 'Main navigation' })
    await user.click(within(mainNav).getByRole('link', { name: 'Internet Plans' }))

    expect(
      await screen.findByRole('heading', { name: /Fiber plans for every household/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Fiber Max').length).toBeGreaterThan(0)
  })

  it('checks coverage using admin configured areas only', async () => {
    const user = userEvent.setup()
    renderAt('/coverage')

    await user.type(screen.getByLabelText(/City \/ Municipality/i), 'Quezon City')
    await user.type(screen.getByLabelText(/Barangay/i), 'Diliman')
    await user.click(screen.getByRole('button', { name: /Check coverage/i }))

    expect(await screen.findByText('Service available in your area.')).toBeInTheDocument()
    expect(screen.getByText(/is served by AON FIBER – Quezon City/i)).toBeInTheDocument()
  })

  it('asks to contact a branch for unconfigured areas', async () => {
    const user = userEvent.setup()
    renderAt('/coverage')

    await user.type(screen.getByLabelText(/City \/ Municipality/i), 'Zamboanga City')
    await user.click(screen.getByRole('button', { name: /Check coverage/i }))

    expect(
      await screen.findByText('Please contact your nearest branch to confirm availability.'),
    ).toBeInTheDocument()
  })

  it('validates and submits the public inquiry form', async () => {
    const user = userEvent.setup()
    renderAt('/contact')

    await user.click(screen.getByRole('button', { name: /Submit inquiry/i }))
    expect(await screen.findByText('Enter your full name.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Full name/i), 'Diego Ramos')
    await user.type(screen.getByLabelText(/Mobile number/i), '12345')
    await user.click(screen.getByRole('button', { name: /Submit inquiry/i }))
    expect(await screen.findByText(/Enter a valid PH mobile number/i)).toBeInTheDocument()
    expect(h.submitInquiry).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText(/Mobile number/i))
    await user.type(screen.getByLabelText(/Mobile number/i), '09171234567')
    await user.type(screen.getByLabelText(/Inquiry details/i), 'Please check my address.')
    await user.click(screen.getByRole('button', { name: /Submit inquiry/i }))

    expect(await screen.findByText(/INQ-000123/)).toBeInTheDocument()
    expect(h.submitInquiry).toHaveBeenCalledTimes(1)
  })

  it('shows the employee sign-in page and reports bad credentials', async () => {
    const user = userEvent.setup()
    renderAt('/staff/login')

    expect(await screen.findByRole('heading', { name: 'Employee Portal' })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Work email/i), 'manager.qc@aonfiber.example')
    await user.type(screen.getByLabelText(/Password/i), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /Sign in/i }))

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument()
  })

  it('sends an unauthenticated admin visitor to the admin login page', async () => {
    renderAt('/admin')

    expect(await screen.findByRole('heading', { name: 'Admin Portal' })).toBeInTheDocument()
  })

  it('sends an unauthenticated employee visitor to the employee login page', async () => {
    renderAt('/staff')

    expect(await screen.findByRole('heading', { name: 'Employee Portal' })).toBeInTheDocument()
  })

  it('refuses an employee session on an administrator-only page', async () => {
    h.state.session = { user: { id: 'staff-csr', email: 'csr@aonfiber.example' } }
    h.tableRows.profiles = [
      {
        id: 'staff-csr',
        full_name: 'Quezon CSR',
        email: 'csr@aonfiber.example',
        role: 'employee',
        branch_id: 'branch-1',
        status: 'active',
        can_create_employees: false,
        contact_number: null,
        last_login_at: null,
        last_activity_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    renderAt('/admin/employees')

    expect(
      await screen.findByText(/You do not have access to this page/i),
    ).toBeInTheDocument()
  })

  it('signs a customer in with an account number and one-time code', async () => {
    const user = userEvent.setup()
    renderAt('/portal/login')

    await user.type(await screen.findByLabelText(/Account number/i), 'AON-100001')
    await user.click(screen.getByRole('button', { name: /Send verification code/i }))

    expect(await screen.findByText('123456')).toBeInTheDocument()
    expect(h.requestCustomerCode).toHaveBeenCalledWith('AON-100001')

    await user.type(screen.getByLabelText(/Verification code/i), '123456')
    await user.click(screen.getByRole('button', { name: /Verify and sign in/i }))

    expect(await screen.findByText(/Welcome back, Ana/i)).toBeInTheDocument()
    expect(h.verifyCustomerCode).toHaveBeenCalledWith('AON-100001', '123456')
  })
})
