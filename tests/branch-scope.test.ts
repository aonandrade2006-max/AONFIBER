import { describe, expect, it } from 'vitest'
import { assertBranchScope, type StaffSession } from '../server/lib/auth'

const BRANCH_A = '11111111-1111-1111-1111-111111111111'
const BRANCH_B = '22222222-2222-2222-2222-222222222222'

function staff(overrides: Partial<StaffSession>): StaffSession {
  return {
    id: 'staff-1',
    email: 'staff@example.com',
    fullName: 'Staff Member',
    role: 'employee',
    branchId: BRANCH_A,
    status: 'active',
    canCreateEmployees: false,
    ...overrides,
  }
}

describe('assertBranchScope', () => {
  it('lets administrators act on any branch', () => {
    const admin = staff({ role: 'admin', branchId: null })
    expect(() => assertBranchScope(admin, BRANCH_A)).not.toThrow()
    expect(() => assertBranchScope(admin, BRANCH_B)).not.toThrow()
    expect(() => assertBranchScope(admin, null)).not.toThrow()
  })

  it('lets staff act on their own branch', () => {
    expect(() => assertBranchScope(staff({ role: 'employee' }), BRANCH_A)).not.toThrow()
    expect(() =>
      assertBranchScope(staff({ role: 'branch_manager' }), BRANCH_A),
    ).not.toThrow()
  })

  it('refuses another branch with a 403', () => {
    for (const role of ['employee', 'branch_manager'] as const) {
      try {
        assertBranchScope(staff({ role }), BRANCH_B)
        throw new Error('expected assertBranchScope to throw')
      } catch (caught) {
        expect(caught).toMatchObject({ status: 403 })
        expect((caught as Error).message).toMatch(/assigned branch/i)
      }
    }
  })

  it('refuses staff without a branch and records without a branch', () => {
    expect(() => assertBranchScope(staff({ branchId: null }), BRANCH_A)).toThrow()
    expect(() => assertBranchScope(staff({}), null)).toThrow()
  })
})
