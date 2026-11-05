import { Link } from 'react-router-dom'
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Info,
  LifeBuoy,
  RefreshCw,
  Router,
  Wifi,
} from 'lucide-react'
import { useCustomerAuth } from '../../context/CustomerAuth'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import type { BillingRecord, CustomerNotification, Installation, SupportTicket } from '../../lib/types'
import { formatDate, peso, titleCase } from '../../lib/format'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Loading,
  StatCard,
  StatusBadge,
} from '../../components/ui'

export function CustomerDashboardPage() {
  const { customer, plan, branch, refresh } = useCustomerAuth()

  const data = useAsync(async () => {
    if (!customer) return null
    const [billingResult, installResult, ticketResult, notificationResult] = await Promise.all([
      supabase
        .from('billing_records')
        .select('*')
        .eq('customer_id', customer.id)
        .order('due_date', { ascending: false }),
      supabase
        .from('installations')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('support_tickets')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('customer_notifications')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    return {
      billing: (billingResult.data ?? []) as BillingRecord[],
      installations: (installResult.data ?? []) as Installation[],
      tickets: (ticketResult.data ?? []) as SupportTicket[],
      notifications: (notificationResult.data ?? []) as CustomerNotification[],
    }
  }, [customer?.id])

  if (!customer) return <Loading label="Loading your account…" />

  const billing = data.data?.billing ?? []
  const installations = data.data?.installations ?? []
  const tickets = data.data?.tickets ?? []
  const notifications = data.data?.notifications ?? []

  const outstanding = billing
    .filter((record) => record.status !== 'paid')
    .reduce((total, record) => total + (Number(record.amount_due) - Number(record.amount_paid)), 0)

  const openTickets = tickets.filter(
    (ticket) => ticket.status !== 'resolved' && ticket.status !== 'closed',
  ).length

  const latestInstallation = installations[0] ?? null
  const currentBill = billing.find((record) => record.status !== 'paid') ?? billing[0] ?? null
  const unreadCount = notifications.filter((item) => !item.is_read).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome back, {customer.full_name.split(' ')[0]}</h1>
          <p>
            Account <strong>{customer.account_number}</strong> ·{' '}
            {branch?.name ?? 'AON FIBER'}
          </p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={() => { refresh(); data.reload() }} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          <Link className="btn btn-primary" to="/portal/support">
            <LifeBuoy size={15} /> Request support
          </Link>
        </div>
      </div>

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <StatCard
          label="Internet plan"
          value={plan ? `${plan.speed_mbps} Mbps` : '—'}
          hint={plan ? `${plan.name} · ${peso(plan.monthly_price)}/mo` : 'No plan assigned yet'}
          icon={<Wifi size={18} />}
        />
        <StatCard
          label="Subscription status"
          value={<StatusBadge status={customer.subscription_status} />}
          hint={customer.installation_status === 'completed' ? 'Installation completed' : 'Installation in progress'}
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          label="Outstanding balance"
          value={peso(outstanding)}
          hint={currentBill ? `Due ${formatDate(currentBill.due_date)}` : 'No statement on file'}
          icon={<CircleDollarSign size={18} />}
        />
        <StatCard
          label="Open support tickets"
          value={openTickets}
          hint={`${tickets.length} total request(s)`}
          icon={<LifeBuoy size={18} />}
        />
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHeader title="Account details" subtitle="Managed by your AON FIBER branch" />
          <div className="card-body">
            <dl className="detail-grid">
              <div className="detail">
                <dt>Customer name</dt>
                <dd>{customer.full_name}</dd>
              </div>
              <div className="detail">
                <dt>Account number</dt>
                <dd>{customer.account_number}</dd>
              </div>
              <div className="detail">
                <dt>Registered mobile</dt>
                <dd>{customer.contact_number}</dd>
              </div>
              <div className="detail">
                <dt>Email</dt>
                <dd>{customer.email ?? '—'}</dd>
              </div>
              <div className="detail">
                <dt>Service address</dt>
                <dd>
                  {customer.address}
                  {customer.barangay ? `, ${customer.barangay}` : ''}
                  {customer.city ? `, ${customer.city}` : ''}
                </dd>
              </div>
              <div className="detail">
                <dt>Branch</dt>
                <dd>{branch ? `${branch.name} · ${branch.contact_number ?? ''}` : '—'}</dd>
              </div>
            </dl>
            <Alert tone="info">
              <Info size={14} className="inline-icon" /> Account information is protected. Contact
              your branch if any detail needs to be corrected.
            </Alert>
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHeader
              title="Billing summary"
              subtitle={currentBill ? `Statement for ${currentBill.billing_period}` : 'No statements yet'}
              actions={
                <Link className="btn btn-ghost btn-sm" to="/portal/billing">
                  View billing
                </Link>
              }
            />
            <div className="card-body">
              {billing.length === 0 ? (
                <EmptyState title="No billing statements yet" hint="Statements appear here once issued by your branch." />
              ) : (
                <>
                  <dl className="detail-grid">
                    <div className="detail">
                      <dt>Monthly billing</dt>
                      <dd>{peso(customer.monthly_billing)}</dd>
                    </div>
                    <div className="detail">
                      <dt>Due date</dt>
                      <dd>{formatDate(customer.due_date)}</dd>
                    </div>
                    <div className="detail">
                      <dt>Latest statement</dt>
                      <dd>{currentBill ? peso(currentBill.amount_due) : '—'}</dd>
                    </div>
                    <div className="detail">
                      <dt>Latest status</dt>
                      <dd>{currentBill ? <StatusBadge status={currentBill.status} /> : '—'}</dd>
                    </div>
                  </dl>
                  <div className="stack-sm" style={{ marginTop: '0.75rem' }}>
                    {billing.slice(0, 3).map((record) => (
                      <div className="row-between" key={record.id}>
                        <span className="small muted">{record.billing_period}</span>
                        <span className="small">
                          {peso(record.amount_paid)} / {peso(record.amount_due)}
                        </span>
                        <StatusBadge status={record.status} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Installation"
              actions={<Router size={16} color="var(--blue-600)" />}
            />
            <div className="card-body">
              {latestInstallation ? (
                <div className="stack-sm">
                  <div className="row-between">
                    <span className="small muted">Reference</span>
                    <span className="strong small">{latestInstallation.reference_number}</span>
                  </div>
                  <div className="row-between">
                    <span className="small muted">Status</span>
                    <StatusBadge status={latestInstallation.status} />
                  </div>
                  <div className="row-between">
                    <span className="small muted">Scheduled date</span>
                    <span className="small">
                      {formatDate(latestInstallation.scheduled_date ?? latestInstallation.requested_date)}
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No installation request on file"
                  hint="Your branch will create one when your application is processed."
                />
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: '1.25rem', alignItems: 'start' }}>
        <Card>
          <CardHeader
            title="Recent notifications"
            subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
            actions={
              <Link className="btn btn-ghost btn-sm" to="/portal/notifications">
                <Bell size={14} /> All notifications
              </Link>
            }
          />
          <div className="card-body">
            {notifications.length === 0 ? (
              <EmptyState title="No notifications yet" />
            ) : (
              <div className="note-list">
                {notifications.map((item) => (
                  <div className={`note ${item.is_read ? '' : 'unread'}`} key={item.id}>
                    <div className="note-title">
                      <span>{item.title}</span>
                      <span className="tiny muted">{formatDate(item.created_at)}</span>
                    </div>
                    <div className="small muted">{item.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="My support requests" subtitle={`${openTickets} open`} />
          <div className="card-body">
            {tickets.length === 0 ? (
              <EmptyState
                title="No support requests"
                hint="File a technical, billing or installation concern from the Support page."
              />
            ) : (
              <div className="stack-sm">
                {tickets.slice(0, 4).map((ticket) => (
                  <div className="note" key={ticket.id}>
                    <div className="note-title">
                      <span>{ticket.subject}</span>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <div className="small muted">
                      {ticket.reference_number} · {titleCase(ticket.category)} ·{' '}
                      {formatDate(ticket.created_at)}
                    </div>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 4 }}>
                  <Link className="btn btn-outline btn-sm" to="/portal/support">
                    <LifeBuoy size={14} /> Manage requests
                  </Link>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="card-pad" style={{ marginTop: '1.25rem' }}>
        <div className="row" style={{ gap: '0.5rem' }}>
          <CalendarClock size={16} color="var(--blue-700)" />
          <span className="small">
            Payments are recorded at any AON FIBER branch. Once an employee records your payment, it
            appears here and you receive a notification.
          </span>
        </div>
      </Card>
    </>
  )
}
