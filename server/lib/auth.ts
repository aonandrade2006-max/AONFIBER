import type { NextFunction, Request, Response } from 'express'
import { getAdminClient, getAuthUser } from './supabase'
import { HttpError } from './http'

export type StaffRole = 'admin' | 'branch_manager' | 'employee'

export type StaffSession = {
  id: string
  email: string
  fullName: string
  role: StaffRole
  branchId: string | null
  status: string
  canCreateEmployees: boolean
}

export function getStaff(res: Response): StaffSession {
  const staff = res.locals.staff as StaffSession | undefined
  if (!staff) throw new HttpError(401, 'Authentication required.')
  return staff
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

export async function requireStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = bearerToken(req)
    if (!token) throw new HttpError(401, 'Authentication required.')

    const user = await getAuthUser(token)
    if (!user) throw new HttpError(401, 'Session expired. Please sign in again.')

    const roleFromToken =
      user.app_metadata?.role ? String(user.app_metadata.role) : undefined

    const { data: profile, error } = await getAdminClient()
      .from('profiles')
      .select('id, email, full_name, role, branch_id, status, can_create_employees')
      .eq('id', user.id)
      .maybeSingle()

    if (error) throw new HttpError(500, 'Unable to load your staff profile.')
    if (!profile) throw new HttpError(403, 'This account is not a staff account.')

    if (profile.status === 'suspended') {
      throw new HttpError(403, 'This account is suspended. Contact an administrator.')
    }
    if (profile.status !== 'active') {
      throw new HttpError(403, 'This account is inactive. Contact an administrator.')
    }

    const effectiveRole: StaffRole =
      roleFromToken === 'admin' && profile.role !== 'admin'
        ? 'admin'
        : (profile.role as StaffRole)

    res.locals.staff = {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: effectiveRole,
      branchId: profile.branch_id,
      status: profile.status,
      canCreateEmployees: Boolean(profile.can_create_employees),
    } satisfies StaffSession

    // Best-effort activity stamp used by the monitoring dashboard.
    void getAdminClient()
      .from('profiles')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', profile.id)

    next()
  } catch (error) {
    next(error)
  }
}

export function requireRole(...roles: StaffRole[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const staff = res.locals.staff as StaffSession | undefined
    if (!staff) {
      next(new HttpError(401, 'Authentication required.'))
      return
    }
    if (!roles.includes(staff.role)) {
      next(new HttpError(403, 'You do not have permission to perform this action.'))
      return
    }
    next()
  }
}

/**
 * Employees and branch managers are scoped to their own branch. Admins can act
 * on any branch. Passing a branch that is out of scope is a 403.
 */
export function assertBranchScope(staff: StaffSession, branchId: string | null): void {
  if (staff.role === 'admin') return
  if (!staff.branchId || staff.branchId !== branchId) {
    throw new HttpError(403, 'You can only manage records for your assigned branch.')
  }
}
