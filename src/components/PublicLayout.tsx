import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, PhoneCall, MapPin, AlertTriangle } from 'lucide-react'
import { Brand } from './Brand'
import { supabaseConfigured } from '../lib/supabase'

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/plans', label: 'Internet Plans' },
  { to: '/coverage', label: 'Coverage Checker' },
  { to: '/about', label: 'About Us' },
  { to: '/branches', label: 'Branches' },
  { to: '/contact', label: 'Contact Us' },
]

function Header() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <header className="site-header">
      <div className="container">
        <Brand />
        <nav className="nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          {/* Portal links are full page loads so each portal loads its own auth session. */}
          <a className="btn btn-ghost btn-sm" href="/portal/login">
            Customer Portal
          </a>
          <a className="btn btn-primary btn-sm" href="/staff/login">
            Employee Portal
          </a>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      <div className={`nav-mobile ${open ? 'open' : ''}`}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        <a className="nav-link" href="/portal/login">
          Customer Portal
        </a>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Brand />
            <p style={{ color: '#cfe0ff', marginTop: '0.9rem', maxWidth: 280 }}>
              AON FIBER Telecommunications delivers fiber internet across the Philippines.
              Speed without limits.
            </p>
            <div className="row" style={{ fontSize: '0.85rem' }}>
              <PhoneCall size={15} />
              <span>(02) 8555-0110</span>
            </div>
          </div>
          <div>
            <h4>Company</h4>
            <div className="stack-sm small">
              <Link to="/about">About Us</Link>
              <Link to="/branches">Branches</Link>
              <Link to="/plans">Internet Plans</Link>
              <Link to="/coverage">Coverage Checker</Link>
            </div>
          </div>
          <div>
            <h4>Portals</h4>
            <div className="stack-sm small">
              <a href="/portal/login">Customer Portal</a>
              <a href="/staff/login">Employee Portal</a>
              <Link to="/contact">Public Inquiry</Link>
              <Link to="/branches">Find a Branch</Link>
            </div>
          </div>
          <div>
            <h4>Visit us</h4>
            <p className="small" style={{ color: '#cfe0ff' }}>
              <MapPin size={14} className="inline-icon" /> Head office: 88 Cyber Avenue,
              Diliman, Quezon City
            </p>
            <p className="small" style={{ color: '#9db8e8' }}>
              Branch hours: Mon–Sat, 8:00 AM – 6:00 PM
            </p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} AON FIBER Telecommunications. All rights reserved.</span>
          <span>Speed Without Limits.</span>
        </div>
      </div>
    </footer>
  )
}

export function PublicLayout() {
  return (
    <div>
      {!supabaseConfigured ? (
        <div className="notice-strip">
          <div className="container">
            <AlertTriangle size={15} />
            <span>
              Supabase is not configured. Public content will be empty until .env is filled in.
            </span>
          </div>
        </div>
      ) : null}
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
