import { Link } from 'react-router-dom'
import { Building2, HeartHandshake, ShieldCheck, Signal, Users } from 'lucide-react'

export function AboutPage() {
  return (
    <>
      <section className="section-tight" style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--ink-100)' }}>
        <div className="container">
          <span className="eyebrow">About AON FIBER</span>
          <h1 style={{ fontSize: 'clamp(1.9rem, 3.6vw, 2.6rem)' }}>Local fiber, built by people who live here</h1>
          <p style={{ maxWidth: 680 }}>
            AON FIBER Telecommunications is a Philippine internet service provider focused on
            bringing dependable fiber connections to homes, schools and small businesses — with
            branches you can actually walk into.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: 'start' }}>
          <div>
            <h2>Our story</h2>
            <p>
              AON FIBER started with a simple observation: Filipino families deserve internet that
              works the way it is advertised. Instead of expanding everywhere at once, we build
              neighborhood by neighborhood, working with local crews and opening a branch in every
              city we serve.
            </p>
            <p>
              Today we operate fiber networks in Metro Manila, Cebu, Davao, Iloilo and Baguio, with
              plans ranging from 50 Mbps for small households to 1 Gbps for businesses. Every
              customer account is opened at a branch, so the person who sets up your service is
              someone you can visit when you need help.
            </p>
            <div className="row" style={{ marginTop: '1.25rem' }}>
              <Link className="btn btn-primary" to="/branches">
                Visit a branch
              </Link>
              <Link className="btn btn-ghost" to="/contact">
                Talk to us
              </Link>
            </div>
          </div>
          <div className="grid grid-2">
            {[
              { icon: Signal, value: '1 Gbps', label: 'Fastest residential plan' },
              { icon: Building2, value: '6', label: 'Branches nationwide' },
              { icon: Users, value: 'Local', label: 'Support teams per branch' },
              { icon: ShieldCheck, value: '99.9%', label: 'Network availability target' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div className="card card-pad" key={item.label}>
                  <Icon size={20} color="var(--blue-700)" />
                  <div className="stat-value" style={{ fontSize: '1.4rem', marginTop: 8 }}>
                    {item.value}
                  </div>
                  <div className="small muted">{item.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section section-muted">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What we stand for</span>
            <h2>Straightforward service, honest answers</h2>
          </div>
          <div className="grid grid-3">
            {[
              {
                icon: HeartHandshake,
                title: 'Community first',
                text: 'We hire and train locally, and our branch teams know the streets they serve.',
              },
              {
                icon: ShieldCheck,
                title: 'Transparent billing',
                text: 'Clear monthly fees, itemized statements and a self-service portal for every customer.',
              },
              {
                icon: Signal,
                title: 'Engineered to last',
                text: 'Redundant backbone links, proactive monitoring and continuous node upgrades.',
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
        <div className="container">
          <div className="card card-pad">
            <div className="row-between">
              <div style={{ maxWidth: 620 }}>
                <h2 style={{ marginBottom: 6 }}>Speed Without Limits</h2>
                <p className="muted" style={{ marginBottom: 0 }}>
                  That is not just a tagline. It is the standard we hold our network, our branches
                  and our support team to — every single day.
                </p>
              </div>
              <Link className="btn btn-primary" to="/plans">
                See our plans
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
