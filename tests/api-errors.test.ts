import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  CONFIG_MESSAGE: '',
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}))

const { api } = await import('../src/lib/api')

function fakeResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api error messages', () => {
  it('explains that the API is down when the proxy answers with plain text', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(500, 'Error occurred while trying to proxy: localhost:5173/api/staff/customers'),
    )

    await expect(
      api.createCustomer({ fullName: 'Test', contactNumber: '09171234567', address: 'Somewhere' }),
    ).rejects.toThrow(/API did not respond correctly \(status 500\).*npm run dev/i)
  })

  it('passes a JSON error message from the API straight through', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(
        409,
        JSON.stringify({
          ok: false,
          message:
            'That mobile number already belongs to Maria Santos (AON-100042) in this branch. Open that account instead of creating a duplicate.',
        }),
      ),
    )

    await expect(
      api.createCustomer({ fullName: 'Test', contactNumber: '09171234567', address: 'Somewhere' }),
    ).rejects.toThrow(/already belongs to Maria Santos \(AON-100042\)/)
  })

  it('reads a JSON error field when there is no message', async () => {
    fetchMock.mockResolvedValue(fakeResponse(400, JSON.stringify({ error: 'Branch is required.' })))

    await expect(api.submitInquiry({ fullName: 'A', contactNumber: '09171234567' })).rejects.toThrow(
      'Branch is required.',
    )
  })

  it('keeps the generic message for a 4xx without any body', async () => {
    fetchMock.mockResolvedValue(fakeResponse(403, ''))

    await expect(api.submitInquiry({ fullName: 'A', contactNumber: '09171234567' })).rejects.toThrow(
      'Something went wrong. Please try again.',
    )
  })
})
