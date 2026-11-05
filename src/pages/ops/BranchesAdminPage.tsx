import { useState, type FormEvent } from 'react'
import { Pencil, Plus, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAction, useAsync } from '../../lib/hooks'
import type { Branch } from '../../lib/types'
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
} from '../../components/ui'

export function BranchesAdminPage() {
  const action = useAction()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)

  const data = useAsync(async () => {
    const [branchResult, staffResult, coverageResult] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('profiles').select('id, branch_id'),
      supabase.from('branch_coverage').select('id, branch_id'),
    ])
    if (branchResult.error) throw branchResult.error
    return {
      branches: (branchResult.data ?? []) as Branch[],
      staff: (staffResult.data ?? []) as Array<{ id: string; branch_id: string | null }>,
      coverage: (coverageResult.data ?? []) as Array<{ id: string; branch_id: string }>,
    }
  }, [])

  const branches = data.data?.branches ?? []

  const buildPayload = (formData: FormData) => ({
    name: String(formData.get('name') ?? '').trim(),
    address: String(formData.get('address') ?? '').trim(),
    city: String(formData.get('city') ?? '').trim(),
    province: String(formData.get('province') ?? '').trim(),
    contactNumber: String(formData.get('contactNumber') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    isActive: formData.get('isActive') === 'on',
  })

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await action.run(() => api.createBranch(buildPayload(new FormData(event.currentTarget))), {
      success: 'Branch created.',
      onSuccess: () => {
        setCreating(false)
        data.reload()
      },
    })
  }

  const onEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    await action.run(() => api.updateBranch(editing.id, buildPayload(new FormData(event.currentTarget))), {
      success: 'Branch updated.',
      onSuccess: () => {
        setEditing(null)
        data.reload()
      },
    })
  }

  const form = (branch: Branch | null) => (
    <div className="form-grid">
      <Field label="Branch name" htmlFor="br-name" required>
        <Input id="br-name" name="name" defaultValue={branch?.name ?? ''} required />
      </Field>
      <Field label="Contact number" htmlFor="br-contact">
        <Input id="br-contact" name="contactNumber" defaultValue={branch?.contact_number ?? ''} />
      </Field>
      <Field label="Street address" htmlFor="br-address" className="span-2" required>
        <Input id="br-address" name="address" defaultValue={branch?.address ?? ''} required />
      </Field>
      <Field label="City / Municipality" htmlFor="br-city" required>
        <Input id="br-city" name="city" defaultValue={branch?.city ?? ''} required />
      </Field>
      <Field label="Province" htmlFor="br-province" required>
        <Input id="br-province" name="province" defaultValue={branch?.province ?? ''} required />
      </Field>
      <Field label="Email" htmlFor="br-email">
        <Input id="br-email" name="email" type="email" defaultValue={branch?.email ?? ''} />
      </Field>
      <Field label="Status" htmlFor="br-active">
        <Select id="br-active" name="isActive" defaultValue={branch ? (branch.is_active ? 'on' : 'off') : 'on'}>
          <option value="on">Active</option>
          <option value="off">Inactive</option>
        </Select>
      </Field>
    </div>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Branches</h1>
          <p>Company-wide branch directory used across the public site and all portals.</p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          <Button onClick={() => setCreating(true)} icon={<Plus size={15} />}>
            Add branch
          </Button>
        </div>
      </div>

      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      {action.success ? <Alert tone="success">{action.success}</Alert> : null}

      <Card>
        <CardHeader title="Branch directory" subtitle={`${branches.length} branch(es)`} />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : branches.length === 0 ? (
            <EmptyState title="No branches yet" hint="Add a branch before creating staff accounts." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Location</th>
                  <th>Contact</th>
                  <th>Staff</th>
                  <th>Coverage areas</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id}>
                    <td className="strong">{branch.name}</td>
                    <td className="small">
                      <div>{branch.address}</div>
                      <div className="tiny muted">{branch.city}, {branch.province}</div>
                    </td>
                    <td className="small">
                      <div>{branch.contact_number ?? '—'}</div>
                      <div className="tiny muted">{branch.email ?? '—'}</div>
                    </td>
                    <td>{(data.data?.staff ?? []).filter((row) => row.branch_id === branch.id).length}</td>
                    <td>{(data.data?.coverage ?? []).filter((row) => row.branch_id === branch.id).length}</td>
                    <td>
                      <span className={`badge ${branch.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {branch.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="right">
                      <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(branch)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {creating ? (
        <Modal title="Add branch" onClose={() => setCreating(false)} wide>
          <form onSubmit={onCreate}>
            {form(null)}
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy}>Create branch</Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)} wide>
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
    </>
  )
}
