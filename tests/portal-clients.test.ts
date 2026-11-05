import { describe, expect, it } from 'vitest'
import {
  AUTH_STORAGE_KEYS,
  adminSupabase,
  audienceForPath,
  clientForPath,
  customerSupabase,
  staffSupabase,
} from '../src/lib/supabase'

describe('portal auth clients', () => {
  it('maps each portal path to its own audience', () => {
    expect(audienceForPath('/admin')).toBe('admin')
    expect(audienceForPath('/admin/employees')).toBe('admin')
    expect(audienceForPath('/staff')).toBe('staff')
    expect(audienceForPath('/staff/login')).toBe('staff')
    expect(audienceForPath('/portal/billing')).toBe('customer')
    expect(audienceForPath('/')).toBe('staff')
  })

  it('returns a different client per portal', () => {
    expect(clientForPath('/admin')).toBe(adminSupabase)
    expect(clientForPath('/staff')).toBe(staffSupabase)
    expect(clientForPath('/portal/login')).toBe(customerSupabase)
    expect(adminSupabase).not.toBe(staffSupabase)
    expect(staffSupabase).not.toBe(customerSupabase)
    expect(adminSupabase).not.toBe(customerSupabase)
  })

  it('stores each session under a separate localStorage key', () => {
    const keys = Object.values(AUTH_STORAGE_KEYS)
    expect(new Set(keys).size).toBe(3)
    expect(keys).toEqual([
      'aon-fiber-admin-auth',
      'aon-fiber-staff-auth',
      'aon-fiber-customer-auth',
    ])
  })
})
