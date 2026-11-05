import { useState, type FormEvent } from 'react'
import { Banknote, BellRing, Plus, RefreshCw, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAction, useAsync } from '../../lib/hooks'
import type { BillingRecord, Customer } from '../../lib/types'
import { addDaysIso, currentBillingPeriod, formatDate, peso } from '../../lib/format'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  StatCard,
  StatusBadge,
} from '../../components/ui'

type BillingRow = BillingRecord & {
  customers?: { full_name: string; account_number: string } | null
  branches?: { name: string } | null
}

export function BillingAdminPage() {
  const action = useAction()
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState<BillingRow | null>(null)
  const [accountQuery, setAccountQuery] = useState('')
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [reminderMessage, setReminderMessage] = useState<string | null>(null)

  const data = useAsync(async () => {
    let query = supabase
      .from('billing_records')
      .select('*, customers(full_name, account_number), branches(name)')
      .order('due_date', { ascending: false })
      .limit(200)
    if (status) query = query.eq('status', status)
    const { data: rows, error } = await query
    if (error) throw error
    return (rows ?? []) as BillingRow[]
  }, [status])

  const records = data.data ?? []
  const billed = records.reduce((total, row) => total + Number(row.amount_due), 0)
  const collected = records.reduce((total, row) => total + Number(row.amount_paid), 0)

  const lookupCustomer = async () => {
    setLookupError(null)
    setFoundCustomer(null)
    if (!accountQuery.trim()) {
      setLookupError('Enter an account number.')
      return
    }
    setLookupBusy(true)
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('account_number', accountQuery.trim().toUpperCase())
      .maybeSingle()
    setLookupBusy(false)
    if (error) {
      setLookupError(error.message)
      return
    }
    if (!customer) {
      setLookupError('No customer found with that account number.')
      return
    }
    setFoundCustomer(customer as Customer)
  }

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!foundCustomer) {
      action.setError('Find a customer account first.')
      return
    }
    const formData = new FormData(event.currentTarget)
    await action.run(
      () =>
        api.createBilling({
          customerId: foundCustomer.id,
          billingPeriod: String(formData.get('billingPeriod') ?? currentBillingPeriod()),
          amountDue: Number(formData.get('amountDue') ?? 0),
          dueDate: String(formData.get('dueDate') ?? addDaysIso(30)),
          notes: String(formData.get('notes') ?? ''),
        }),
      {
        success: 'Billing statement created. The customer was notified.',
        onSuccess: () => {
          setCreating(false)
          setFoundCustomer(null)
          setAccountQuery('')
          data.reload()
        },
      },
    )
  }

  const onPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!paying) return
    const formData = new FormData(event.currentTarget)
    const amount = Number(formData.get('amount') ?? 0)
    await action.run(() => api.recordPayment(paying.id, amount), {
      success: 'Payment recorded. The customer was notified.',
      onSuccess: () => {
        setPaying(null)
        data.reload()
      },
    })
  }

  const runReminders = async () => {
    setReminderMessage(null)
    try {
      const result = await api.runDueDateReminders()
      setReminderMessage(
        result.created === 0
          ? 'No new due-date reminders were needed.'
          : `${result.created} due-date reminder(s) created.`,
      )
      data.reload()
    } catch (caught) {
      action.setError(caught instanceof Error ? caught.message : 'Could not run reminders.')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Billing</h1>
          <p>Issue statements, record payments and send due-date reminders.</p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          <Button variant="outline" onClick={runReminders} icon={<BellRing size={15} />}>
            Run due-date reminders
          </Button>
          <Button
            onClick={() => {
              setCreating(true)
              setFoundCustomer(null)
              setLookupError(null)
            }}
            icon={<Plus size={15} />}
          >
            New statement
          </Button>
        </div>
      </div>

      {reminderMessage ? <Alert tone="success">{reminderMessage}</Alert> : null}
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      {action.success ? <Alert tone="success">{action.success}</Alert> : null}

      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <StatCard label="Statements" value={records.length} hint="Most recent 200" />
        <StatCard label="Total billed" value={peso(billed)} icon={<Banknote size={18} />} />
        <StatCard label="Total collected" value={peso(collected)} />
        <StatCard label="Outstanding" value={peso(Math.max(0, billed - collected))} />
      </div>

      <Card style={{ marginBottom: '1.25rem' }}>
        <div className="card-body">
          <Field label="Filter by status" htmlFor="bill-status">
            <Select id="bill-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {['unpaid', 'partial', 'paid', 'overdue'].map((value) => (
                <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Billing statements" subtitle={`${records.length} record(s)`} />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : records.length === 0 ? (
            <EmptyState title="No billing statements" hint="Create a statement for a customer account." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Period</th>
                  <th>Amount due</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const balance = Math.max(0, Number(record.amount_due) - Number(record.amount_paid))
                  return (
                    <tr key={record.id}>
                      <td>
                        <div className="strong">{record.customers?.full_name ?? '—'}</div>
                        <div className="tiny muted">{record.customers?.account_number}</div>
                      </td>
                      <td className="nowrap">{record.billing_period}</td>
                      <td>{peso(record.amount_due)}</td>
                      <td>{peso(record.amount_paid)}</td>
                      <td>{peso(balance)}</td>
                      <td className="nowrap">{formatDate(record.due_date)}</td>
                      <td><StatusBadge status={record.status} /></td>
                      <td className="right">
                        {record.status !== 'paid' ? (
                          <Button size="sm" variant="outline" onClick={() => setPaying(record)}>
                            Record payment
                          </Button>
                        ) : (
                          <span className="tiny muted">Settled</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {creating ? (
        <Modal title="Create billing statement" onClose={() => setCreating(false)} wide>
          <Field label="Customer account number" htmlFor="bill-account" required>
            <div className="search-bar">
              <Input
                id="bill-account"
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value.toUpperCase())}
                placeholder="AON-100001"
              />
              <Button type="button" onClick={lookupCustomer} loading={lookupBusy} icon={<Search size={15} />}>
                Find
              </Button>
            </div>
          </Field>
          {lookupError ? <Alert tone="error">{lookupError}</Alert> : null}
          {foundCustomer ? (
            <Alert tone="success">
              {foundCustomer.full_name} · {foundCustomer.account_number} · branch account,
              monthly billing {peso(foundCustomer.monthly_billing)}
            </Alert>
          ) : null}

          <form onSubmit={onCreate}>
            <div className="form-grid">
              <Field label="Billing period" htmlFor="bill-period" required>
                <Input id="bill-period" name="billingPeriod" defaultValue={currentBillingPeriod()} required />
              </Field>
              <Field label="Amount due (PHP)" htmlFor="bill-amount" required>
                <Input
                  id="bill-amount"
                  name="amountDue"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={foundCustomer?.monthly_billing ?? 0}
                  required
                />
              </Field>
              <Field label="Due date" htmlFor="bill-due" required>
                <Input id="bill-due" name="dueDate" type="date" defaultValue={addDaysIso(30)} required />
              </Field>
              <Field label="Notes" htmlFor="bill-notes">
                <Input id="bill-notes" name="notes" />
              </Field>
            </div>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy} disabled={!foundCustomer}>
                Create statement
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {paying ? (
        <Modal title={`Record payment — ${paying.customers?.account_number ?? ''}`} onClose={() => setPaying(null)}>
          <p className="small muted">
            {paying.customers?.full_name} · {paying.billing_period}. Outstanding:{' '}
            <strong>{peso(Number(paying.amount_due) - Number(paying.amount_paid))}</strong>
          </p>
          <form onSubmit={onPayment}>
            <Field label="Amount received (PHP)" htmlFor="pay-amount" required>
              <Input
                id="pay-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={Number(paying.amount_due) - Number(paying.amount_paid)}
                defaultValue={(Number(paying.amount_due) - Number(paying.amount_paid)).toFixed(2)}
                required
              />
            </Field>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy} icon={<Banknote size={15} />}>
                Record payment
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPaying(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
