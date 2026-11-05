import { useState, type FormEvent } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import { useStaffAuth } from '../../context/StaffAuth'
import type { Installation, InstallationStatus } from '../../lib/types'
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
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from '../../components/ui'

type InstallationRow = Installation & {
  customers?: { full_name: string; account_number: string } | null
  branches?: { name: string } | null
}

const STATUSES = ['pending', 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled'] as const

export function InstallationsPage() {
  const { profile } = useStaffAuth()
  const isAdmin = profile?.role === 'admin'
  const [status, setStatus] = useState('')
  const [branchId, setBranchId] = useState('')
  const [selected, setSelected] = useState<InstallationRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const branches = useAsync(async () => {
    if (!isAdmin) return [] as Array<{ id: string; name: string }>
    const { data } = await supabase.from('branches').select('id, name').order('name')
    return (data ?? []) as Array<{ id: string; name: string }>
  }, [isAdmin])

  const data = useAsync(async () => {
    let query = supabase
      .from('installations')
      .select('*, customers(full_name, account_number), branches(name)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) query = query.eq('status', status as InstallationStatus)
    if (branchId) query = query.eq('branch_id', branchId)

    const { data: rows, error: queryError } = await query
    if (queryError) throw queryError
    return (rows ?? []) as InstallationRow[]
  }, [status, branchId])

  const onSubmitUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const formData = new FormData(event.currentTarget)
    const nextStatus = String(formData.get('status') ?? 'pending')
    const scheduledDate = String(formData.get('scheduledDate') ?? '')
    const notes = String(formData.get('notes') ?? '').trim()

    setBusy(true)
    setError(null)
    setSuccess(null)
    const { error: updateError } = await supabase
      .from('installations')
      .update({
        status: nextStatus,
        scheduled_date: scheduledDate || null,
        notes: notes || null,
      })
      .eq('id', selected.id)
    setBusy(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setSuccess(`Installation ${selected.reference_number} updated to ${titleCase(nextStatus)}.`)
    setSelected(null)
    data.reload()
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Installations</h1>
          <p>Schedule and progress installation requests. Customer notifications are automatic.</p>
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
            <Field label="Status" htmlFor="inst-filter-status">
              <Select id="inst-filter-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>{titleCase(value)}</option>
                ))}
              </Select>
            </Field>
            {isAdmin ? (
              <Field label="Branch" htmlFor="inst-filter-branch">
                <Select id="inst-filter-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
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
        <CardHeader title="Installation requests" subtitle={`${data.data?.length ?? 0} record(s)`} />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : (data.data ?? []).length === 0 ? (
            <EmptyState
              title="No installation requests"
              hint="Create one from a customer account page, or when creating a new customer."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Branch</th>
                  <th>Requested</th>
                  <th>Scheduled</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data.data ?? []).map((installation) => (
                  <tr key={installation.id}>
                    <td className="strong nowrap">{installation.reference_number}</td>
                    <td>
                      <div className="strong">{installation.customers?.full_name ?? '—'}</div>
                      <div className="tiny muted">{installation.customers?.account_number}</div>
                    </td>
                    <td className="small">{installation.branches?.name ?? '—'}</td>
                    <td className="small nowrap">{formatDate(installation.requested_date)}</td>
                    <td className="small nowrap">{formatDate(installation.scheduled_date)}</td>
                    <td><StatusBadge status={installation.status} /></td>
                    <td className="small nowrap">{formatDate(installation.created_at)}</td>
                    <td className="right">
                      <Button size="sm" variant="outline" onClick={() => setSelected(installation)}>
                        Update
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {selected ? (
        <Modal title={`Update ${selected.reference_number}`} onClose={() => setSelected(null)}>
          <form onSubmit={onSubmitUpdate}>
            <p className="small muted">
              {selected.customers?.full_name ?? 'Customer'} · created{' '}
              {formatDateTime(selected.created_at)}
            </p>
            <Field label="Status" htmlFor="upd-status" required>
              <Select id="upd-status" name="status" defaultValue={selected.status}>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>{titleCase(value)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Scheduled date" htmlFor="upd-schedule">
              <Input
                id="upd-schedule"
                name="scheduledDate"
                type="date"
                defaultValue={selected.scheduled_date ?? ''}
              />
            </Field>
            <Field label="Notes" htmlFor="upd-notes">
              <Textarea id="upd-notes" name="notes" defaultValue={selected.notes ?? ''} />
            </Field>
            <p className="help">
              Changing the status or schedule sends a notification to the customer portal.
            </p>
            <div className="row">
              <Button type="submit" loading={busy} icon={<Save size={15} />}>Save update</Button>
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
