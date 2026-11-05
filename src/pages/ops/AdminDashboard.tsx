import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Building2,
  ClipboardList,
  Router,
  Ticket,
  Users,
  Wifi,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import { usePortalBase } from '../../lib/portal'
import type { Branch, Inquiry } from '../../lib/types'
import { formatDateTime, peso, relativeTime } from '../../lib/format'
import {
  Alert,
  BarChart,
  Card,
  CardHeader,
  EmptyState,
  Loading,
  StatCard,
  StatusBadge,
} from '../../components/ui'

export function AdminDashboardPage() {
  const base = usePortalBase()
  const data = useAsync(async () => {
    const [
      customers,
      activeSubs,
      employees,
      branchesCount,
      pendingInstalls,
      openTickets,
      newInquiries,
      billing,
      branches,
      customersByBranch,
      recentInquiries,
    ] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_status', 'active'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('branches').select('id', { count: 'exact', head: true }),
      supabase
        .from('installations')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'scheduled']),
      supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress', 'waiting_customer']),
      supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('billing_records').select('amount_due, amount_paid, status').neq('status', 'paid'),
      supabase.from('branches').select('*').order('name'),
      supabase.from('customers').select('branch_id, subscription_status'),
      supabase
        .from('inquiries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8),
    ])

    const outstanding = ((billing.data ?? []) as Array<{ amount_due: number; amount_paid: number }>).reduce(
      (total, row) => total + (Number(row.amount_due) - Number(row.amount_paid)),
      0,
    )

    return {
      customers: customers.count ?? 0,
      activeSubs: activeSubs.count ?? 0,
      employees: employees.count ?? 0,
      branches: branchesCount.count ?? 0,
      pendingInstalls: pendingInstalls.count ?? 0,
      openTickets: openTickets.count ?? 0,
      newInquiries: newInquiries.count ?? 0,
      outstanding,
      branchList: (branches.data ?? []) as Branch[],
      customersByBranch: (customersByBranch.data ?? []) as Array<{
        branch_id: string
        subscription_status: string
      }>,
      recentInquiries: (recentInquiries.data ?? []) as Inquiry[],
    }
  }, [])

  const stats = data.data

  const branchChart = (stats?.branchList ?? []).map((branch) => ({
    label: branch.name.replace('AON FIBER – ', ''),
    value: (stats?.customersByBranch ?? []).filter((row) => row.branch_id === branch.id).length,
    hint: `${(stats?.customersByBranch ?? []).filter(
      (row) => row.branch_id === branch.id && row.subscription_status === 'active',
    ).length} active subscriptions`,
  }))

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Company overview</h1>
          <p>All AON FIBER branches, customers and operations at a glance.</p>
        </div>
        <div className="row">
          <Link className="btn btn-ghost" to="/admin/reports">
            Branch reports
          </Link>
          <Link className="btn btn-primary" to="/admin/monitoring">
            <Wifi size={15} /> Live monitoring
          </Link>
        </div>
      </div>

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      {data.loading ? (
        <Loading label="Loading company metrics…" />
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
            <StatCard label="Registered customers" value={stats?.customers ?? 0} icon={<Users size={18} />} />
            <StatCard label="Active subscriptions" value={stats?.activeSubs ?? 0} icon={<Wifi size={18} />} />
            <StatCard label="Employees" value={stats?.employees ?? 0} icon={<Users size={18} />} />
            <StatCard label="Branches" value={stats?.branches ?? 0} icon={<Building2 size={18} />} />
          </div>

          <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
            <StatCard
              label="Pending installations"
              value={stats?.pendingInstalls ?? 0}
              icon={<Router size={18} />}
              hint="Pending or scheduled"
            />
            <StatCard
              label="Unresolved tickets"
              value={stats?.openTickets ?? 0}
              icon={<Ticket size={18} />}
              hint="Open, in progress or waiting"
            />
            <StatCard
              label="New inquiries"
              value={stats?.newInquiries ?? 0}
              icon={<ClipboardList size={18} />}
              hint="Not yet contacted"
            />
            <StatCard
              label="Outstanding balances"
              value={peso(stats?.outstanding ?? 0)}
              icon={<Banknote size={18} />}
              hint="Across unpaid statements"
            />
          </div>

          <div className="grid grid-2" style={{ alignItems: 'start' }}>
            <Card>
              <CardHeader
                title="Customers per branch"
                subtitle="Active subscriptions in the tooltip"
                actions={
                  <Link className="btn btn-ghost btn-sm" to="/admin/reports">
                    Details <ArrowRight size={14} />
                  </Link>
                }
              />
              <div className="card-body">
                <BarChart data={branchChart} emptyLabel="No branches configured yet." />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Newest public inquiries"
                actions={
                  <Link className="btn btn-ghost btn-sm" to={`${base}/inquiries`}>
                    Queue <ArrowRight size={14} />
                  </Link>
                }
              />
              <div className="card-body">
                {(stats?.recentInquiries ?? []).length === 0 ? (
                  <EmptyState title="No inquiries yet" />
                ) : (
                  <div className="stack-sm">
                    {(stats?.recentInquiries ?? []).map((inquiry) => (
                      <div className="row-between" key={inquiry.id}>
                        <div>
                          <div className="strong small">{inquiry.full_name}</div>
                          <div className="tiny muted">
                            {inquiry.reference_number} · {inquiry.city ?? inquiry.contact_number} ·{' '}
                            {relativeTime(inquiry.created_at)}
                          </div>
                        </div>
                        <StatusBadge status={inquiry.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <Card style={{ marginTop: '1.25rem' }}>
            <CardHeader title="Administrator shortcuts" />
            <div className="card-body">
              <div className="grid grid-4">
                {[
                  { to: '/admin/employees', label: 'Manage employees', icon: Users },
                  { to: '/admin/plans', label: 'Internet plans', icon: Wifi },
                  { to: '/admin/billing', label: 'Billing & payments', icon: Banknote },
                  { to: '/admin/coverage', label: 'Coverage areas', icon: Building2 },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <Link className="note" to={item.to} key={item.to} style={{ textDecoration: 'none' }}>
                      <div className="row" style={{ gap: 8 }}>
                        <Icon size={16} color="var(--blue-700)" />
                        <span className="strong small">{item.label}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </Card>

          <div className="row small muted" style={{ marginTop: '1rem' }}>
            <AlertCircle size={14} />
            Metrics update whenever this page reloads. Live employee presence is on the monitoring
            dashboard.
            <span className="tiny">Last loaded {formatDateTime(new Date().toISOString())}</span>
          </div>
        </>
      )}
    </>
  )
}
