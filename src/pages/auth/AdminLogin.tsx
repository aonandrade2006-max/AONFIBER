import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Brand } from '../../components/Brand'
import { Alert, Button, Field, Input } from '../../components/ui'
import { useStaffAuth } from '../../context/StaffAuth'
import { homeForRole } from '../../lib/permissions'
import { supabaseConfigured } from '../../lib/supabase'
import { ConfigMissing } from '../../components/guards'

export function AdminLoginPage() {
  const { signIn, profile } = useStaffAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabaseConfigured) return <ConfigMissing />

  const from = (location.state as { from?: string } | null)?.from

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      await signIn(email, password)
      navigate(from && from.startsWith('/admin') ? from : '/admin', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div>
        <div className="auth-card">
          <Brand />
          <h1>Admin Portal</h1>
          <p className="small muted">
            For AON FIBER administrators only. Staff accounts are created by the administrator.
          </p>

          {profile ? (
            <Alert tone="info">
              You are already signed in as <strong>{profile.full_name}</strong>.{' '}
              <Link to={homeForRole(profile.role)}>Continue to your dashboard</Link>.
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} noValidate>
            <Field label="Admin email" htmlFor="admin-email" required>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                placeholder="admin@aonfiber.example"
                required
              />
            </Field>
            <Field label="Password" htmlFor="admin-password" required>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <Button type="submit" block loading={busy} icon={<LockKeyhole size={16} />}>
              Sign in
            </Button>
          </form>

          <div className="auth-footer">
            <ShieldCheck size={14} className="inline-icon" /> Admin accounts are created by
            the super administrator. Contact support if you cannot sign in.
            <div style={{ marginTop: 10 }}>
              <a href="/staff/login">Employee or branch manager sign-in</a>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Link to="/" className="auth-back">
            <ArrowLeft size={14} /> Back to the AON FIBER website
          </Link>
        </div>
      </div>
    </div>
  )
}