import { useState, type FormEvent } from 'react'
import { LifeBuoy, Plus, RefreshCw } from 'lucide-react'
import { useCustomerAuth } from '../../context/CustomerAuth'
import { supabase } from '../../lib/supabase'
import { useAction, useAsync } from '../../lib/hooks'
import type { SupportTicket, TicketCategory } from '../../lib/types'
import { formatDate, formatDateTime, titleCase } from '../../lib/format'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Loading,
  Select,
  StatusBadge,
  Textarea,
} from '../../components/ui'

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  technical: 'Technical support',
  billing: 'Billing concern',
  installation: 'Installation concern',
}

export function CustomerSupportPage() {
  const { customer } = useCustomerAuth()
  const action = useAction()
  const [showForm, setShowForm] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  const data = useAsync(async () => {
    if (!customer) return [] as SupportTicket[]
    const { data: rows, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (rows ?? []) as SupportTicket[]
  }, [customer?.id])

  if (!customer) return <Loading label="Loading your account…" />

  const tickets = data.data ?? []

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const category = String(formData.get('category') ?? 'technical') as TicketCategory
    const subject = String(formData.get('subject') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()

    if (subject.length < 4) {
      action.setError('Enter a short subject for your request.')
      return
    }
    if (description.length < 5) {
      action.setError('Describe the concern so our team can help.')
      return
    }

    const ok = await action.run(
      async () => {
        const { data: inserted, error } = await supabase
          .from('support_tickets')
          .insert({
            customer_id: customer.id,
            branch_id: customer.branch_id,
            category,
            subject,
            description,
            priority: 'normal',
            status: 'open',
          })
          .select('reference_number')
          .single()
        if (error) throw new Error(error.message)
        return inserted
      },
      {
        onSuccess: (payload) => {
          const reference = (payload as { reference_number: string }).reference_number
          setFeedback(`Support request ${reference} submitted. Your branch will follow up soon.`)
          form.reset()
          setShowForm(false)
          setFormKey((value) => value + 1)
          data.reload()
        },
      },
    )
    if (!ok) return
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Support</h1>
          <p>Submit technical, billing or installation concerns and track their status.</p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          <Button icon={<Plus size={15} />} onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'Close form' : 'New request'}
          </Button>
        </div>
      </div>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      {showForm ? (
        <Card style={{ marginBottom: '1.25rem' }}>
          <CardHeader title="Submit a support request" subtitle="Our branch team will contact you" />
          <div className="card-body">
            <form key={formKey} onSubmit={onSubmit}>
              <div className="form-grid">
                <Field label="Concern type" htmlFor="ticket-category" required>
                  <Select id="ticket-category" name="category" defaultValue="technical">
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Subject" htmlFor="ticket-subject" required>
                  <Input id="ticket-subject" name="subject" maxLength={140} required />
                </Field>
                <Field label="Details" htmlFor="ticket-description" className="span-2" required>
                  <Textarea
                    id="ticket-description"
                    name="description"
                    maxLength={2000}
                    placeholder="Describe what happened, when it started, and any reference numbers."
                    required
                  />
                </Field>
              </div>
              {action.error ? <Alert tone="error">{action.error}</Alert> : null}
              <div className="row">
                <Button type="submit" loading={action.busy} icon={<LifeBuoy size={15} />}>
                  Submit request
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="My requests" subtitle={`${tickets.length} request(s)`} />
        <div className="card-body">
          {data.loading ? (
            <Loading />
          ) : tickets.length === 0 ? (
            <EmptyState
              title="No support requests yet"
              hint="Use the New request button above to file a concern."
            />
          ) : (
            <div className="stack">
              {tickets.map((ticket) => (
                <div className="note" key={ticket.id}>
                  <div className="note-title">
                    <span>{ticket.subject}</span>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <div className="tiny muted" style={{ marginBottom: 6 }}>
                    {ticket.reference_number} · {titleCase(ticket.category)} ·{' '}
                    {formatDateTime(ticket.created_at)}
                  </div>
                  <div className="small" style={{ color: 'var(--ink-700)' }}>
                    {ticket.description}
                  </div>
                  {ticket.resolution_notes ? (
                    <div className="small" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--ink-100)' }}>
                      <strong>Branch update:</strong> {ticket.resolution_notes}
                    </div>
                  ) : null}
                  {ticket.resolved_at ? (
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      Resolved {formatDate(ticket.resolved_at)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
