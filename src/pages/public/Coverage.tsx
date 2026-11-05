import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, MapPin, PhoneCall, Search, XCircle } from 'lucide-react'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { useAction, useAsync } from '../../lib/hooks'
import { api } from '../../lib/api'
import type { Branch, BranchCoverage } from '../../lib/types'
import { checkCoverage, COVERAGE_MESSAGES, type CoverageQuery } from '../../lib/coverage'
import { Alert, Button, EmptyState, Field, Input, Loading, Textarea } from '../../components/ui'

export function CoveragePage() {
  const [searchParams] = useSearchParams()
  const [city, setCity] = useState(searchParams.get('city') ?? '')
  const [barangay, setBarangay] = useState(searchParams.get('barangay') ?? '')
  const [address, setAddress] = useState(searchParams.get('address') ?? '')
  const [query, setQuery] = useState<CoverageQuery | null>(() =>
    searchParams.get('city') || searchParams.get('barangay') || searchParams.get('address')
      ? {
          city: searchParams.get('city') ?? '',
          barangay: searchParams.get('barangay') ?? '',
          address: searchParams.get('address') ?? '',
        }
      : null,
  )
  const [requestOpen, setRequestOpen] = useState(false)
  const [submittedRef, setSubmittedRef] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const action = useAction()

  const data = useAsync(async () => {
    if (!supabaseConfigured) {
      return { coverage: [] as BranchCoverage[], branches: [] as Branch[] }
    }
    const [coverageResult, branchResult] = await Promise.all([
      supabase.from('branch_coverage').select('*').order('city'),
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
    ])
    if (coverageResult.error) throw coverageResult.error
    return {
      coverage: (coverageResult.data ?? []) as BranchCoverage[],
      branches: (branchResult.data ?? []) as Branch[],
    }
  }, [])

  const coverageRows = data.data?.coverage ?? []
  const branches = data.data?.branches ?? []

  const result = useMemo(
    () => (query ? checkCoverage(coverageRows, query) : null),
    [coverageRows, query],
  )

  const resultBranch = useMemo(() => {
    if (!result || (result.status !== 'available' && result.status !== 'unavailable')) return null
    return branches.find((branch) => branch.id === result.branchId) ?? null
  }, [branches, result])

  const onCheck = (event: FormEvent) => {
    event.preventDefault()
    if (!city.trim() && !barangay.trim() && !address.trim()) {
      setFormError('Enter your city, barangay or address so we can check coverage.')
      return
    }
    setFormError(null)
    setRequestOpen(false)
    setSubmittedRef(null)
    setQuery({ city, barangay, address })
  }

  const onRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const fullName = String(formData.get('fullName') ?? '').trim()
    const contactNumber = String(formData.get('contactNumber') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const message = String(formData.get('message') ?? '').trim()

    if (fullName.length < 2) {
      setFormError('Enter your full name.')
      return
    }
    if (!/^(\+?63|0)9\d{9}$/.test(contactNumber.replace(/[\s-]/g, ''))) {
      setFormError('Enter a valid PH mobile number, e.g. 09171234567.')
      return
    }
    setFormError(null)

    const ok = await action.run(
      () =>
        api.submitInquiry({
          fullName,
          contactNumber,
          email,
          address: address || undefined,
          city: city || undefined,
          barangay: barangay || undefined,
          branchId: resultBranch?.id,
          message: message || 'Installation request for a future-ready area.',
          type: 'coverage_request',
        }),
      {
        onSuccess: (payload) => {
          const response = payload as { referenceNumber: string }
          setSubmittedRef(response.referenceNumber)
          setRequestOpen(false)
          form.reset()
        },
      },
    )
    if (!ok) return
  }

  const statusIcon = {
    available: <CheckCircle2 size={22} />,
    unavailable: <XCircle size={22} />,
    contact: <AlertTriangle size={22} />,
    empty: <Search size={22} />,
  }

  return (
    <>
      <section className="section-tight" style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--ink-100)' }}>
        <div className="container">
          <span className="eyebrow">Coverage checker</span>
          <h1 style={{ fontSize: 'clamp(1.9rem, 3.6vw, 2.6rem)' }}>Is AON FIBER in your area?</h1>
          <p style={{ maxWidth: 640 }}>
            Search using your city, barangay or complete address. Results are based on coverage
            records maintained by our branch administrators.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card card-pad">
            <h2 style={{ fontSize: '1.25rem' }}>Check availability</h2>
            <form onSubmit={onCheck}>
              <Field label="City / Municipality" htmlFor="coverage-city">
                <Input
                  id="coverage-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="e.g. Quezon City"
                  autoComplete="address-level2"
                />
              </Field>
              <Field label="Barangay" htmlFor="coverage-barangay">
                <Input
                  id="coverage-barangay"
                  value={barangay}
                  onChange={(event) => setBarangay(event.target.value)}
                  placeholder="e.g. Diliman"
                  autoComplete="address-level3"
                />
              </Field>
              <Field
                label="Street or address (optional)"
                htmlFor="coverage-address"
                help="Adding your street or subdivision helps narrow down the result."
              >
                <Input
                  id="coverage-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="e.g. Sikatuna Village"
                  autoComplete="street-address"
                />
              </Field>
              {formError ? <Alert tone="error">{formError}</Alert> : null}
              <Button type="submit" block icon={<Search size={16} />} loading={data.loading}>
                Check coverage
              </Button>
            </form>
            {data.error ? <Alert tone="error">{data.error}</Alert> : null}
          </div>

          <div>
            {data.loading ? <Loading label="Loading coverage records…" /> : null}

            {!data.loading && result ? (
              <div className={`coverage-result ${result.status}`}>
                <div className="coverage-title">
                  {statusIcon[result.status]}
                  {COVERAGE_MESSAGES[result.status]}
                </div>

                {result.status === 'available' ? (
                  <>
                    <p className="small" style={{ marginBottom: 10 }}>
                      {result.matches
                        .map((row) => `${row.barangay}${row.area ? ` (${row.area})` : ''}`)
                        .join(', ')}{' '}
                      {resultBranch ? `is served by ${resultBranch.name}.` : 'is served by AON FIBER.'}
                    </p>
                    <div className="row">
                      {resultBranch ? (
                        <Link className="btn btn-primary btn-sm" to={`/contact?branch=${resultBranch.id}`}>
                          Inquire at this branch
                        </Link>
                      ) : null}
                      <Link className="btn btn-outline btn-sm" to="/plans">
                        View plans
                      </Link>
                    </div>
                  </>
                ) : null}

                {result.status === 'unavailable' ? (
                  <>
                    <p className="small" style={{ marginBottom: 10 }}>
                      Our records show that {result.matches[0]?.barangay}, {result.matches[0]?.city}
                      {' '}is not yet serviceable
                      {result.matches[0]?.notes ? ` — ${result.matches[0].notes}` : ''}. You can
                      request a future installation and the branch will contact you once the area is
                      ready.
                    </p>
                    {submittedRef ? (
                      <Alert tone="success">
                        Request received. Your reference number is <strong>{submittedRef}</strong>.
                        The branch will contact you when service becomes available in your area.
                      </Alert>
                    ) : requestOpen ? (
                      <form onSubmit={onRequest}>
                        <div className="form-grid">
                          <Field label="Full name" htmlFor="req-name" required>
                            <Input id="req-name" name="fullName" required />
                          </Field>
                          <Field label="Mobile number" htmlFor="req-contact" required>
                            <Input
                              id="req-contact"
                              name="contactNumber"
                              placeholder="09171234567"
                              required
                            />
                          </Field>
                          <Field label="Email (optional)" htmlFor="req-email" className="span-2">
                            <Input id="req-email" name="email" type="email" />
                          </Field>
                          <Field label="Notes (optional)" htmlFor="req-message" className="span-2">
                            <Textarea
                              id="req-message"
                              name="message"
                              placeholder="Landmark, preferred schedule, or other details"
                            />
                          </Field>
                        </div>
                        {action.error ? <Alert tone="error">{action.error}</Alert> : null}
                        <div className="row">
                          <Button type="submit" loading={action.busy}>
                            Submit installation request
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setRequestOpen(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="row">
                        <Button onClick={() => setRequestOpen(true)}>
                          Request future installation
                        </Button>
                        {resultBranch ? (
                          <Link className="btn btn-outline btn-sm" to={`/contact?branch=${resultBranch.id}`}>
                            Contact {resultBranch.name}
                          </Link>
                        ) : null}
                      </div>
                    )}
                  </>
                ) : null}

                {result.status === 'contact' ? (
                  <>
                    <p className="small" style={{ marginBottom: 10 }}>
                      We do not have a coverage record for that exact location yet. Our branch team
                      can confirm availability for your address.
                    </p>
                    {result.matches.length > 0 ? (
                      <p className="small" style={{ marginBottom: 10 }}>
                        Nearby configured areas:{' '}
                        {result.matches
                          .map((row) => `${row.barangay}, ${row.city}`)
                          .join(' · ')}
                      </p>
                    ) : null}
                    <div className="row">
                      <Link className="btn btn-primary btn-sm" to="/contact">
                        Send an inquiry
                      </Link>
                      <Link className="btn btn-outline btn-sm" to="/branches">
                        Find the nearest branch
                      </Link>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {!data.loading && !result ? (
              <div className="card card-pad">
                <h3 style={{ fontSize: '1rem' }}>How it works</h3>
                <ol className="small muted" style={{ paddingLeft: '1.1rem' }}>
                  <li>Enter your city and barangay.</li>
                  <li>We compare it with the coverage areas configured by each branch.</li>
                  <li>If we are already there, inquire at the branch that serves your area.</li>
                  <li>If not, request a future installation and we will keep you posted.</li>
                </ol>
                <p className="help" style={{ marginBottom: 0 }}>
                  AON FIBER never invents availability. If a location is not configured, we ask you
                  to confirm with a branch instead of guessing.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section-tight section-muted">
        <div className="container">
          <div className="row-between" style={{ marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', marginBottom: 2 }}>Areas currently on record</h2>
              <p className="small muted" style={{ margin: 0 }}>
                Coverage records maintained by our branch administrators.
              </p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/branches">
              <PhoneCall size={14} /> Branch contacts
            </Link>
          </div>
          {coverageRows.length === 0 && !data.loading ? (
            <EmptyState
              title="Coverage records are being updated"
              hint="Please contact your nearest branch to confirm availability."
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>City</th>
                    <th>Barangay</th>
                    <th>Area</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {coverageRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.city}</td>
                      <td>{row.barangay}</td>
                      <td>{row.area ?? 'Whole barangay'}</td>
                      <td>
                        <span className={`badge ${row.is_serviceable ? 'badge-green' : 'badge-amber'}`}>
                          {row.is_serviceable ? 'Serviceable' : 'Not yet available'}
                        </span>
                      </td>
                      <td className="small muted">{row.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="help" style={{ marginTop: 10 }}>
            <MapPin size={13} className="inline-icon" /> Results are based only on admin-configured
            coverage data.
          </p>
        </div>
      </section>
    </>
  )
}
