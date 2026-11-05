import { Check, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { InternetPlan } from '../lib/types'
import { number, peso } from '../lib/format'

export function PlanCard({ plan, featured }: { plan: InternetPlan; featured?: boolean }) {
  return (
    <article className={`plan-card ${featured ? 'featured' : ''}`}>
      {featured ? <span className="plan-tag">Most popular</span> : null}
      <div>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>{plan.name}</h3>
          <Zap size={18} color="var(--cyan-500)" aria-hidden="true" />
        </div>
        {plan.description ? <p className="small muted" style={{ marginTop: 6 }}>{plan.description}</p> : null}
      </div>
      <div>
        <div className="plan-speed">
          {number(plan.speed_mbps)} <span>Mbps</span>
        </div>
        <div className="plan-price">
          {peso(plan.monthly_price)} <span>/ month</span>
        </div>
      </div>
      <ul className="plan-features">
        {(plan.features ?? []).map((feature) => (
          <li key={feature}>
            <Check size={14} aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link className={`btn ${featured ? 'btn-primary' : 'btn-outline'} btn-block`} to={`/contact?plan=${plan.id}`}>
        Inquire about this plan
      </Link>
    </article>
  )
}
