import { useState } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { useStaffAuth } from '../../context/StaffAuth'
import { canReviewChangeRequests } from '../../lib/permissions'
import type { AccountChangeRequest } from '../../lib/types'
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

type RequestRow = AccountChangeRequest & {
  customers?: { full_name: string; account_number: string } | null
  branches?: { name: string } | null
}

export function ChangeRequestsPage() {
  const { profile } = useStaffAuth()
  const canReview = canReviewChangeRequests(profile?.role)
  const isAdmin = profile?.role === 'admin'
  const [status, setStatus] = useState('pending')
  const [branchId, setBranchId] = useState('')
  const [selected, setSelected] = useState<RequestRow | null>(null)
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [notes, setNotes] = useState('')
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
      .from('account_change_requests')
      .select('*, customers(full_name, account_number), branches(name)')
      .order('created_at', { ascending: false })
      .limit(150)

    if (status) query = query.eq('status', status)
    if (branchId) query = query.eq('branch_id', branchId)

    const { data: rows, error: queryError } = await query
    if (queryError) throw queryError

    const { data: staffRows } = await supabase.from('profiles').select('id, full_name')
    return {
      requests: (rows ?? []) as RequestRow[],
      staff: (staffRows ?? []) as Array<{ id: string; full_name: string }>,
    }
  }, [status, branchId])

  const submitReview = async () => {
    if (!selected) return
    if (decision === 'rejected' && notes.trim().length < 5) {
      setError('Add a short note explaining the rejection.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.reviewChangeRequest(selected.id, decision, notes.trim() || undefined)
      setSuccess(
        decision === 'approved'
          ? 'Correction approved and applied to the customer account.'
          : 'Correction request rejected.',
      )
      setSelected(null)
      setNotes('')
      data.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not review the request.')
    } finally {
      setBusy(false)
    }
  }

  const staffName = (id: string | null) =>
    data.data?.staff.find((member) => member.id === id)?.full_name ?? '—'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Account change requests</h1>
          <p>
            Employees cannot edit protected customer data. Corrections are reviewed here by a branch
            manager or administrator.
          </p>
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
            <Field label="Status" htmlFor="cr-filter-status">
              <Select id="cr-filter-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </Select>
            </Field>
            {isAdmin ? (
              <Field label="Branch" htmlFor="cr-filter-branch">
                <Select id="cr-filter-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
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
        <CardHeader
          title="Requests"
          subtitle={`${data.data?.requests.length ?? 0} record(s)`}
          actions={
            canReview ? (
              <span className="pill">
                <ShieldCheck size={13} /> You can review requests
              </span>
            ) : (
              <span className="pill">View only</span>
            )
          }
        />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : (data.data?.requests ?? []).length === 0 ? (
            <EmptyState
              title="No change requests"
              hint="Submit one from a customer account page when details need correcting."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Requested by</th>
                  <th>Changes</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data.data?.requests ?? []).map((request) => (
                  <tr key={request.id}>
                    <td>
                      <div className="strong">{request.customers?.full_name ?? '—'}</div>
                      <div className="tiny muted">{request.customers?.account_number}</div>
                    </td>
                    <td className="small">
                      {staffName(request.requested_by)}
                      <div className="tiny muted">{formatDateTime(request.created_at)}</div>
                    </td>
                    <td className="small">
                      {Object.entries(request.changes).map(([key, value]) => (
                        <div key={key}>
                          <span className="muted">{titleCase(key)}:</span> {value}
                        </div>
                      ))}
                    </td>
                    <td className="small muted">{request.reason}</td>
                    <td>
                      <StatusBadge status={request.status} />
                      {request.review_notes ? (
                        <div className="tiny muted" style={{ marginTop: 4 }}>
                          {request.review_notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="right">
                      {canReview && request.status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelected(request)
                            setDecision('approved')
                            setNotes('')
                            setError(null)
                          }}
                        >
                          Review
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {selected ? (
        <Modal title="Review correction request" onClose={() => setSelected(null)}>
          <div className="note" style={{ marginBottom: '1rem' }}>
            <div className="note-title">
              <span>{selected.customers?.full_name ?? 'Customer'}</span>
              <StatusBadge status={selected.status} />
            </div>
            <div className="tiny muted">
              {selected.customers?.account_number} · {selected.branches?.name ?? '—'}
            </div>
            <div className="small" style={{ marginTop: 8 }}>
              {Object.entries(selected.changes).map(([key, value]) => (
                <div key={key}>
                  <span className="muted">{titleCase(key)}:</span> <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              Reason: {selected.reason}
            </div>
          </div>

          <Field label="Decision" htmlFor="review-decision">
            <Select
              id="review-decision"
              value={decision}
              onChange={(event) => setDecision(event.target.value as 'approved' | 'rejected')}
            >
              <option value="approved">Approve and apply changes</option>
              <option value="rejected">Reject</option>
            </Select>
          </Field>
          <Field label="Review notes" htmlFor="review-notes">
            <Textarea
              id="review-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={decision === 'rejected' ? 'Explain why this is rejected.' : 'Optional notes for the record.'}
            />
          </Field>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="row">
            <Button onClick={submitReview} loading={busy}>
              Confirm decision
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
          </div>
          <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>
            Approving applies the corrected fields to the customer record and notifies the customer.
          </p>
        </Modal>
      ) : null}
    </>
  )
}
