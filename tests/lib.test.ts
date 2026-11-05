import { describe, expect, it } from 'vitest'
import { ROLE_LABELS, canManageEmployees, canReviewChangeRequests, homeForRole, isAdmin } from '../src/lib/permissions'

describe('roles and permissions', () => {
  it('labels Employee and Branch Manager correctly', () => {
    expect(ROLE_LABELS.employee).toBe('Employee')
    expect(ROLE_LABELS.branch_manager).toBe('Branch Manager')
    expect(ROLE_LABELS.admin).toBe('Administrator')
  })

  it('only lets admins and branch managers review corrections', () => {
    expect(canReviewChangeRequests('admin')).toBe(true)
    expect(canReviewChangeRequests('branch_manager')).toBe(true)
    expect(canReviewChangeRequests('employee')).toBe(false)
  })

  it('only lets admins create employees unless granted', () => {
    expect(canManageEmployees('employee', true)).toBe(false)
    expect(canManageEmployees('branch_manager', false)).toBe(false)
    expect(canManageEmployees('branch_manager', true)).toBe(true)
    expect(canManageEmployees('admin', false)).toBe(true)
  })

  it('routes each role to its dashboard', () => {
    expect(homeForRole('admin')).toBe('/admin')
    expect(homeForRole('employee')).toBe('/staff')
  })

  it('identifies administrators', () => {
    expect(isAdmin('admin')).toBe(true)
    expect(isAdmin('branch_manager')).toBe(false)
    expect(isAdmin('employee')).toBe(false)
  })
})
