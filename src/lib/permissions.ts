import type { StaffRole } from './types'

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Administrator',
  branch_manager: 'Branch Manager',
  employee: 'Employee',
}

export function isAdmin(role: StaffRole | null | undefined): boolean {
  return role === 'admin'
}

export function canReviewChangeRequests(role: StaffRole | null | undefined): boolean {
  return role === 'admin' || role === 'branch_manager'
}

export function canManageEmployees(
  role: StaffRole | null | undefined,
  canCreate: boolean,
): boolean {
  return role === 'admin' || (role === 'branch_manager' && canCreate)
}

export function homeForRole(role: StaffRole | null | undefined): string {
  return role === 'admin' ? '/admin' : '/staff'
}
