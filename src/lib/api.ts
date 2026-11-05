import { supabase } from './supabase'
import type { Customer, MonitoringEmployee, StaffRole } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`)
  }

  let response: Response
  try {
    response = await fetch(path, { ...options, headers })
  } catch {
    throw new ApiError(
      0,
      'Cannot reach the AON FIBER API. Start it with "npm run dev" and try again.',
    )
  }

  const text = await response.text()
  let payload: Record<string, unknown> = {}
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>
    } catch {
      payload = {}
    }
  }

  if (!response.ok) {
    const fromPayload =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.error === 'string' && payload.error) ||
      (typeof payload.detail === 'string' && payload.detail) ||
      ''

    // A 5xx without a JSON message usually means the API process is down (the
    // Vite proxy answers with plain text) or crashed outside the route handlers.
    let message = fromPayload
    if (!message) {
      if (response.status >= 500) {
        message =
          'The AON FIBER API did not respond correctly (status ' +
          response.status +
          '). Make sure it is running with "npm run dev" and check the server console for the error.'
      } else if (response.status === 404) {
        message = 'This API route was not found. Restart the API with "npm run dev".'
      } else {
        message = 'Something went wrong. Please try again.'
      }
    }

    throw new ApiError(response.status, message)
  }
  return payload as T
}

function post<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function patch<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

function del<T>(path: string) {
  return apiFetch<T>(path, { method: 'DELETE' })
}

export type InquiryPayload = {
  fullName: string
  contactNumber: string
  email?: string
  address?: string
  city?: string
  barangay?: string
  branchId?: string
  planId?: string
  message?: string
  type?: 'public_inquiry' | 'coverage_request'
}

export const api = {
  // Public
  submitInquiry: (payload: InquiryPayload) =>
    post<{ ok: true; referenceNumber: string; message: string }>('/api/public/inquiries', payload),

  customerAuthStatus: () =>
    apiFetch<{ externalNotifications: 'enabled' | 'not_configured'; devMode: boolean }>(
      '/api/customer-auth/status',
    ),

  requestCustomerCode: (accountNumber: string) =>
    post<{
      ok: true
      message: string
      externalNotifications: 'enabled' | 'not_configured'
      delivery: 'email' | 'sms' | 'not_configured'
      devCode?: string
      devNotice?: string
    }>('/api/customer-auth/request-code', { accountNumber }),

  verifyCustomerCode: (accountNumber: string, code: string) =>
    post<{ ok: true; tokenHash: string; message: string }>('/api/customer-auth/verify-code', {
      accountNumber,
      code,
    }),

  // Staff
  createCustomer: (payload: {
    fullName: string
    contactNumber: string
    email?: string
    address: string
    city?: string
    barangay?: string
    planId?: string
    branchId?: string
    notes?: string
    installationRequestedDate?: string
    createInstallation?: boolean
  }) =>
    post<{
      ok: true
      customer: Customer
      installation: { reference_number: string } | null
      installationWarning?: string | null
    }>('/api/staff/customers', payload),

  createChangeRequest: (customerId: string, changes: Record<string, string>, reason: string) =>
    post<{ ok: true; request: { id: string } }>(
      `/api/staff/customers/${customerId}/change-requests`,
      { changes, reason },
    ),

  createInstallation: (customerId: string, payload: { requestedDate?: string; notes?: string }) =>
    post<{ ok: true; installation: { reference_number: string } }>(
      `/api/staff/customers/${customerId}/installations`,
      payload,
    ),

  createStaffTicket: (
    customerId: string,
    payload: { category: string; subject: string; description: string; priority?: string },
  ) =>
    post<{ ok: true; ticket: { reference_number: string } }>(
      `/api/staff/customers/${customerId}/tickets`,
      payload,
    ),

  heartbeat: (sessionStart = false) =>
    post<{ ok: true; online: boolean; timeoutMs: number }>('/api/staff/presence/heartbeat', {
      sessionStart,
    }),

  goOffline: () => post<{ ok: true }>('/api/staff/presence/offline'),

  monitoring: () =>
    apiFetch<{
      ok: true
      timeoutMs: number
      generatedAt: string
      serverTime?: string
      presenceRows?: number
      employees: MonitoringEmployee[]
      branches: Array<{ id: string; name: string; city: string; province: string }>
    }>('/api/staff/monitoring'),

  reviewChangeRequest: (id: string, status: 'approved' | 'rejected', reviewNotes?: string) =>
    patch<{ ok: true }>(`/api/staff/change-requests/${id}`, { status, reviewNotes }),

  // Admin
  createEmployee: (payload: {
    fullName: string
    email: string
    role: StaffRole
    branchId?: string | null
    contactNumber?: string
    canCreateEmployees?: boolean
    password?: string
  }) =>
    post<{ ok: true; temporaryPassword: string; message: string }>('/api/staff/employees', payload),

  updateEmployee: (id: string, payload: Record<string, unknown>) =>
    patch<{ ok: true }>(`/api/admin/employees/${id}`, payload),

  resetEmployeePassword: (id: string) =>
    post<{ ok: true; temporaryPassword: string; message: string }>(
      `/api/admin/employees/${id}/reset-password`,
      {},
    ),

  employeeActivity: (id: string) =>
    apiFetch<{
      ok: true
      profile: Record<string, unknown>
      logs: Array<Record<string, unknown>>
      presence: Record<string, unknown> | null
    }>(`/api/admin/employees/${id}/activity`),

  createPlan: (payload: Record<string, unknown>) =>
    post<{ ok: true }>('/api/admin/plans', payload),
  updatePlan: (id: string, payload: Record<string, unknown>) =>
    patch<{ ok: true }>(`/api/admin/plans/${id}`, payload),
  deletePlan: (id: string) =>
    del<{ ok: true; message?: string; archived?: boolean; deleted?: boolean }>(`/api/admin/plans/${id}`),

  createBranch: (payload: Record<string, unknown>) =>
    post<{ ok: true }>('/api/admin/branches', payload),
  updateBranch: (id: string, payload: Record<string, unknown>) =>
    patch<{ ok: true }>(`/api/admin/branches/${id}`, payload),

  createCoverage: (payload: Record<string, unknown>) =>
    post<{ ok: true }>('/api/admin/coverage', payload),
  updateCoverage: (id: string, payload: Record<string, unknown>) =>
    patch<{ ok: true }>(`/api/admin/coverage/${id}`, payload),
  deleteCoverage: (id: string) => del<{ ok: true }>(`/api/admin/coverage/${id}`),

  updateCustomer: (id: string, payload: Record<string, unknown>) =>
    patch<{ ok: true }>(`/api/admin/customers/${id}`, payload),

  createBilling: (payload: Record<string, unknown>) =>
    post<{ ok: true }>('/api/admin/billing', payload),
  recordPayment: (id: string, amount: number) =>
    post<{ ok: true }>(`/api/admin/billing/${id}/payments`, { amount }),
  updateBilling: (id: string, payload: Record<string, unknown>) =>
    patch<{ ok: true }>(`/api/admin/billing/${id}`, payload),
  runDueDateReminders: () =>
    post<{ ok: true; created: number }>('/api/admin/reminders/run', {}),

  notifyCustomer: (customerId: string, payload: { title: string; body: string; category?: string }) =>
    post<{ ok: true }>(`/api/admin/customers/${customerId}/notifications`, payload),
}
