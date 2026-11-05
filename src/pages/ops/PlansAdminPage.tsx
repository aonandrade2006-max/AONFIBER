import { useState, type FormEvent } from 'react'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAction, useAsync } from '../../lib/hooks'
import type { InternetPlan } from '../../lib/types'
import { peso } from '../../lib/format'
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

export function PlansAdminPage() {
  const action = useAction()
  const [editing, setEditing] = useState<InternetPlan | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<InternetPlan | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const data = useAsync(async () => {
    const [planResult, customerResult] = await Promise.all([
      supabase.from('internet_plans').select('*').order('sort_order'),
      supabase.from('customers').select('plan_id'),
    ])
    if (planResult.error) throw planResult.error
    return {
      plans: (planResult.data ?? []) as InternetPlan[],
      usage: (customerResult.data ?? []) as Array<{ plan_id: string | null }>,
    }
  }, [])

  const plans = data.data?.plans ?? []

  const buildPayload = (formData: FormData) => ({
    name: String(formData.get('name') ?? '').trim(),
    speedMbps: Number(formData.get('speedMbps') ?? 0),
    monthlyPrice: Number(formData.get('monthlyPrice') ?? 0),
    description: String(formData.get('description') ?? '').trim(),
    features: String(formData.get('features') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    isActive: formData.get('isActive') === 'on',
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  })

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = buildPayload(new FormData(event.currentTarget))
    await action.run(() => api.createPlan(payload), {
      success: 'Plan created.',
      onSuccess: () => {
        setCreating(false)
        data.reload()
      },
    })
  }

  const onEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    const payload = buildPayload(new FormData(event.currentTarget))
    await action.run(() => api.updatePlan(editing.id, payload), {
      success: 'Plan updated.',
      onSuccess: () => {
        setEditing(null)
        data.reload()
      },
    })
  }

  const onDelete = async () => {
    if (!deleting) return
    setMessage(null)
    try {
      const result = await api.deletePlan(deleting.id)
      setMessage(result.message ?? 'Plan deleted.')
      setDeleting(null)
      data.reload()
    } catch (caught) {
      action.setError(caught instanceof Error ? caught.message : 'Could not delete the plan.')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Internet plans</h1>
          <p>These plans appear on the public website and in the customer account picker.</p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          <Button onClick={() => setCreating(true)} icon={<Plus size={15} />}>
            Add plan
          </Button>
        </div>
      </div>

      {message ? <Alert tone="success">{message}</Alert> : null}
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      {action.success ? <Alert tone="success">{action.success}</Alert> : null}

      <Card>
        <CardHeader title="Plans" subtitle={`${plans.length} plan(s)`} />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : plans.length === 0 ? (
            <EmptyState title="No plans yet" hint="Add your first plan to publish it on the website." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Speed</th>
                  <th>Monthly price</th>
                  <th>Customers</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <div className="strong">{plan.name}</div>
                      <div className="tiny muted">{plan.description ?? '—'}</div>
                    </td>
                    <td>{plan.speed_mbps} Mbps</td>
                    <td>{peso(plan.monthly_price)}</td>
                    <td>{(data.data?.usage ?? []).filter((row) => row.plan_id === plan.id).length}</td>
                    <td>
                      <span className={`badge ${plan.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {plan.is_active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(plan)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(plan)}>
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

      {creating || editing ? (
        <Modal
          title={editing ? `Edit ${editing.name}` : 'Add internet plan'}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          wide
        >
          <form onSubmit={editing ? onEdit : onCreate}>
            <div className="form-grid">
              <Field label="Plan name" htmlFor="plan-name" required>
                <Input id="plan-name" name="name" defaultValue={editing?.name ?? ''} required />
              </Field>
              <Field label="Speed (Mbps)" htmlFor="plan-speed" required>
                <Input
                  id="plan-speed"
                  name="speedMbps"
                  type="number"
                  min={1}
                  defaultValue={editing?.speed_mbps ?? 100}
                  required
                />
              </Field>
              <Field label="Monthly price (PHP)" htmlFor="plan-price" required>
                <Input
                  id="plan-price"
                  name="monthlyPrice"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={editing?.monthly_price ?? 999}
                  required
                />
              </Field>
              <Field label="Sort order" htmlFor="plan-sort" help="Lower numbers appear first.">
                <Input
                  id="plan-sort"
                  name="sortOrder"
                  type="number"
                  min={0}
                  defaultValue={editing?.sort_order ?? 0}
                />
              </Field>
              <Field label="Description" htmlFor="plan-desc" className="span-2">
                <Textarea
                  id="plan-desc"
                  name="description"
                  defaultValue={editing?.description ?? ''}
                  placeholder="Short marketing description shown on the plan card."
                />
              </Field>
              <Field
                label="Inclusions (one per line)"
                htmlFor="plan-features"
                className="span-2"
              >
                <Textarea
                  id="plan-features"
                  name="features"
                  defaultValue={(editing?.features ?? []).join('\n')}
                  placeholder={'Up to 100 Mbps\nUnlimited data\nFree installation'}
                />
              </Field>
              <Field label="Status" htmlFor="plan-active">
                <Select id="plan-active" name="isActive" defaultValue={editing ? (editing.is_active ? 'on' : 'off') : 'on'}>
                  <option value="on">Active (visible on the website)</option>
                  <option value="off">Archived</option>
                </Select>
              </Field>
            </div>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy}>
                {editing ? 'Save changes' : 'Create plan'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreating(false)
                  setEditing(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal title={`Delete ${deleting.name}?`} onClose={() => setDeleting(null)}>
          <p className="small muted">
            Plans already assigned to customers are archived instead of deleted so existing accounts
            keep their plan details.
          </p>
          <div className="row">
            <Button variant="danger" onClick={onDelete} loading={action.busy} icon={<Trash2 size={15} />}>
              Delete plan
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
