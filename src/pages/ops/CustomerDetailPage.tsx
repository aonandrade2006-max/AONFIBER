import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BellRing,
  ClipboardEdit,
  LifeBuoy,
  Printer,
  RefreshCw,
  Router,
  Save,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useAction, useAsync } from '../../lib/hooks'
import { usePortalBase } from '../../lib/portal'
import { useStaffAuth } from '../../context/StaffAuth'
import type {
  AccountChangeRequest,
  BillingRecord,
  Branch,
  Customer,
  Installation,
  InternetPlan,
  SupportTicket,
} from '../../lib/types'
import { addDaysIso, formatDate, formatDateTime, peso, titleCase } from '../../lib/format'
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

type ModalKind = 'edit' | 'correction' | 'installation' | 'ticket' | 'notify' | null

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const { profile } = useStaffAuth()
  const isAdmin = profile?.role === 'admin'
  const base = usePortalBase()
  const action = useAction()
  const [modal, setModal] = useState<ModalKind>(null)

  const data = useAsync(async () => {
    if (!customerId) return null
    const { data: customerRow, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .maybeSingle()
    if (error) throw error
    if (!customerRow) return null

    const customer = customerRow as Customer

    const [planResult, branchResult, installResult, ticketResult, changeResult, planList, branchList, profileList, billingResult] =
      await Promise.all([
        customer.plan_id
          ? supabase.from('internet_plans').select('*').eq('id', customer.plan_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('branches').select('*').eq('id', customer.branch_id).maybeSingle(),
        supabase.from('installations').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
        supabase.from('support_tickets').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
        supabase.from('account_change_requests').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
        supabase.from('internet_plans').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('branches').select('*').eq('is_active', true).order('name'),
        supabase.from('profiles').select('id, full_name').eq('branch_id', customer.branch_id),
        supabase.from('billing_records').select('*').eq('customer_id', customer.id).order('due_date', { ascending: false }),
      ])

    return {
      customer,
      plan: (planResult.data as InternetPlan | null) ?? null,
      branch: (branchResult.data as Branch | null) ?? null,
      installations: (installResult.data ?? []) as Installation[],
      tickets: (ticketResult.data ?? []) as SupportTicket[],
      changeRequests: (changeResult.data ?? []) as AccountChangeRequest[],
      plans: (planList.data ?? []) as InternetPlan[],
      branches: (branchList.data ?? []) as Branch[],
      staff: (profileList.data ?? []) as Array<{ id: string; full_name: string }>,
      billing: (billingResult.data ?? []) as BillingRecord[],
    }
  }, [customerId])

  if (data.loading) return <Loading label="Loading customer account…" />
  if (data.error) return <Alert tone="error">{data.error}</Alert>
  if (!data.data) {
    return (
      <Card>
        <EmptyState
          title="Customer account not found"
          hint="It may belong to another branch. Ask an administrator for access."
        />
      </Card>
    )
  }

  const { customer, plan, branch, installations, tickets, changeRequests, plans, staff, billing } = data.data
  const staffName = (id: string | null) =>
    staff.find((member) => member.id === id)?.full_name ?? '—'

  const outstanding = billing
    .filter((record) => record.status !== 'paid')
    .reduce((total, record) => total + (Number(record.amount_due) - Number(record.amount_paid)), 0)

  const submitCorrection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const changeKeys = ['full_name', 'contact_number', 'email', 'address', 'city', 'barangay', 'notes'] as const
    const changes: Record<string, string> = {}
    for (const key of changeKeys) {
      const value = String(formData.get(key) ?? '').trim()
      if (value) changes[key] = value
    }
    const reason = String(formData.get('reason') ?? '').trim()
    if (Object.keys(changes).length === 0) {
      action.setError('Change at least one field before submitting.')
      return
    }
    if (reason.length < 10) {
      action.setError('Explain why the correction is needed (at least 10 characters).')
      return
    }
    const ok = await action.run(() => api.createChangeRequest(customer.id, changes, reason), {
      success: 'Correction request submitted for approval.',
      onSuccess: () => {
        setModal(null)
        data.reload()
      },
    })
    if (ok) {
      /* reload handled */
    }
  }

  const submitInstallation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const requestedDate = String(formData.get('requestedDate') ?? '')
    const notes = String(formData.get('notes') ?? '')
    await action.run(
      () => api.createInstallation(customer.id, { requestedDate: requestedDate || undefined, notes: notes || undefined }),
      {
        success: 'Installation request created.',
        onSuccess: () => {
          setModal(null)
          data.reload()
        },
      },
    )
  }

  const submitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const category = String(formData.get('category') ?? 'technical')
    const subject = String(formData.get('subject') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const priority = String(formData.get('priority') ?? 'normal')
    if (subject.length < 4 || description.length < 5) {
      action.setError('Enter a subject and a short description.')
      return
    }
    await action.run(() => api.createStaffTicket(customer.id, { category, subject, description, priority }), {
      success: 'Support ticket recorded for the customer.',
      onSuccess: () => {
        setModal(null)
        data.reload()
      },
    })
  }

  const submitNotification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const title = String(formData.get('title') ?? '').trim()
    const body = String(formData.get('body') ?? '').trim()
    const category = String(formData.get('category') ?? 'general')
    if (title.length < 3 || body.length < 3) {
      action.setError('Enter a title and message.')
      return
    }
    await action.run(() => api.notifyCustomer(customer.id, { title, body, category }), {
      success: 'Notification sent to the customer portal.',
      onSuccess: () => {
        setModal(null)
        data.reload()
      },
    })
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload: Record<string, unknown> = {
      fullName: String(formData.get('fullName') ?? '').trim(),
      contactNumber: String(formData.get('contactNumber') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      address: String(formData.get('address') ?? '').trim(),
      city: String(formData.get('city') ?? '').trim(),
      barangay: String(formData.get('barangay') ?? '').trim(),
      planId: String(formData.get('planId') ?? ''),
      subscriptionStatus: String(formData.get('subscriptionStatus') ?? ''),
      installationStatus: String(formData.get('installationStatus') ?? ''),
      dueDate: String(formData.get('dueDate') ?? ''),
      notes: String(formData.get('notes') ?? '').trim(),
    }
    const billingValue = String(formData.get('monthlyBilling') ?? '').trim()
    if (billingValue) payload.monthlyBilling = Number(billingValue)

    await action.run(() => api.updateCustomer(customer.id, payload), {
      success: 'Customer account updated.',
      onSuccess: () => {
        setModal(null)
        data.reload()
      },
    })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{customer.full_name}</h1>
          <p>
            <strong>{customer.account_number}</strong> · {branch?.name ?? '—'} ·{' '}
            <StatusBadge status={customer.subscription_status} />
          </p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          <Link className="btn btn-outline" to={`${base}/customers/${customer.id}/receipt`}>
            <Printer size={15} /> Receipt
          </Link>
          {isAdmin ? (
            <Button onClick={() => setModal('edit')} icon={<ClipboardEdit size={15} />}>
              Edit account
            </Button>
          ) : (
            <Button onClick={() => setModal('correction')} icon={<ClipboardEdit size={15} />}>
              Request correction
            </Button>
          )}
        </div>
      </div>

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}
      {action.success ? <Alert tone="success">{action.success}</Alert> : null}
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHeader title="Account information" subtitle="Read-only unless you are an administrator" />
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
                <dd>{branch?.name ?? '—'}</dd>
              </div>
              <div className="detail">
                <dt>Plan</dt>
                <dd>{plan ? `${plan.name} · ${plan.speed_mbps} Mbps` : 'No plan'}</dd>
              </div>
              <div className="detail">
                <dt>Monthly billing</dt>
                <dd>{peso(customer.monthly_billing)}</dd>
              </div>
              <div className="detail">
                <dt>Due date</dt>
                <dd>{formatDate(customer.due_date)}</dd>
              </div>
              <div className="detail">
                <dt>Installation</dt>
                <dd><StatusBadge status={customer.installation_status} /></dd>
              </div>
              <div className="detail">
                <dt>Outstanding balance</dt>
                <dd>{peso(outstanding)}</dd>
              </div>
              <div className="detail">
                <dt>Created</dt>
                <dd>{formatDateTime(customer.created_at)}</dd>
              </div>
            </dl>
            {customer.notes ? (
              <Alert tone="info">
                <strong>Notes:</strong> {customer.notes}
              </Alert>
            ) : null}
            <div className="row" style={{ marginTop: 8 }}>
              <Button size="sm" variant="outline" onClick={() => setModal('installation')} icon={<Router size={14} />}>
                New installation request
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModal('ticket')} icon={<LifeBuoy size={14} />}>
                Record support ticket
              </Button>
              {isAdmin ? (
                <Button size="sm" variant="ghost" onClick={() => setModal('notify')} icon={<BellRing size={14} />}>
                  Send notification
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHeader title="Installations" subtitle={`${installations.length} record(s)`} />
            <div className="card-body">
              {installations.length === 0 ? (
                <EmptyState title="No installation requests" />
              ) : (
                <div className="stack-sm">
                  {installations.slice(0, 4).map((item) => (
                    <div className="note" key={item.id}>
                      <div className="note-title">
                        <span>{item.reference_number}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="tiny muted">
                        Requested {formatDate(item.requested_date)} · Scheduled{' '}
                        {formatDate(item.scheduled_date)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Support tickets" subtitle={`${tickets.length} record(s)`} />
            <div className="card-body">
              {tickets.length === 0 ? (
                <EmptyState title="No support tickets" />
              ) : (
                <div className="stack-sm">
                  {tickets.slice(0, 4).map((item) => (
                    <div className="note" key={item.id}>
                      <div className="note-title">
                        <span>{item.subject}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="tiny muted">
                        {item.reference_number} · {titleCase(item.category)} ·{' '}
                        {formatDate(item.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card style={{ marginTop: '1.25rem' }}>
        <CardHeader title="Account correction requests" subtitle="Requires manager or admin approval" />
        <div className="card-body">
          {changeRequests.length === 0 ? (
            <EmptyState
              title="No correction requests"
              hint="Employees can request corrections without editing protected account data."
            />
          ) : (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>By</th>
                    <th>Changes</th>
                    <th>Reason</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {changeRequests.map((request) => (
                    <tr key={request.id}>
                      <td className="small nowrap">{formatDateTime(request.created_at)}</td>
                      <td className="small">{staffName(request.requested_by)}</td>
                      <td className="small">
                        {Object.entries(request.changes).map(([key, value]) => (
                          <div key={key}>
                            <span className="muted">{titleCase(key)}:</span> {value}
                          </div>
                        ))}
                      </td>
                      <td className="small muted">{request.reason}</td>
                      <td><StatusBadge status={request.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {modal === 'edit' ? (
        <Modal title="Edit customer account" onClose={() => setModal(null)} wide>
          <form onSubmit={submitEdit}>
            <div className="form-grid">
              <Field label="Full name" htmlFor="edit-name" required>
                <Input id="edit-name" name="fullName" defaultValue={customer.full_name} required />
              </Field>
              <Field label="Mobile number" htmlFor="edit-contact" required>
                <Input id="edit-contact" name="contactNumber" defaultValue={customer.contact_number} required />
              </Field>
              <Field label="Email" htmlFor="edit-email">
                <Input id="edit-email" name="email" type="email" defaultValue={customer.email ?? ''} />
              </Field>
              <Field label="Plan" htmlFor="edit-plan">
                <Select id="edit-plan" name="planId" defaultValue={customer.plan_id ?? ''}>
                  <option value="">No plan</option>
                  {plans.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {peso(item.monthly_price)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Street address" htmlFor="edit-address" className="span-2" required>
                <Input id="edit-address" name="address" defaultValue={customer.address} required />
              </Field>
              <Field label="City" htmlFor="edit-city">
                <Input id="edit-city" name="city" defaultValue={customer.city ?? ''} />
              </Field>
              <Field label="Barangay" htmlFor="edit-barangay">
                <Input id="edit-barangay" name="barangay" defaultValue={customer.barangay ?? ''} />
              </Field>
              <Field
                label="Monthly billing (PHP)"
                htmlFor="edit-billing"
                help="Leave blank to use the plan price."
              >
                <Input
                  id="edit-billing"
                  name="monthlyBilling"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={customer.monthly_billing}
                />
              </Field>
              <Field label="Next due date" htmlFor="edit-due">
                <Input id="edit-due" name="dueDate" type="date" defaultValue={customer.due_date ?? addDaysIso(30)} />
              </Field>
              <Field label="Subscription status" htmlFor="edit-status">
                <Select id="edit-status" name="subscriptionStatus" defaultValue={customer.subscription_status}>
                  {['pending', 'active', 'suspended', 'disconnected'].map((value) => (
                    <option key={value} value={value}>{titleCase(value)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Installation status" htmlFor="edit-install">
                <Select id="edit-install" name="installationStatus" defaultValue={customer.installation_status}>
                  {['not_scheduled', 'scheduled', 'in_progress', 'completed', 'failed'].map((value) => (
                    <option key={value} value={value}>{titleCase(value)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes" htmlFor="edit-notes" className="span-2">
                <Textarea id="edit-notes" name="notes" defaultValue={customer.notes ?? ''} />
              </Field>
            </div>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy} icon={<Save size={15} />}>
                Save changes
              </Button>
              <Button type="button" variant="ghost" onClick={() => setModal(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal === 'correction' ? (
        <Modal title="Request an account correction" onClose={() => setModal(null)} wide>
          <form onSubmit={submitCorrection}>
            <Alert tone="info">
              Existing customer records cannot be edited by employees. Fill in only the fields that
              need correcting; a branch manager or administrator will review the request.
            </Alert>
            <div className="form-grid">
              <Field label="Full name" htmlFor="cr-name">
                <Input id="cr-name" name="full_name" defaultValue={customer.full_name} />
              </Field>
              <Field label="Mobile number" htmlFor="cr-contact">
                <Input id="cr-contact" name="contact_number" defaultValue={customer.contact_number} />
              </Field>
              <Field label="Email" htmlFor="cr-email">
                <Input id="cr-email" name="email" type="email" defaultValue={customer.email ?? ''} />
              </Field>
              <Field label="Barangay" htmlFor="cr-barangay">
                <Input id="cr-barangay" name="barangay" defaultValue={customer.barangay ?? ''} />
              </Field>
              <Field label="Street address" htmlFor="cr-address" className="span-2">
                <Input id="cr-address" name="address" defaultValue={customer.address} />
              </Field>
              <Field label="Notes" htmlFor="cr-notes" className="span-2">
                <Input id="cr-notes" name="notes" defaultValue={customer.notes ?? ''} />
              </Field>
              <Field label="Reason for correction" htmlFor="cr-reason" className="span-2" required>
                <Textarea
                  id="cr-reason"
                  name="reason"
                  placeholder="Explain what is wrong and where the correct information came from."
                  required
                />
              </Field>
            </div>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy}>
                Submit request
              </Button>
              <Button type="button" variant="ghost" onClick={() => setModal(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal === 'installation' ? (
        <Modal title="New installation request" onClose={() => setModal(null)}>
          <form onSubmit={submitInstallation}>
            <Field label="Requested date" htmlFor="inst-date">
              <Input id="inst-date" name="requestedDate" type="date" />
            </Field>
            <Field label="Notes" htmlFor="inst-notes">
              <Textarea id="inst-notes" name="notes" placeholder="Access instructions, preferred time." />
            </Field>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy}>Create request</Button>
              <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal === 'ticket' ? (
        <Modal title="Record a support ticket" onClose={() => setModal(null)} wide>
          <form onSubmit={submitTicket}>
            <Alert tone="info">
              Use this for concerns raised in person or over the phone. The customer sees the ticket
              and status updates in their portal.
            </Alert>
            <div className="form-grid">
              <Field label="Concern type" htmlFor="tk-category" required>
                <Select id="tk-category" name="category" defaultValue="technical">
                  <option value="technical">Technical support</option>
                  <option value="billing">Billing concern</option>
                  <option value="installation">Installation concern</option>
                </Select>
              </Field>
              <Field label="Priority" htmlFor="tk-priority">
                <Select id="tk-priority" name="priority" defaultValue="normal">
                  {['low', 'normal', 'high', 'urgent'].map((value) => (
                    <option key={value} value={value}>{titleCase(value)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Subject" htmlFor="tk-subject" className="span-2" required>
                <Input id="tk-subject" name="subject" required />
              </Field>
              <Field label="Description" htmlFor="tk-description" className="span-2" required>
                <Textarea id="tk-description" name="description" required />
              </Field>
            </div>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy}>Create ticket</Button>
              <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal === 'notify' ? (
        <Modal title="Send a portal notification" onClose={() => setModal(null)}>
          <form onSubmit={submitNotification}>
            <Field label="Title" htmlFor="nt-title" required>
              <Input id="nt-title" name="title" required />
            </Field>
            <Field label="Message" htmlFor="nt-body" required>
              <Textarea id="nt-body" name="body" required />
            </Field>
            <Field label="Category" htmlFor="nt-category">
              <Select id="nt-category" name="category" defaultValue="general">
                {['general', 'installation', 'billing', 'support', 'account'].map((value) => (
                  <option key={value} value={value}>{titleCase(value)}</option>
                ))}
              </Select>
            </Field>
            <p className="help">
              External email/SMS delivery is used only when a provider is configured. Otherwise the
              notification appears in the customer portal.
            </p>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy} icon={<BellRing size={15} />}>
                Send notification
              </Button>
              <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
