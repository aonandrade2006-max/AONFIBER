import { Link } from 'react-router-dom'
import { FileQuestion, PhoneCall } from 'lucide-react'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import type { InternetPlan } from '../../lib/types'
import { PlanCard } from '../../components/PlanCard'
import { EmptyState, Loading } from '../../components/ui'
import { peso } from '../../lib/format'

export function PlansPage() {
  const plans = useAsync(async () => {
    if (!supabaseConfigured) return [] as InternetPlan[]
    const { data, error } = await supabase
      .from('internet_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw error
    return (data ?? []) as InternetPlan[]
  }, [])

  const rows = plans.data ?? []

  return (
    <>
      <section className="section-tight" style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--ink-100)' }}>
        <div className="container">
          <span className="eyebrow">Internet plans</span>
          <h1 style={{ fontSize: 'clamp(1.9rem, 3.6vw, 2.6rem)' }}>Fiber plans for every household</h1>
          <p style={{ maxWidth: 640 }}>
            All plans include unlimited data, a free standard installation and a Wi-Fi router.
            Prices are monthly and inclusive of applicable taxes.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {plans.loading ? (
            <Loading label="Loading plans…" />
          ) : plans.error ? (
            <EmptyState title="We could not load the plans" hint={plans.error} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No plans are published right now"
              hint="Please contact your nearest branch for the latest offers."
            />
          ) : (
            <div className="grid grid-3">
              {rows.map((plan, index) => (
                <PlanCard key={plan.id} plan={plan} featured={index === 1} />
              ))}
            </div>
          )}
        </div>
      </section>

      {rows.length > 0 ? (
        <section className="section-tight">
          <div className="container">
            <div className="card">
              <div className="card-header">
                <h3>Plan comparison</h3>
                <span className="small muted">Updated by AON FIBER administrators</span>
              </div>
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Speed</th>
                      <th>Monthly fee</th>
                      <th>Inclusions</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((plan) => (
                      <tr key={plan.id}>
                        <td className="strong">{plan.name}</td>
                        <td>{plan.speed_mbps} Mbps</td>
                        <td>{peso(plan.monthly_price)}</td>
                        <td className="small muted">{(plan.features ?? []).join(' · ') || '—'}</td>
                        <td className="right">
                          <Link className="btn btn-outline btn-sm" to={`/contact?plan=${plan.id}`}>
                            Inquire
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="container grid grid-2">
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 10 }}>
              <FileQuestion size={20} color="var(--blue-700)" />
              <h3 style={{ margin: 0 }}>Which plan should I choose?</h3>
            </div>
            <p className="small muted">
              For 1–3 devices and casual browsing, Fiber Start is enough. Households with several
              streamers or remote workers usually prefer Fiber Plus or Fiber Max. Creators and small
              businesses should look at Fiber Pro or Fiber Ultra.
            </p>
            <ul className="small" style={{ color: 'var(--ink-700)' }}>
              <li>Fiber Start — 1 to 3 devices, browsing and HD streaming</li>
              <li>Fiber Plus — families, work from home, multiple screens</li>
              <li>Fiber Max — gaming, 4K streaming, many connected devices</li>
              <li>Fiber Pro / Ultra — creators and business-grade usage</li>
            </ul>
          </div>
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 10 }}>
              <PhoneCall size={20} color="var(--blue-700)" />
              <h3 style={{ margin: 0 }}>Apply at a branch</h3>
            </div>
            <p className="small muted">
              AON FIBER accounts are opened in person so we can verify your address and schedule
              installation properly. Bring a valid ID and proof of billing address.
            </p>
            <p className="small muted">
              Once your account is created, you can manage billing and support requests in the
              Customer Portal using your account number.
            </p>
            <div className="row">
              <Link className="btn btn-primary" to="/contact">
                Send an inquiry
              </Link>
              <a className="btn btn-ghost" href="/portal/login">
                Customer Portal
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
