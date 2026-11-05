import { Link } from 'react-router-dom'
import { Building2, Clock, Mail, MapPin, PhoneCall } from 'lucide-react'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import type { Branch } from '../../lib/types'
import { EmptyState, Loading } from '../../components/ui'

export function BranchesPage() {
  const branches = useAsync(async () => {
    if (!supabaseConfigured) return [] as Branch[]
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    return (data ?? []) as Branch[]
  }, [])

  const rows = branches.data ?? []

  return (
    <>
      <section className="section-tight" style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--ink-100)' }}>
        <div className="container">
          <span className="eyebrow">Branches</span>
          <h1 style={{ fontSize: 'clamp(1.9rem, 3.6vw, 2.6rem)' }}>Find the AON FIBER branch nearest you</h1>
          <p style={{ maxWidth: 660 }}>
            Come in to apply for a new connection, settle your bill or ask for technical help. Our
            branch teams handle accounts for the areas they serve.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {branches.loading ? (
            <Loading label="Loading branches…" />
          ) : branches.error ? (
            <EmptyState title="Branches are unavailable right now" hint={branches.error} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No branches published yet"
              hint="Please call (02) 8555-0110 or send us an inquiry."
            />
          ) : (
            <div className="grid grid-2">
              {rows.map((branch) => (
                <article className="card card-pad" key={branch.id}>
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <div className="stat-icon">
                        <Building2 size={20} />
                      </div>
                      <div>
                        <h3 style={{ marginBottom: 2 }}>{branch.name}</h3>
                        <div className="small muted">{branch.city}, {branch.province}</div>
                      </div>
                    </div>
                  </div>
                  <div className="stack-sm small" style={{ marginTop: '1rem' }}>
                    <div className="row" style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
                      <MapPin size={15} color="var(--blue-700)" style={{ marginTop: 3 }} />
                      <span>{branch.address}, {branch.city}, {branch.province}</span>
                    </div>
                    {branch.contact_number ? (
                      <div className="row" style={{ gap: '0.5rem' }}>
                        <PhoneCall size={15} color="var(--blue-700)" />
                        <a href={`tel:${branch.contact_number.replace(/[^\d+]/g, '')}`}>
                          {branch.contact_number}
                        </a>
                      </div>
                    ) : null}
                    {branch.email ? (
                      <div className="row" style={{ gap: '0.5rem' }}>
                        <Mail size={15} color="var(--blue-700)" />
                        <a href={`mailto:${branch.email}`}>{branch.email}</a>
                      </div>
                    ) : null}
                    <div className="row" style={{ gap: '0.5rem' }}>
                      <Clock size={15} color="var(--blue-700)" />
                      <span>Mon–Sat, 8:00 AM – 6:00 PM</span>
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: '1.1rem' }}>
                    <Link className="btn btn-primary btn-sm" to={`/contact?branch=${branch.id}`}>
                      Inquire at this branch
                    </Link>
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.name} ${branch.address} ${branch.city}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on map
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section-tight section-muted">
        <div className="container">
          <div className="card card-pad">
            <div className="row-between">
              <div style={{ maxWidth: 640 }}>
                <h3 style={{ marginBottom: 4 }}>What to bring when you visit</h3>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  One valid government ID and a proof of billing address (utility bill or
                  barangay certificate). An authorized employee will create your customer account
                  and give you your account number on the spot.
                </p>
              </div>
              <Link className="btn btn-outline" to="/plans">
                Browse plans
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
