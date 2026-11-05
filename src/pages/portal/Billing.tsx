import { CreditCard, RefreshCw } from 'lucide-react'
import { useCustomerAuth } from '../../context/CustomerAuth'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import type { BillingRecord } from '../../lib/types'
import { formatDate, peso } from '../../lib/format'
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

export function CustomerBillingPage() {
  const { customer } = useCustomerAuth()

  const data = useAsync(async () => {
    if (!customer) return [] as BillingRecord[]
    const { data: rows, error } = await supabase
      .from('billing_records')
      .select('*')
      .eq('customer_id', customer.id)
      .order('due_date', { ascending: false })
    if (error) throw error
    return (rows ?? []) as BillingRecord[]
  }, [customer?.id])

  if (!customer) return <Loading label="Loading your account…" />

  const records = data.data ?? []
  const outstanding = records
    .filter((record) => record.status !== 'paid')
    .reduce((total, record) => total + (Number(record.amount_due) - Number(record.amount_paid)), 0)
  const totalPaid = records.reduce((total, record) => total + Number(record.amount_paid), 0)
  const nextDue = records
    .filter((record) => record.status !== 'paid')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Billing</h1>
          <p>Statements and payments recorded for {customer.account_number}.</p>
        </div>
        <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
          Refresh
        </Button>
      </div>

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <StatCard
          label="Outstanding balance"
          value={peso(outstanding)}
          hint={nextDue ? `Next due ${formatDate(nextDue.due_date)}` : 'No open statements'}
          icon={<CreditCard size={18} />}
        />
        <StatCard label="Monthly billing" value={peso(customer.monthly_billing)} hint="Current plan rate" />
        <StatCard label="Total paid" value={peso(totalPaid)} hint={`${records.length} statement(s) on file`} />
        <StatCard
          label="Account due date"
          value={formatDate(customer.due_date)}
          hint="Set by your branch"
        />
      </div>

      <Card>
        <CardHeader title="Billing statements" subtitle="Newest first" />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : records.length === 0 ? (
            <EmptyState
              title="No billing statements yet"
              hint="Your branch issues statements every month. They will appear here automatically."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Amount due</th>
                  <th>Amount paid</th>
                  <th>Balance</th>
                  <th>Due date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const balance = Number(record.amount_due) - Number(record.amount_paid)
                  return (
                    <tr key={record.id}>
                      <td className="strong">{record.billing_period}</td>
                      <td>{peso(record.amount_due)}</td>
                      <td>{peso(record.amount_paid)}</td>
                      <td>{peso(Math.max(0, balance))}</td>
                      <td>{formatDate(record.due_date)}</td>
                      <td>
                        <StatusBadge status={record.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <div className="grid grid-2" style={{ marginTop: '1.25rem' }}>
        <Card>
          <CardHeader title="Payment history" subtitle="Payments recorded by our team" />
          <div className="card-body">
            {records.filter((record) => Number(record.amount_paid) > 0).length === 0 ? (
              <EmptyState title="No payments recorded yet" />
            ) : (
              <div className="stack-sm">
                {records
                  .filter((record) => Number(record.amount_paid) > 0)
                  .map((record) => (
                    <div className="row-between" key={record.id}>
                      <div>
                        <div className="strong small">{record.billing_period}</div>
                        <div className="tiny muted">
                          {record.paid_at ? `Paid ${formatDate(record.paid_at)}` : 'Partial payment'}
                        </div>
                      </div>
                      <span className="strong">{peso(record.amount_paid)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="How to pay" />
          <div className="card-body stack-sm small muted">
            <p style={{ margin: 0 }}>
              Payments are accepted at any AON FIBER branch. Bring your account number
              <strong> {customer.account_number}</strong>.
            </p>
            <p style={{ margin: 0 }}>
              Once an employee records your payment, the statement above updates and a notification
              appears in your portal.
            </p>
            <Alert tone="info">
              Customers cannot change billing amounts or payment records. Contact your branch if
              something looks incorrect.
            </Alert>
          </div>
        </Card>
      </div>
    </>
  )
}
