import { useState, type FormEvent } from 'react'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAction, useAsync } from '../../lib/hooks'
import type { Branch, BranchCoverage } from '../../lib/types'
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
  Textarea,
} from '../../components/ui'

type CoverageRow = BranchCoverage & { branches?: { name: string } | null }

export function CoverageAdminPage() {
  const action = useAction()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<CoverageRow | null>(null)
  const [deleting, setDeleting] = useState<CoverageRow | null>(null)
  const [branchFilter, setBranchFilter] = useState('')

  const data = useAsync(async () => {
    const [coverageResult, branchResult] = await Promise.all([
      supabase.from('branch_coverage').select('*, branches(name)').order('city').order('barangay'),
      supabase.from('branches').select('*').order('name'),
    ])
    if (coverageResult.error) throw coverageResult.error
    return {
      coverage: (coverageResult.data ?? []) as CoverageRow[],
      branches: (branchResult.data ?? []) as Branch[],
    }
  }, [])

  const branches = data.data?.branches ?? []
  const rows = (data.data?.coverage ?? []).filter((row) =>
    branchFilter ? row.branch_id === branchFilter : true,
  )

  const buildPayload = (formData: FormData) => ({
    branchId: String(formData.get('branchId') ?? ''),
    city: String(formData.get('city') ?? '').trim(),
    barangay: String(formData.get('barangay') ?? '').trim(),
    area: String(formData.get('area') ?? '').trim(),
    isServiceable: formData.get('isServiceable') === 'on',
    notes: String(formData.get('notes') ?? '').trim(),
  })

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await action.run(() => api.createCoverage(buildPayload(new FormData(event.currentTarget))), {
      success: 'Coverage area added.',
      onSuccess: () => {
        setCreating(false)
        data.reload()
      },
    })
  }

  const onEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    await action.run(() => api.updateCoverage(editing.id, buildPayload(new FormData(event.currentTarget))), {
      success: 'Coverage area updated.',
      onSuccess: () => {
        setEditing(null)
        data.reload()
      },
    })
  }

  const onDelete = async () => {
    if (!deleting) return
    await action.run(() => api.deleteCoverage(deleting.id), {
      success: 'Coverage area removed.',
      onSuccess: () => {
        setDeleting(null)
        data.reload()
      },
    })
  }

  const form = (row: CoverageRow | null) => (
    <>
      <div className="form-grid">
        <Field label="Branch" htmlFor="cov-branch" required>
          <Select id="cov-branch" name="branchId" defaultValue={row?.branch_id ?? ''} required>
            <option value="">Select a branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="City / Municipality" htmlFor="cov-city" required>
          <Input id="cov-city" name="city" defaultValue={row?.city ?? ''} required />
        </Field>
        <Field label="Barangay" htmlFor="cov-barangay" required>
          <Input id="cov-barangay" name="barangay" defaultValue={row?.barangay ?? ''} required />
        </Field>
        <Field label="Area / Subdivision (optional)" htmlFor="cov-area">
          <Input
            id="cov-area"
            name="area"
            defaultValue={row?.area ?? ''}
            placeholder="Leave blank to cover the whole barangay"
          />
        </Field>
        <Field label="Service status" htmlFor="cov-serviceable">
          <Select
            id="cov-serviceable"
            name="isServiceable"
            defaultValue={row ? (row.is_serviceable ? 'on' : 'off') : 'on'}
          >
            <option value="on">Serviceable</option>
            <option value="off">Not yet available</option>
          </Select>
        </Field>
        <Field label="Notes" htmlFor="cov-notes" className="span-2">
          <Textarea
            id="cov-notes"
            name="notes"
            defaultValue={row?.notes ?? ''}
            placeholder="e.g. Construction ongoing, target Q2"
          />
        </Field>
      </div>
      <Alert tone="info">
        The public coverage checker only reports what is configured here. Unlisted locations are
        shown as “please contact your nearest branch”.
      </Alert>
    </>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Coverage areas</h1>
          <p>Manage the locations each branch can serve. These records power the public checker.</p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          <Button onClick={() => setCreating(true)} icon={<Plus size={15} />}>
            Add coverage
          </Button>
        </div>
      </div>

      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      {action.success ? <Alert tone="success">{action.success}</Alert> : null}

      <Card style={{ marginBottom: '1.25rem' }}>
        <div className="card-body">
          <Field label="Filter by branch" htmlFor="cov-filter">
            <Select id="cov-filter" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Coverage records" subtitle={`${rows.length} record(s)`} />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <EmptyState title="No coverage records" hint="Add the barangays your branches serve." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>City</th>
                  <th>Barangay</th>
                  <th>Area</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="small">{row.branches?.name ?? '—'}</td>
                    <td>{row.city}</td>
                    <td>{row.barangay}</td>
                    <td className="small">{row.area ?? 'Whole barangay'}</td>
                    <td>
                      <span className={`badge ${row.is_serviceable ? 'badge-green' : 'badge-amber'}`}>
                        {row.is_serviceable ? 'Serviceable' : 'Not yet available'}
                      </span>
                    </td>
                    <td className="small muted">{row.notes ?? '—'}</td>
                    <td>
                      <div className="actions">
                        <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(row)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(row)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {creating ? (
        <Modal title="Add coverage area" onClose={() => setCreating(false)} wide>
          <form onSubmit={onCreate}>
            {form(null)}
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy}>Add coverage</Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title="Edit coverage area" onClose={() => setEditing(null)} wide>
          <form onSubmit={onEdit}>
            {form(editing)}
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy}>Save changes</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal title="Delete coverage area?" onClose={() => setDeleting(null)}>
          <p className="small muted">
            {deleting.barangay}, {deleting.city} will no longer appear in the coverage checker.
          </p>
          <div className="row">
            <Button variant="danger" onClick={onDelete} loading={action.busy}>Delete</Button>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
