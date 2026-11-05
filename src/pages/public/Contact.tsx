import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Mail, MapPin, PhoneCall } from 'lucide-react'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { useAction, useAsync } from '../../lib/hooks'
import { api } from '../../lib/api'
import type { Branch, InternetPlan } from '../../lib/types'
import { Alert, Button, Field, Input, Select, Textarea } from '../../components/ui'
import { peso } from '../../lib/format'

export function ContactPage() {
  const [searchParams] = useSearchParams()
  const action = useAction()
  const [reference, setReference] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)

  const [branchId, setBranchId] = useState(searchParams.get('branch') ?? '')
  const [planId, setPlanId] = useState(searchParams.get('plan') ?? '')

  const data = useAsync(async () => {
    if (!supabaseConfigured) return { branches: [] as Branch[], plans: [] as InternetPlan[] }
    const [branchResult, planResult] = await Promise.all([
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
      supabase.from('internet_plans').select('*').eq('is_active', true).order('sort_order'),
    ])
    return {
      branches: (branchResult.data ?? []) as Branch[],
      plans: (planResult.data ?? []) as InternetPlan[],
    }
  }, [])

  const branches = data.data?.branches ?? []
  const plans = data.data?.plans ?? []

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const fullName = String(formData.get('fullName') ?? '').trim()
    const contactNumber = String(formData.get('contactNumber') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const address = String(formData.get('address') ?? '').trim()
    const city = String(formData.get('city') ?? '').trim()
    const barangay = String(formData.get('barangay') ?? '').trim()
    const message = String(formData.get('message') ?? '').trim()

    if (fullName.length < 2) {
      setFormError('Enter your full name.')
      return
    }
    if (!/^(\+?63|0)9\d{9}$/.test(contactNumber.replace(/[\s-]/g, ''))) {
      setFormError('Enter a valid PH mobile number, e.g. 09171234567.')
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Enter a valid email address or leave it blank.')
      return
    }
    setFormError(null)

    await action.run(
      () =>
        api.submitInquiry({
          fullName,
          contactNumber,
          email: email || undefined,
          address: address || undefined,
          city: city || undefined,
          barangay: barangay || undefined,
          branchId: branchId || undefined,
          planId: planId || undefined,
          message: message || undefined,
        }),
      {
        onSuccess: (payload) => {
          setReference((payload as { referenceNumber: string }).referenceNumber)
          form.reset()
          setBranchId('')
          setPlanId('')
          setFormKey((value) => value + 1)
        },
      },
    )
  }

  return (
    <>
      <section className="section-tight" style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--ink-100)' }}>
        <div className="container">
          <span className="eyebrow">Contact us</span>
          <h1 style={{ fontSize: 'clamp(1.9rem, 3.6vw, 2.6rem)' }}>Inquire at your nearest branch</h1>
          <p style={{ maxWidth: 660 }}>
            Tell us where you are and what you need. Your inquiry goes straight to the branch that
            serves your area, and a representative will get in touch.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card card-pad">
            <h2 style={{ fontSize: '1.25rem' }}>Send an inquiry</h2>
            <p className="small muted">
              This form is for prospective customers. Existing customers can file concerns in the{' '}
              <a href="/portal/login">Customer Portal</a>.
            </p>

            {reference ? (
              <Alert tone="success">
                <strong>Inquiry received.</strong> Your reference number is{' '}
                <strong>{reference}</strong>. The branch will contact you using the details you
                provided.
                <div style={{ marginTop: 10 }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReference(null)}
                    type="button"
                  >
                    Send another inquiry
                  </Button>
                </div>
              </Alert>
            ) : null}

            <form key={formKey} onSubmit={onSubmit} noValidate>
              <div className="form-grid">
                <Field label="Full name" htmlFor="contact-name" required>
                  <Input id="contact-name" name="fullName" autoComplete="name" required />
                </Field>
                <Field label="Mobile number" htmlFor="contact-phone" required>
                  <Input
                    id="contact-phone"
                    name="contactNumber"
                    placeholder="09171234567"
                    autoComplete="tel"
                    required
                  />
                </Field>
                <Field label="Email (optional)" htmlFor="contact-email">
                  <Input id="contact-email" name="email" type="email" autoComplete="email" />
                </Field>
                <Field label="Preferred branch" htmlFor="contact-branch">
                  <Select
                    id="contact-branch"
                    name="branchId"
                    value={branchId}
                    onChange={(event) => setBranchId(event.target.value)}
                  >
                    <option value="">Let AON FIBER assign one</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name} — {branch.city}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Desired internet plan" htmlFor="contact-plan" className="span-2">
                  <Select
                    id="contact-plan"
                    name="planId"
                    value={planId}
                    onChange={(event) => setPlanId(event.target.value)}
                  >
                    <option value="">Not sure yet</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} — {plan.speed_mbps} Mbps — {peso(plan.monthly_price)}/month
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Street address" htmlFor="contact-address" className="span-2">
                  <Input
                    id="contact-address"
                    name="address"
                    autoComplete="street-address"
                    placeholder="House number, street, village"
                  />
                </Field>
                <Field label="City / Municipality" htmlFor="contact-city">
                  <Input id="contact-city" name="city" autoComplete="address-level2" />
                </Field>
                <Field label="Barangay" htmlFor="contact-barangay">
                  <Input id="contact-barangay" name="barangay" autoComplete="address-level3" />
                </Field>
                <Field label="Inquiry details" htmlFor="contact-message" className="span-2">
                  <Textarea
                    id="contact-message"
                    name="message"
                    placeholder="Tell us about your location, preferred installation date or any questions."
                  />
                </Field>
              </div>

              {formError ? <Alert tone="error">{formError}</Alert> : null}
              {action.error ? <Alert tone="error">{action.error}</Alert> : null}

              <Button type="submit" loading={action.busy} block>
                Submit inquiry
              </Button>
              <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>
                By submitting, you agree to be contacted by AON FIBER about your inquiry.
              </p>
            </form>
          </div>

          <div className="stack">
            <div className="card card-pad">
              <h3 style={{ fontSize: '1.05rem' }}>Talk to us directly</h3>
              <div className="stack-sm small">
                <div className="row" style={{ gap: '0.5rem' }}>
                  <PhoneCall size={15} color="var(--blue-700)" />
                  <span>(02) 8555-0110 · Mon–Sat, 8 AM–6 PM</span>
                </div>
                <div className="row" style={{ gap: '0.5rem' }}>
                  <Mail size={15} color="var(--blue-700)" />
                  <a href="mailto:hello@aonfiber.example">hello@aonfiber.example</a>
                </div>
                <div className="row" style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
                  <MapPin size={15} color="var(--blue-700)" style={{ marginTop: 3 }} />
                  <span>88 Cyber Avenue, Diliman, Quezon City</span>
                </div>
              </div>
            </div>

            {branches.length > 0 ? (
              <div className="card">
                <div className="card-header">
                  <h3>Branch hotlines</h3>
                  <Link className="small" to="/branches">Details</Link>
                </div>
                <div className="card-body stack-sm">
                  {branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="row-between"
                      style={{ paddingBottom: 8, borderBottom: '1px solid var(--ink-100)' }}
                    >
                      <div>
                        <div className="strong" style={{ fontSize: '0.88rem' }}>{branch.name}</div>
                        <div className="small muted">{branch.address}</div>
                      </div>
                      <span className="small nowrap">
                        {branch.contact_number ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="card card-pad" style={{ background: 'var(--blue-50)', borderColor: 'var(--blue-100)' }}>
              <div className="row" style={{ gap: '0.5rem', marginBottom: 6 }}>
                <CheckCircle2 size={17} color="var(--green, #15803d)" />
                <strong style={{ fontSize: '0.92rem' }}>Already a customer?</strong>
              </div>
              <p className="small muted" style={{ marginBottom: 10 }}>
                Use your account number and a one-time verification code to sign in to the Customer
                Portal for billing, installation status and support tickets.
              </p>
              <a className="btn btn-outline btn-sm" href="/portal/login">
                Go to Customer Portal
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
