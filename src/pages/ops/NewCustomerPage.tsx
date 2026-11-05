import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, FileText, Printer, UserPlus } from 'lucide-react'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAction, useAsync } from '../../lib/hooks'
import { usePortalBase } from '../../lib/portal'
import { useStaffAuth } from '../../context/StaffAuth'
import type { Branch, InternetPlan } from '../../lib/types'
import { peso } from '../../lib/format'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '../../components/ui'

type CreatedResult = {
  customer: { id: string; account_number: string; full_name: string }
  installation: { reference_number: string } | null
  installationWarning?: string | null
}

export function NewCustomerPage() {
  const { profile, branch } = useStaffAuth()
  const navigate = useNavigate()
  const base = usePortalBase()
  const isAdmin = profile?.role === 'admin'
  const action = useAction()
  const [created, setCreated] = useState<CreatedResult | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [selectedBranch, setSelectedBranch] = useState(branch?.id ?? '')

  const data = useAsync(async () => {
    const [branchResult, planResult] = await Promise.all([
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
      supabase.from('internet_plans').select('*').eq('is_active', true).order('sort_order'),
    ])
    return {
      branches: (branchResult.data ?? []) as Branch[],
      plans: (planResult.data ?? []) as InternetPlan[],
    }
  }, [])

  const plans = data.data?.plans ?? []
  const branches = data.data?.branches ?? []

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const fullName = String(formData.get('fullName') ?? '').trim()
    const contactNumber = String(formData.get('contactNumber') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const address = String(formData.get('address') ?? '').trim()
    const city = String(formData.get('city') ?? '').trim()
    const barangay = String(formData.get('barangay') ?? '').trim()
    const planId = String(formData.get('planId') ?? '')
    const notes = String(formData.get('notes') ?? '').trim()
    const installationRequestedDate = String(formData.get('installationRequestedDate') ?? '')
    const createInstallation = formData.get('createInstallation') === 'on'

    if (fullName.length < 2) {
      action.setError('Enter the customer’s full name.')
      return
    }
    if (!/^(\+?63|0)9\d{9}$/.test(contactNumber.replace(/[\s-]/g, ''))) {
      action.setError('Enter a valid PH mobile number, e.g. 09171234567.')
      return
    }
    if (address.length < 5) {
      action.setError('Enter the complete service address.')
      return
    }
    if (isAdmin && !selectedBranch) {
      action.setError('Select the branch that owns this account.')
      return
    }

    await action.run(
      () =>
        api.createCustomer({
          fullName,
          contactNumber,
          email: email || undefined,
          address,
          city: city || undefined,
          barangay: barangay || undefined,
          planId: planId || undefined,
          branchId: isAdmin ? selectedBranch : undefined,
          notes: notes || undefined,
          installationRequestedDate: installationRequestedDate || undefined,
          createInstallation,
        }),
      {
        onSuccess: (payload) => {
          const result = payload as CreatedResult
          setCreated(result)
          form.reset()
          setFormKey((value) => value + 1)
        },
      },
    )
  }

  if (created) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Customer account created</h1>
            <p>Share the account number and receipt with the customer.</p>
          </div>
        </div>

        <Card>
          <div className="card-body">
            <div className="row" style={{ gap: 10, marginBottom: '1rem' }}>
              <CheckCircle2 size={26} color="var(--success)" />
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{created.customer.full_name}</h2>
                <div className="muted small">Account number</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--blue-800)' }}>
                  {created.customer.account_number}
                </div>
              </div>
            </div>

            {created.installation ? (
              <Alert tone="info">
                Installation request <strong>{created.installation.reference_number}</strong> was
                created for this customer.
              </Alert>
            ) : (
              <Alert tone="warn">
                {created.installationWarning ??
                  'No installation request was created. You can add one from the customer’s account page.'}
              </Alert>
            )}

            <Alert tone="warn">
              The account number is needed for the customer portal. It is not a password — the
              customer still verifies with a one-time code sent to their registered contact.
            </Alert>

            <div className="row">
              <Link
                className="btn btn-primary"
                to={`${base}/customers/${created.customer.id}/receipt`}
              >
                <Printer size={15} /> Print account receipt
              </Link>
              <Link className="btn btn-outline" to={`${base}/customers/${created.customer.id}`}>
                <FileText size={15} /> Open account
              </Link>
              <Button
                variant="ghost"
                onClick={() => setCreated(null)}
                icon={<UserPlus size={15} />}
              >
                Create another
              </Button>
              <Button variant="ghost" onClick={() => navigate(`${base}/customers`)}>
                Back to customers
              </Button>
            </div>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Create customer account</h1>
          <p>
            Accounts are created in-branch after a customer inquiry
            {branch ? ` at ${branch.name}` : ''}. The system generates the account number.
          </p>
        </div>
        <Link className="btn btn-ghost" to={`${base}/customers`}>
          Back to customers
        </Link>
      </div>

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}
      {!isAdmin && !branch ? (
        <Alert tone="warn">
          You are not assigned to a branch, so accounts cannot be created. Ask an administrator to
          assign your branch.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="New account details"
          subtitle="Fields marked with * are required. Billing is derived from the selected plan."
        />
        <div className="card-body">
          <form key={formKey} onSubmit={onSubmit}>
            <div className="form-grid">
              <Field label="Full name" htmlFor="new-name" required>
                <Input id="new-name" name="fullName" required autoComplete="name" />
              </Field>
              <Field label="Mobile number" htmlFor="new-contact" required>
                <Input
                  id="new-contact"
                  name="contactNumber"
                  placeholder="09171234567"
                  required
                  autoComplete="tel"
                />
              </Field>
              <Field label="Email (optional)" htmlFor="new-email">
                <Input id="new-email" name="email" type="email" autoComplete="email" />
              </Field>
              <Field label="Internet plan" htmlFor="new-plan">
                <Select id="new-plan" name="planId" defaultValue="">
                  <option value="">No plan yet (pending)</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {plan.speed_mbps} Mbps — {peso(plan.monthly_price)}/mo
                    </option>
                  ))}
                </Select>
              </Field>
              {isAdmin ? (
                <Field label="Branch" htmlFor="new-branch" required>
                  <Select
                    id="new-branch"
                    name="branchId"
                    value={selectedBranch}
                    onChange={(event) => setSelectedBranch(event.target.value)}
                    required
                  >
                    <option value="">Select a branch</option>
                    {branches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="Street address" htmlFor="new-address" required className={isAdmin ? 'span-2' : ''}>
                <Input
                  id="new-address"
                  name="address"
                  required
                  autoComplete="street-address"
                  placeholder="House number, street, village"
                />
              </Field>
              <Field label="City / Municipality" htmlFor="new-city">
                <Input id="new-city" name="city" autoComplete="address-level2" />
              </Field>
              <Field label="Barangay" htmlFor="new-barangay">
                <Input id="new-barangay" name="barangay" autoComplete="address-level3" />
              </Field>
              <Field
                label="Requested installation date"
                htmlFor="new-install-date"
                help="Optional. The branch can adjust this later."
              >
                <Input id="new-install-date" name="installationRequestedDate" type="date" />
              </Field>
              <Field label="Internal notes" htmlFor="new-notes" className="span-2">
                <Textarea
                  id="new-notes"
                  name="notes"
                  placeholder="Landmarks, preferred schedule, documents presented."
                />
              </Field>
            </div>

            <label className="checkbox">
              <input type="checkbox" name="createInstallation" defaultChecked />
              <span>Create an installation request for this account</span>
            </label>

            {action.error ? <Alert tone="error">{action.error}</Alert> : null}

            <div className="row">
              <Button
                type="submit"
                loading={action.busy}
                icon={<UserPlus size={15} />}
                disabled={!isAdmin && !branch}
              >
                Create account
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate(`${base}/customers`)}>
                Cancel
              </Button>
            </div>
            <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>
              Employees cannot edit account numbers, plans or billing amounts after creation.
              Corrections require a change request approved by a branch manager or administrator.
            </p>
          </form>
        </div>
      </Card>
    </>
  )
}
