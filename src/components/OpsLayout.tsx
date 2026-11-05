import { Suspense, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  ClipboardList,
  FilePlus2,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Router,
  Search,
  ShieldCheck,
  Ticket,
  UserPlus,
  Users,
  Wifi,
  X,
} from 'lucide-react'
import { Brand } from './Brand'
import { Loading } from './ui'
import { useStaffAuth } from '../context/StaffAuth'
import { ROLE_LABELS } from '../lib/permissions'
import { initials } from '../lib/format'

type NavItem = { to: string; label: string; icon: typeof Users; end?: boolean }

export function OpsLayout() {
  const { profile, branch, signOut, online, presenceError } = useStaffAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const isAdmin = profile?.role === 'admin'
  const isManager = profile?.role === 'branch_manager'
  const isAdminPortal = location.pathname.startsWith('/admin')
  const base = isAdminPortal ? '/admin' : '/staff'

  const opsItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      { to: base, label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: `${base}/customers`, label: 'Customers', icon: Users },
      { to: `${base}/customers/new`, label: 'New customer', icon: UserPlus },
      { to: `${base}/inquiries`, label: 'Public inquiries', icon: Search },
      { to: `${base}/installations`, label: 'Installations', icon: Router },
      { to: `${base}/tickets`, label: 'Support tickets', icon: Ticket },
      { to: `${base}/change-requests`, label: 'Change requests', icon: ClipboardList },
    ]
    return items
  }, [base])

  const managerItems = useMemo<NavItem[]>(
    () => [
      { to: '/staff/branch', label: 'Branch performance', icon: Gauge },
      { to: '/staff/monitoring', label: 'Branch monitoring', icon: Activity },
      { to: '/staff/team', label: 'My branch team', icon: Users },
    ],
    [],
  )

  const adminItems: NavItem[] = [
    { to: '/admin/employees', label: 'Employees', icon: ShieldCheck },
    { to: '/admin/monitoring', label: 'Live monitoring', icon: Activity },
    { to: '/admin/reports', label: 'Branch reports', icon: FilePlus2 },
    { to: '/admin/plans', label: 'Internet plans', icon: Wifi },
    { to: '/admin/branches', label: 'Branches', icon: Building2 },
    { to: '/admin/coverage', label: 'Coverage areas', icon: MapPinned },
    { to: '/admin/billing', label: 'Billing', icon: Banknote },
    { to: '/admin/audit', label: 'Audit log', icon: History },
  ]

  const navSection = (label: string, items: NavItem[]) => (
    <div key={label}>
      <div className="sidebar-section">{label}</div>
      <nav className="sidebar-nav" aria-label={label}>
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )

  const handleSignOut = async () => {
    // Clears only this portal's session; the other portal stays signed in.
    await signOut()
    navigate(isAdminPortal ? '/admin/login' : '/staff/login', { replace: true })
  }

  return (
    <div className="layout">
      {sidebarOpen ? (
        <div
          className="sidebar-scrim"
          style={{ position: 'fixed', inset: 0, background: 'rgba(7,26,61,0.4)', zIndex: 45 }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Portal navigation">
        <div className="row-between">
          <Brand compact />
          <button
            type="button"
            className="icon-btn"
            style={{ color: '#dbe7ff' }}
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {navSection('Operations', opsItems)}
        {isManager && !isAdminPortal ? navSection('Branch manager', managerItems) : null}
        {isAdmin && isAdminPortal ? navSection('Administration', adminItems) : null}

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar">{initials(profile?.full_name ?? 'AON')}</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.84rem' }}>
                {profile?.full_name}
              </div>
              <div style={{ fontSize: '0.72rem' }}>
                {profile ? ROLE_LABELS[profile.role] : ''}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: '0.6rem' }}>
            {isAdmin ? 'All branches' : (branch?.name ?? 'No branch assigned')}
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={handleSignOut}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <div className="topbar">
          <div className="topbar-title">
            <button
              type="button"
              className="icon-btn mobile-sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span className="pill" title={presenceError ?? undefined}>
              <span className={`dot ${online ? 'dot-online' : 'dot-offline'}`} />
              {online ? 'Online' : 'Offline'}
            </span>
            {presenceError ? (
              <span
                className="pill"
                title={presenceError}
                style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}
              >
                <AlertTriangle size={13} /> Presence not syncing
              </span>
            ) : null}
            <span className="muted small" style={{ fontWeight: 500 }}>
              {branch?.name ?? 'AON FIBER Operations'}
            </span>
          </div>
          <div className="topbar-actions">
            <a href="/" className="btn btn-ghost btn-sm">
              Public site
            </a>
            <span className="small muted">{profile?.email}</span>
          </div>
        </div>

        <main className="content">
          <Suspense fallback={<Loading label="Loading page…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
