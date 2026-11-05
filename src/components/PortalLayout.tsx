import { Suspense } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CreditCard, LayoutDashboard, LifeBuoy, LogOut } from 'lucide-react'
import { Brand } from './Brand'
import { Loading } from './ui'
import { useCustomerAuth } from '../context/CustomerAuth'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/hooks'

export function PortalLayout() {
  const { customer, signOut } = useCustomerAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const unread = useAsync(async () => {
    if (!customer) return 0
    const { count } = await supabase
      .from('customer_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id)
      .eq('is_read', false)
    return count ?? 0
  }, [customer?.id, location.pathname])

  const handleSignOut = async () => {
    await signOut()
    navigate('/portal/login', { replace: true })
  }

  const links = [
    { to: '/portal', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/portal/billing', label: 'Billing', icon: CreditCard },
    { to: '/portal/support', label: 'Support', icon: LifeBuoy },
    { to: '/portal/notifications', label: 'Notifications', icon: Bell },
  ]

  return (
    <div className="layout">
      <header className="site-header">
        <div className="container" style={{ minHeight: 68 }}>
          <Brand />
          <nav className="nav" aria-label="Customer portal navigation">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {link.label}
                {link.to === '/portal/notifications' && (unread.data ?? 0) > 0 ? (
                  <span className="badge badge-red" style={{ marginLeft: 6 }}>
                    {unread.data}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>
          <div className="nav-actions">
            <span className="small muted nowrap">
              {customer?.full_name} · {customer?.account_number}
            </span>
            <Link to="/" className="btn btn-ghost btn-sm">
              Website
            </Link>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleSignOut}>
              <LogOut size={14} />
              <span className="btn-label">Sign out</span>
            </button>
          </div>
        </div>
        <div className="nav-mobile portal-mobile-nav" style={{ paddingTop: 0, borderTop: 0 }}>
          <div className="row" style={{ overflowX: 'auto', paddingBottom: 4 }}>
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      <main className="content" style={{ background: 'var(--surface-muted)', maxWidth: 'none' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <Suspense fallback={<Loading label="Loading page…" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
