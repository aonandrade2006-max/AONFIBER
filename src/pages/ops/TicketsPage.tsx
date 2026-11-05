import { useState, type FormEvent } from 'react'
import { RefreshCw, Save, UserCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import { useStaffAuth } from '../../context/StaffAuth'
import type { SupportTicket, TicketStatus } from '../../lib/types'
import { formatDateTime, titleCase } from '../../lib/format'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Loading,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from '../../components/ui'

type TicketRow = SupportTicket & {
  customers?: { full_name: string; account_number: string } | null
  branches?: { name: string } | null
}

const STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']

export function TicketsPage() {
  const { profile } = useStaffAuth()
  const isAdmin = profile?.role === 'admin'
  const [status, setStatus] = useState('')
  const [branchId, setBranchId] = useState('')
  const [selected, setSelected] = useState<TicketRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const branches = useAsync(async () => {
    if (!isAdmin) return [] as Array<{ id: string; name: string }>
    const { data } = await supabase.from('branches').select('id, name').order('name')
    return (data ?? []) as Array<{ id: string; name: string }>
  }, [isAdmin])

  const data = useAsync(async () => {
    let query = supabase
      .from('support_tickets')
      .select('*, customers(full_name, account_number), branches(name)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) query = query.eq('status', status as TicketStatus)
    if (branchId) query = query.eq('branch_id', branchId)

    const { data: rows, error: queryError } = await query
    if (queryError) throw queryError
    return (rows ?? []) as TicketRow[]
  }, [status, branchId])

  const assignToMe = async (ticket: TicketRow) => {
    if (!profile) return
    setError(null)
    const { error: updateError } = await supabase
      .from('support_tickets')
      .update({
        assigned_to: profile.id,
        status: ticket.status === 'open' ? 'in_progress' : ticket.status,
      })
      .eq('id', ticket.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setSuccess(`Ticket ${ticket.reference_number} assigned to you.`)
    data.reload()
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const formData = new FormData(event.currentTarget)
    const nextStatus = String(formData.get('status') ?? 'open')
    const priority = String(formData.get('priority') ?? 'normal')
    const resolutionNotes = String(formData.get('resolutionNotes') ?? '').trim()

    if (nextStatus === 'resolved' && resolutionNotes.length < 5) {
      setError('Add resolution notes before marking the ticket resolved.')
      return
    }

    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('support_tickets')
      .update({
        status: nextStatus,
        priority,
        resolution_notes: resolutionNotes || null,
        assigned_to: selected.assigned_to ?? profile?.id ?? null,
      })
      .eq('id', selected.id)
    setBusy(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setSuccess(`Ticket ${selected.reference_number} updated. The customer was notified.`)
    setSelected(null)
    data.reload()
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Support tickets</h1>
          <p>Technical, billing and installation concerns filed by customers.</p>
        </div>
        <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
          Refresh
        </Button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      <Card style={{ marginBottom: '1.25rem' }}>
        <div className="card-body">
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <Field label="Status" htmlFor="ticket-filter-status">
              <Select id="ticket-filter-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>{titleCase(value)}</option>
                ))}
              </Select>
            </Field>
            {isAdmin ? (
              <Field label="Branch" htmlFor="ticket-filter-branch">
                <Select id="ticket-filter-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                  <option value="">All branches</option>
                  {(branches.data ?? []).map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Ticket queue" subtitle={`${data.data?.length ?? 0} record(s)`} />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : (data.data ?? []).length === 0 ? (
            <EmptyState title="No support tickets" hint="Customer concerns will appear here." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Concern</th>
                  <th>Priority</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data.data ?? []).map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="strong nowrap">{ticket.reference_number}</td>
                    <td>
                      <div className="strong">{ticket.customers?.full_name ?? '—'}</div>
                      <div className="tiny muted">{ticket.customers?.account_number}</div>
                    </td>
                    <td>
                      <div className="small strong">{ticket.subject}</div>
                      <div className="tiny muted">
                        {titleCase(ticket.category)} · {ticket.branches?.name ?? '—'}
                      </div>
                    </td>
                    <td><StatusBadge status={ticket.priority} /></td>
                    <td className="small nowrap">{formatDateTime(ticket.created_at)}</td>
                    <td><StatusBadge status={ticket.status} /></td>
                    <td>
                      <div className="actions">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(ticket)}>
                          Open
                        </Button>
                        {profile && ticket.assigned_to !== profile.id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<UserCheck size={14} />}
                            onClick={() => assignToMe(ticket)}
                          >
                            Assign to me
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {selected ? (
        <Modal title={`Ticket ${selected.reference_number}`} onClose={() => setSelected(null)} wide>
          {profile?.role === 'employee' &&
          selected.assigned_to &&
          selected.assigned_to !== profile.id ? (
            <Alert tone="info">
              This ticket is assigned to a colleague. You can read it, but a branch manager or the
              assigned employee must update it.
            </Alert>
          ) : null}
          <div className="note" style={{ marginBottom: '1rem' }}>
            <div className="note-title">
              <span>{selected.subject}</span>
              <StatusBadge status={selected.status} />
            </div>
            <div className="tiny muted">
              {selected.customers?.full_name} · {titleCase(selected.category)} ·{' '}
              {formatDateTime(selected.created_at)}
            </div>
            <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>{selected.description}</p>
          </div>
          <form onSubmit={onSubmit}>
            <div className="form-grid">
              <Field label="Status" htmlFor="tk-upd-status">
                <Select id="tk-upd-status" name="status" defaultValue={selected.status}>
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>{titleCase(value)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="tk-upd-priority">
                <Select id="tk-upd-priority" name="priority" defaultValue={selected.priority}>
                  {['low', 'normal', 'high', 'urgent'].map((value) => (
                    <option key={value} value={value}>{titleCase(value)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Resolution / update notes" htmlFor="tk-upd-notes" className="span-2">
                <Textarea
                  id="tk-upd-notes"
                  name="resolutionNotes"
                  defaultValue={selected.resolution_notes ?? ''}
                  placeholder="Visible to the customer in their portal."
                />
              </Field>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="row">
              <Button
                type="submit"
                loading={busy}
                icon={<Save size={15} />}
                disabled={
                  profile?.role === 'employee' &&
                  Boolean(selected.assigned_to) &&
                  selected.assigned_to !== profile.id
                }
              >
                Save ticket
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
