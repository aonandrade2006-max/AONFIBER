import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Cpu,
  Headphones,
  MapPin,
  Rocket,
  ShieldCheck,
  Wifi,
} from 'lucide-react'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import type { Branch, InternetPlan } from '../../lib/types'
import { PlanCard } from '../../components/PlanCard'
import { Button, Field, Input, Loading, EmptyState } from '../../components/ui'

export function HomePage() {
  const navigate = useNavigate()
  const [city, setCity] = useState('')
  const [barangay, setBarangay] = useState('')

  const plans = useAsync(async () => {
    if (!supabaseConfigured) return [] as InternetPlan[]
    const { data } = await supabase
      .from('internet_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .limit(3)
    return (data ?? []) as InternetPlan[]
  }, [])

  const branches = useAsync(async () => {
    if (!supabaseConfigured) return [] as Branch[]
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name')
    return (data ?? []) as Branch[]
  }, [])

  const onCheck = (event: FormEvent) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (city.trim()) params.set('city', city.trim())
    if (barangay.trim()) params.set('barangay', barangay.trim())
    navigate(`/coverage?${params.toString()}`)
  }

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="hero-badge">
              <Wifi size={14} /> AON FIBER Telecommunications
            </span>
            <h1>Speed Without Limits.</h1>
            <p>
              Fiber internet built for Filipino homes and businesses. Stream, game, work and grow
              with plans that never slow you down — backed by local branches that know your area.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-cyan" to="/contact">
                Inquire at Your Nearest Branch <ArrowRight size={16} />
              </Link>
              <Link className="btn btn-outline" to="/plans">
                View internet plans
              </Link>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <strong>{branches.data?.length ?? 6}</strong>
                <span>Branches nationwide</span>
              </div>
              <div className="hero-stat">
                <strong>1 Gbps</strong>
                <span>Fastest fiber plan</span>
              </div>
              <div className="hero-stat">
                <strong>24/7</strong>
                <span>Technical support</span>
              </div>
            </div>
          </div>

          <form className="hero-panel" onSubmit={onCheck} aria-label="Quick coverage check">
            <h3>Check your area</h3>
            <p className="small muted">
              Enter your location to see if AON FIBER is already available in your barangay.
            </p>
            <Field label="City / Municipality" htmlFor="home-city">
              <Input
                id="home-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="e.g. Quezon City"
                autoComplete="address-level2"
              />
            </Field>
            <Field label="Barangay" htmlFor="home-barangay">
              <Input
                id="home-barangay"
                value={barangay}
                onChange={(event) => setBarangay(event.target.value)}
                placeholder="e.g. Diliman"
                autoComplete="address-level3"
              />
            </Field>
            <Button type="submit" block>
              Check availability
            </Button>
            <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>
              Coverage results come directly from branch records configured by our team.
            </p>
          </form>
        </div>
      </section>

      <div className="trust-strip">
        <div className="container">
          <span>✓ Fiber-ready branches nationwide</span>
          <span>✓ Unlimited data on every plan</span>
          <span>✓ Free standard installation</span>
          <span>✓ Local support, real people</span>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Internet plans</span>
            <h2>Pick the speed that fits your home</h2>
            <p>
              Straightforward monthly pricing, no hidden charges. Every plan includes unlimited
              data and a Wi-Fi router.
            </p>
          </div>
          {plans.loading ? (
            <Loading label="Loading plans…" />
          ) : plans.error ? (
            <EmptyState title="Plans are unavailable right now" hint={plans.error} />
          ) : (plans.data ?? []).length === 0 ? (
            <EmptyState title="No plans published yet" hint="An administrator can add plans in the Admin Portal." />
          ) : (
            <div className="grid grid-3">
              {(plans.data ?? []).map((plan, index) => (
                <PlanCard key={plan.id} plan={plan} featured={index === 1} />
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: '1.75rem' }}>
            <Link className="btn btn-outline" to="/plans">
              See all plans and inclusions <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-muted">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Why AON FIBER</span>
            <h2>Fiber that keeps up with your day</h2>
          </div>
          <div className="grid grid-4">
            {[
              {
                icon: Rocket,
                title: 'True fiber speeds',
                text: 'Up to 1 Gbps symmetrical fiber delivered over our own network.',
              },
              {
                icon: ShieldCheck,
                title: 'Reliable connection',
                text: 'Redundant backbone links and proactive network monitoring.',
              },
              {
                icon: Headphones,
                title: 'Local support',
                text: 'Walk into any branch or file a ticket from the customer portal.',
              },
              {
                icon: Cpu,
                title: 'Modern equipment',
                text: 'Wi-Fi 6 routers and mesh-ready hardware for every plan.',
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div className="card card-pad" key={item.title}>
                  <div className="stat-icon" style={{ marginBottom: 12 }}>
                    <Icon size={20} />
                  </div>
                  <h3 style={{ fontSize: '1rem' }}>{item.title}</h3>
                  <p className="small muted" style={{ marginBottom: 0 }}>{item.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: 'center' }}>
          <div>
            <span className="eyebrow">Coverage</span>
            <h2>Already in your barangay?</h2>
            <p>
              Our coverage checker reads live branch records. If your area is not on the list yet,
              you can request a future installation and the nearest branch will keep you updated.
            </p>
            <ul className="stack-sm" style={{ listStyle: 'none', padding: 0 }}>
              {[
                'Check availability in seconds',
                'Request installation in unserved areas',
                'Talk to the branch assigned to your address',
              ].map((text) => (
                <li key={text} className="row" style={{ color: 'var(--ink-700)', gap: '0.5rem' }}>
                  <CheckCircle2 size={16} color="var(--cyan-500)" /> {text}
                </li>
              ))}
            </ul>
            <div className="row" style={{ marginTop: '1.5rem' }}>
              <Link className="btn btn-primary" to="/coverage">
                Check coverage <MapPin size={15} />
              </Link>
              <Link className="btn btn-ghost" to="/branches">
                Find a branch
              </Link>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3>Our branches</h3>
              <Link className="small" to="/branches">View all</Link>
            </div>
            <div className="card-body stack-sm">
              {(branches.data ?? []).slice(0, 4).map((branch) => (
                <div className="row-between" key={branch.id} style={{ paddingBottom: 10, borderBottom: '1px solid var(--ink-100)' }}>
                  <div>
                    <div className="strong" style={{ fontSize: '0.92rem' }}>{branch.name}</div>
                    <div className="small muted">
                      {branch.address}, {branch.city}
                    </div>
                  </div>
                  <Building2 size={18} color="var(--blue-600)" />
                </div>
              ))}
              {(branches.data ?? []).length === 0 && !branches.loading ? (
                <p className="small muted" style={{ margin: 0 }}>Branch list is being updated.</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="container">
          <div className="card card-pad" style={{ background: 'linear-gradient(135deg, #072a6e, #1150c9)', border: 0 }}>
            <div className="row-between">
              <div style={{ maxWidth: 620 }}>
                <h2 style={{ color: '#fff', marginBottom: 6 }}>Ready to get connected?</h2>
                <p style={{ color: '#d7e5ff', marginBottom: 0 }}>
                  Visit the AON FIBER branch nearest you to open an account. An authorized
                  representative will create your customer account and issue your account number.
                </p>
              </div>
              <Link className="btn btn-cyan" to="/contact">
                Inquire at Your Nearest Branch <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
