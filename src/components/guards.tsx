import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useStaffAuth } from '../context/StaffAuth'
import { useCustomerAuth } from '../context/CustomerAuth'
import { supabaseConfigured } from '../lib/supabase'
import { Loading } from './ui'
import type { StaffRole } from '../lib/types'
import { Link } from 'react-router-dom'

export function ConfigMissing() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Configuration needed</h1>
        <p>
          This portal needs Supabase credentials before it can sign anyone in. Copy{' '}
          <code>.env.example</code> to <code>.env</code>, add your project URL and anon key, then
          restart the dev server.
        </p>
        <Link className="btn btn-primary btn-block" to="/">
          Back to the website
        </Link>
      </div>
    </div>
  )
}

function Forbidden() {
  return (
    <div className="empty-state" style={{ paddingTop: '3rem' }}>
      <ShieldAlert size={28} color="var(--danger)" />
      <h2 style={{ marginTop: '0.75rem', fontSize: '1.2rem' }}>You do not have access to this page</h2>
      <p className="small">
        Your role does not include this permission. Ask your branch manager or an administrator if
        you need access.
      </p>
      <Link className="btn btn-outline" to={window.location.pathname.startsWith('/admin') ? '/admin' : '/staff'}>
        Back to my dashboard
      </Link>
    </div>
  )
}

export function RequireStaff({ roles }: { roles?: StaffRole[] }) {
  const { profile, loading } = useStaffAuth()
  const location = useLocation()
  const isAdminPortal = location.pathname.startsWith('/admin')

  if (!supabaseConfigured) return <ConfigMissing />
  if (loading) return <Loading label="Checking your session…" />
  if (!profile) {
    return (
      <Navigate
        to={isAdminPortal ? '/admin/login' : '/staff/login'}
        replace
        state={{ from: location.pathname }}
      />
    )
  }
  // The Admin Portal is administrator-only, whatever the browser asks for.
  if (isAdminPortal && profile.role !== 'admin') return <Forbidden />
  if (roles && !roles.includes(profile.role)) return <Forbidden />
  return <Outlet />
}

export function RequireCustomer({ children }: { children?: ReactNode }) {
  const { customer, loading, profileChecked } = useCustomerAuth()
  const location = useLocation()

  if (!supabaseConfigured) return <ConfigMissing />
  if (loading || !profileChecked) return <Loading label="Loading your account…" />
  if (!customer) return <Navigate to="/portal/login" replace state={{ from: location.pathname }} />
  return children ? <>{children}</> : <Outlet />
}

export function StaffRoleGate({ roles, children }: { roles: StaffRole[]; children: ReactNode }) {
  const { profile } = useStaffAuth()
  if (!profile || !roles.includes(profile.role)) return <Forbidden />
  return <>{children}</>
}
