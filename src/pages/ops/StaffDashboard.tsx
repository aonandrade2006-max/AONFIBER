import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Clock,
  Router,
  Ticket,
  UserPlus,
  Users,
  Wifi,
} from 'lucide-react'
import { useStaffAuth } from '../../context/StaffAuth'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import { formatDateTime, relativeTime, titleCase } from '../../lib/format'
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  Loading,
  StatCard,
  StatusBadge,
} from '../../components/ui'

export function StaffDashboardPage() {
  const { profile, branch, online } = useStaffAuth()
  const branchId = profile?.branch_id ?? null

  const data = useAsync(async () => {
    if (!branchId) return null
    const [customers, inquiries, installations, tickets, recentInquiries, recentTickets] =
      await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
        supabase
          .from('inquiries')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', branchId)
          .eq('status', 'new'),
        supabase
          .from('installations')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', branchId)
          .in('status', ['pending', 'scheduled', 'in_progress']),
        supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', branchId)
          .in('status', ['open', 'in_progress', 'waiting_customer']),
        supabase
          .from('inquiries')
          .select('*')
          .eq('branch_id', branchId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('support_tickets')
          .select('*, customers(full_name, account_number)')
          .eq('branch_id', branchId)
          .in('status', ['open', 'in_progress', 'waiting_customer'])
          .order('created_at', { ascending: false })
          .limit(4),
      ])

    return {
      customers: customers.count ?? 0,
      newInquiries: inquiries.count ?? 0,
      pendingInstallations: installations.count ?? 0,
      openTickets: tickets.count ?? 0,
      recentInquiries: recentInquiries.data ?? [],
      recentTickets: recentTickets.data ?? [],
    }
  }, [branchId])

  if (!profile) return <Loading label="Loading your profile…" />

  const stats = data.data

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good day, {profile.full_name.split(' ')[0]}</h1>
          <p>
            {branch ? `${branch.name} · ${branch.city}, ${branch.province}` : 'No branch assigned'} ·{' '}
            <span className={`badge ${online ? 'badge-green' : 'badge-gray'}`}>
              {online ? 'Online' : 'Offline'}
            </span>
          </p>
        </div>
        <div className="row">
          <Link className="btn btn-primary" to="/staff/customers/new">
            <UserPlus size={15} /> Create customer account
          </Link>
          <Link className="btn btn-outline" to="/staff/customers">
            Search customers
          </Link>
        </div>
      </div>

      {!branchId ? (
        <Alert tone="warn">
          Your account is not assigned to a branch yet. Ask an administrator to assign you before
          creating customer accounts.
        </Alert>
      ) : null}

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <StatCard label="Branch customers" value={stats?.customers ?? '—'} icon={<Users size={18} />} />
        <StatCard
          label="New public inquiries"
          value={stats?.newInquiries ?? '—'}
          hint="Awaiting first contact"
          icon={<ClipboardList size={18} />}
        />
        <StatCard
          label="Pending installations"
          value={stats?.pendingInstallations ?? '—'}
          icon={<Router size={18} />}
        />
        <StatCard label="Open tickets" value={stats?.openTickets ?? '—'} icon={<Ticket size={18} />} />
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHeader
            title="Latest public inquiries"
            subtitle="Prospective customers for your branch"
            actions={
              <Link className="btn btn-ghost btn-sm" to="/staff/inquiries">
                Open queue <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="card-body">
            {data.loading ? (
              <Loading />
            ) : (stats?.recentInquiries ?? []).length === 0 ? (
              <EmptyState title="No inquiries yet" hint="New website inquiries will appear here." />
            ) : (
              <div className="stack-sm">
                {(stats?.recentInquiries ?? []).map((inquiry) => (
                  <div className="note" key={String(inquiry.id)}>
                    <div className="note-title">
                      <span>{String(inquiry.full_name)}</span>
                      <StatusBadge status={String(inquiry.status)} />
                    </div>
                    <div className="tiny muted">
                      {String(inquiry.reference_number)} · {String(inquiry.contact_number)} ·{' '}
                      {relativeTime(String(inquiry.created_at))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Open support tickets"
            actions={
              <Link className="btn btn-ghost btn-sm" to="/staff/tickets">
                Manage <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="card-body">
            {data.loading ? (
              <Loading />
            ) : (stats?.recentTickets ?? []).length === 0 ? (
              <EmptyState title="No open tickets" hint="Customer concerns for your branch appear here." />
            ) : (
              <div className="stack-sm">
                {(stats?.recentTickets ?? []).map((ticket) => {
                  const customer = ticket.customers as { full_name?: string } | null
                  return (
                    <div className="note" key={String(ticket.id)}>
                      <div className="note-title">
                        <span>{String(ticket.subject)}</span>
                        <StatusBadge status={String(ticket.status)} />
                      </div>
                      <div className="tiny muted">
                        {String(ticket.reference_number)} · {customer?.full_name ?? 'Customer'} ·{' '}
                        {titleCase(String(ticket.category))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ marginTop: '1.25rem' }}>
        <Card className="card-pad">
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <Building2 size={17} color="var(--blue-700)" />
            <strong>Branch details</strong>
          </div>
          <div className="small muted">
            {branch ? (
              <>
                <div>{branch.name}</div>
                <div>{branch.address}</div>
                <div>{branch.city}, {branch.province}</div>
                <div>{branch.contact_number ?? '—'}</div>
              </>
            ) : (
              'Not assigned'
            )}
          </div>
        </Card>
        <Card className="card-pad">
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <Clock size={17} color="var(--blue-700)" />
            <strong>My activity</strong>
          </div>
          <div className="small muted">
            <div>Last login: {formatDateTime(profile.last_login_at)}</div>
            <div>Presence: {online ? 'Connected' : 'Disconnected'}</div>
            <div>Role: {profile.role === 'branch_manager' ? 'Branch manager' : 'CSR'}</div>
          </div>
        </Card>
        <Card className="card-pad">
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <Wifi size={17} color="var(--blue-700)" />
            <strong>Quick actions</strong>
          </div>
          <div className="stack-sm small">
            <Link to="/staff/installations">Update installation schedules</Link>
            <Link to="/staff/change-requests">Review account corrections</Link>
            <Link to="/staff/tickets">Respond to support tickets</Link>
          </div>
        </Card>
      </div>
    </>
  )
}
