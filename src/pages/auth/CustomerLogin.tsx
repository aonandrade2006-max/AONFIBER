import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, MailCheck, ShieldCheck } from 'lucide-react'
import { Brand } from '../../components/Brand'
import { Alert, Button, Field, Input } from '../../components/ui'
import { api } from '../../lib/api'
import { customerSupabase as supabase, supabaseConfigured } from '../../lib/supabase'
import { useCustomerAuth } from '../../context/CustomerAuth'
import { ConfigMissing } from '../../components/guards'

type Stage = 'account' | 'code'

export function CustomerLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refresh, signOut, customer, session, profileChecked } = useCustomerAuth()
  const [stage, setStage] = useState<Stage>('account')
  const [accountNumber, setAccountNumber] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [externalEnabled, setExternalEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabaseConfigured) return <ConfigMissing />

  const from = (location.state as { from?: string } | null)?.from ?? '/portal'
  const staffSessionOnCustomerPortal = Boolean(session && profileChecked && !customer)

  const requestCode = async () => {
    setError(null)
    setNotice(null)
    setDevCode(null)
    if (!accountNumber.trim()) {
      setError('Enter your AON FIBER account number.')
      return
    }
    setBusy(true)
    try {
      const response = await api.requestCustomerCode(accountNumber.trim().toUpperCase())
      setStage('code')
      setNotice(response.message)
      setExternalEnabled(response.externalNotifications === 'enabled')
      if (response.devCode) setDevCode(response.devCode)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send a verification code.')
    } finally {
      setBusy(false)
    }
  }

  const onRequestSubmit = (event: FormEvent) => {
    event.preventDefault()
    void requestCode()
  }

  const onVerify = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const cleaned = code.replace(/\D/g, '')
    if (cleaned.length !== 6) {
      setError('Enter the 6-digit verification code.')
      return
    }
    setBusy(true)
    try {
      const response = await api.verifyCustomerCode(accountNumber.trim().toUpperCase(), cleaned)
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: response.tokenHash,
        type: 'magiclink',
      })
      if (verifyError) throw new Error(verifyError.message)
      await refresh()
      navigate(from, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div>
        <div className="auth-card">
          <Brand />
          <h1>Customer Portal</h1>
          <p className="small muted">
            Sign in with the account number issued by your AON FIBER branch. No password needed —
            we send a one-time code to your registered contact details.
          </p>

          {staffSessionOnCustomerPortal ? (
            <Alert tone="warn">
              This browser is signed in with a staff account. Customer sign-in requires an AON FIBER
              customer account. <a href="/staff/login">Go to the Employee Portal</a> or{' '}
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  void signOut()
                }}
              >
                sign out
              </button>
              .
            </Alert>
          ) : null}

          {stage === 'account' ? (
            <form onSubmit={onRequestSubmit} noValidate>
              <Field
                label="Account number"
                htmlFor="account-number"
                required
                help="Example: AON-100001. It is printed on your account receipt."
              >
                <Input
                  id="account-number"
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value.toUpperCase())}
                  placeholder="AON-100001"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </Field>

              {externalEnabled === false ? (
                <Alert tone="info">
                  External email and SMS notifications are not enabled yet, so in-app notifications
                  are used. In development the verification code is shown on the next screen.
                </Alert>
              ) : null}

              {error ? <Alert tone="error">{error}</Alert> : null}

              <Button type="submit" block loading={busy} icon={<KeyRound size={16} />}>
                Send verification code
              </Button>
            </form>
          ) : (
            <form onSubmit={onVerify} noValidate>
              <Alert tone="info">{notice ?? 'Enter the verification code we sent you.'}</Alert>

              {devCode ? (
                <Alert tone="warn">
                  <strong>Development mode:</strong> no email/SMS provider is configured. Your
                  verification code is <strong style={{ letterSpacing: '0.2em' }}>{devCode}</strong>.
                </Alert>
              ) : null}

              <Field
                label="Verification code"
                htmlFor="verification-code"
                required
                help="The code expires after 10 minutes."
              >
                <Input
                  id="verification-code"
                  className="code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                />
              </Field>

              {error ? <Alert tone="error">{error}</Alert> : null}

              <Button type="submit" block loading={busy} icon={<MailCheck size={16} />}>
                Verify and sign in
              </Button>

              <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    setStage('account')
                    setCode('')
                    setError(null)
                    setDevCode(null)
                  }}
                >
                  Use a different account
                </button>
                <button type="button" className="btn-link" onClick={() => void requestCode()} disabled={busy}>
                  Resend code
                </button>
              </div>
            </form>
          )}

          <div className="auth-footer">
            <ShieldCheck size={14} className="inline-icon" /> Customers cannot create accounts
            online. Visit any AON FIBER branch to open one.
            <div style={{ marginTop: 10 }}>
              <a href="/staff/login">Employee or admin sign-in</a>
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
