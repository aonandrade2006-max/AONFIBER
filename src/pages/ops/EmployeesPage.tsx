import { useState, type FormEvent } from 'react'
import { Copy, KeyRound, Plus, RefreshCw, UserCog } from 'lucide-react'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAction, useAsync } from '../../lib/hooks'
import { useStaffAuth } from '../../context/StaffAuth'
import { ROLE_LABELS } from '../../lib/permissions'
import type { Branch, StaffProfile, StaffRole } from '../../lib/types'
import { formatDateTime, relativeTime, titleCase } from '../../lib/format'
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
} from '../../components/ui'

type EmployeeRow = StaffProfile & { branches?: { name: string; city: string } | null }

type ActivityPayload = {
  profile: Record<string, unknown>
  logs: Array<Record<string, unknown>>
  presence: Record<string, unknown> | null
}

const ROLE_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'branch_manager', label: 'Branch Manager' },
] as const

export function EmployeesPage() {
  const { profile } = useStaffAuth()
  const isAdmin = profile?.role === 'admin'
  const canCreate = isAdmin || Boolean(profile?.can_create_employees)
  const action = useAction()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<EmployeeRow | null>(null)
  const [resetting, setResetting] = useState<EmployeeRow | null>(null)
  const [activityFor, setActivityFor] = useState<EmployeeRow | null>(null)
  const [activity, setActivity] = useState<ActivityPayload | null>(null)
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const data = useAsync(async () => {
    const [profileResult, branchResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('*, branches(name, city)')
        .order('full_name'),
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
    ])
    if (profileResult.error) throw profileResult.error
    const employees: EmployeeRow[] = profileResult.data ?? []
    const branches: Branch[] = branchResult.data ?? []
    return { employees, branches }
  }, [])

  const employees = data.data?.employees ?? []
  const branches = data.data?.branches ?? []

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const fullName = String(formData.get('fullName') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const role = String(formData.get('role') ?? 'employee') as StaffRole
    const branchId = String(formData.get('branchId') ?? '').trim()
    const contactNumber = String(formData.get('contactNumber') ?? '').trim()
    const password = String(formData.get('password') ?? '')

    if (!fullName) {
      setError('Enter the employee full name.')
      return
    }
    if (!email) {
      setError('Enter the employee work email.')
      return
    }
    if (!password) {
      setError('Enter a password.')
      return
    }

    setError(null)

    const ok = await action.run(
      () =>
        api.createEmployee({
          fullName,
          email,
          role,
          branchId: role === 'admin' ? null : branchId || undefined,
          contactNumber: contactNumber || undefined,
          canCreateEmployees: isAdmin ? formData.get('canCreateEmployees') === 'on' : false,
          password,
        }),
      {
        onSuccess: (payload) => {
          const response = payload as { temporaryPassword: string }
          setCredentials({ email, password: response.temporaryPassword })
          setCreateOpen(false)
          form.reset()
          data.reload()
        },
      },
    )
    if (!ok) return
  }

  const onEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    const formData = new FormData(event.currentTarget)
    const role = String(formData.get('role') ?? 'employee') as StaffRole
    const branchId = String(formData.get('branchId') ?? '').trim()
    const payload: Record<string, unknown> = {
      fullName: String(formData.get('fullName') ?? '').trim(),
      role,
      branchId: role === 'admin' ? null : branchId || undefined,
      status: String(formData.get('status') ?? 'active'),
      canCreateEmployees: formData.get('canCreateEmployees') === 'on',
      contactNumber: String(formData.get('contactNumber') ?? '').trim(),
    }
    await action.run(() => api.updateEmployee(editing.id, payload), {
      success: 'Employee account updated.',
      onSuccess: () => {
        setEditing(null)
        data.reload()
      },
    })
  }

  const onReset = async () => {
    if (!resetting) return
    await action.run(() => api.resetEmployeePassword(resetting.id), {
      onSuccess: (payload) => {
        const response = payload as { temporaryPassword: string }
        setCredentials({ email: resetting.email, password: response.temporaryPassword })
        setResetting(null)
        data.reload()
      },
    })
  }

  const toggleStatus = async (employee: EmployeeRow) => {
    const nextStatus = employee.status === 'active' ? 'suspended' : 'active'
    setError(null)
    try {
      await api.updateEmployee(employee.id, { status: nextStatus })
      data.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the account status.')
    }
  }

  const openActivity = async (employee: EmployeeRow) => {
    setActivityFor(employee)
    setActivity(null)
    try {
      const payload = await api.employeeActivity(employee.id)
      setActivity(payload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load activity.')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'Employees' : 'My branch team'}</h1>
          <p>
            {isAdmin
              ? 'Create staff accounts, assign branches and monitor access.'
              : 'Employees assigned to your branch. You may add customer service accounts when permitted.'}
          </p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          {canCreate ? (
            <Button
              onClick={() => {
                setCredentials(null)
                setCreateOpen(true)
              }}
              icon={<Plus size={15} />}
            >
              Create employee
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      {action.success ? <Alert tone="success">{action.success}</Alert> : null}

      {credentials ? (
        <Alert tone="warn">
          <strong>Temporary credentials — shown once.</strong>
          <div className="row" style={{ marginTop: 6 }}>
            <code>{credentials.email}</code>
            <code>{credentials.password}</code>
            <Button
              size="sm"
              variant="ghost"
              icon={<Copy size={14} />}
              onClick={() => {
                void navigator.clipboard?.writeText(`${credentials.email} / ${credentials.password}`)
              }}
            >
              Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCredentials(null)}>
              Dismiss
            </Button>
          </div>
          <div className="small" style={{ marginTop: 4 }}>
            Share this securely. The employee can sign in at /staff/login and should change the
            password with an administrator afterwards.
          </div>
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Staff accounts" subtitle={`${employees.length} account(s)`} />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : employees.length === 0 ? (
            <EmptyState title="No employees yet" hint="Create the first staff account above." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Last activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <div className="strong">{employee.full_name}</div>
                      <div className="tiny muted">{employee.email}</div>
                      {employee.can_create_employees && employee.role === 'branch_manager' ? (
                        <span className="badge badge-blue" style={{ marginTop: 4 }}>
                          Can create employees
                        </span>
                      ) : null}
                    </td>
                    <td className="small">{ROLE_LABELS[employee.role]}</td>
                    <td className="small">{employee.branches?.name ?? 'All branches'}</td>
                    <td><StatusBadge status={employee.status} /></td>
                    <td className="small nowrap">{formatDateTime(employee.last_login_at)}</td>
                    <td className="small nowrap">{relativeTime(employee.last_activity_at)}</td>
                    <td>
                      {isAdmin ? (
                        <div className="actions">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(employee)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openActivity(employee)}>
                            Activity
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setResetting(employee)}>
                            Reset
                          </Button>
                          <Button
                            size="sm"
                            variant={employee.status === 'active' ? 'danger' : 'primary'}
                            onClick={() => toggleStatus(employee)}
                          >
                            {employee.status === 'active' ? 'Suspend' : 'Activate'}
                          </Button>
                        </div>
                      ) : (
                        <span className="tiny muted">View only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {createOpen ? (
        <Modal title="Create employee account" onClose={() => setCreateOpen(false)} wide>
          <form onSubmit={onCreate}>
            <Alert tone="info">
              Only administrators can create staff accounts. Enter a permanent password for the
              employee.
            </Alert>
            <div className="form-grid">
              <Field label="Full name" htmlFor="emp-name" required>
                <Input id="emp-name" name="fullName" required />
              </Field>
              <Field label="Work email" htmlFor="emp-email" required>
                <Input id="emp-email" name="email" type="email" required />
              </Field>
              <Field label="Role" htmlFor="emp-role" required>
                <Select id="emp-role" name="role" defaultValue="employee" required>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Branch" htmlFor="emp-branch">
                <Select
                  id="emp-branch"
                  name="branchId"
                  defaultValue={isAdmin ? '' : (profile?.branch_id ?? '')}
                  disabled={!isAdmin}
                >
                  <option value="">All branches (admins only)</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Contact number" htmlFor="emp-contact">
                <Input id="emp-contact" name="contactNumber" placeholder="09171234567" />
              </Field>
              <Field label="Password" htmlFor="emp-password" required>
                <Input
                  id="emp-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter employee password"
                  autoComplete="new-password"
                />
                <label className="checkbox" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    id="emp-password-toggle"
                    checked={showPassword}
                    onChange={() => setShowPassword((value) => !value)}
                  />
                  <span style={{ fontSize: '0.85rem' }}>{showPassword ? 'Hide password' : 'Show password'}</span>
                </label>
              </Field>
            </div>
            {isAdmin ? (
              <label className="checkbox">
                <input type="checkbox" name="canCreateEmployees" />
                <span>Allow this branch manager to create employee accounts for their branch</span>
              </label>
            ) : null}
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button
                type="submit"
                loading={action.busy}
                icon={<UserCog size={15} />}
                disabled={!!error}
              >
                Create account
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title={`Edit ${editing.full_name}`} onClose={() => setEditing(null)} wide>
          <form onSubmit={onEdit}>
            <div className="form-grid">
              <Field label="Full name" htmlFor="ed-name" required>
                <Input id="ed-name" name="fullName" defaultValue={editing.full_name} required />
              </Field>
              <Field label="Contact number" htmlFor="ed-contact">
                <Input id="ed-contact" name="contactNumber" defaultValue={editing.contact_number ?? ''} />
              </Field>
              <Field label="Role" htmlFor="ed-role" required>
                <Select id="ed-role" name="role" defaultValue={editing.role} required>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Branch" htmlFor="ed-branch">
                <Select id="ed-branch" name="branchId" defaultValue={editing.branch_id ?? ''}>
                  <option value="">All branches (admins only)</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Account status" htmlFor="ed-status">
                <Select id="ed-status" name="status" defaultValue={editing.status}>
                  {['active', 'inactive', 'suspended'].map((value) => (
                    <option key={value} value={value}>{titleCase(value)}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                name="canCreateEmployees"
                defaultChecked={editing.can_create_employees}
              />
              <span>Allow this manager to create employee accounts</span>
            </label>
            <Alert tone="info">
              Suspending an account blocks sign-in immediately. You cannot deactivate your own
              account.
            </Alert>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <div className="row">
              <Button type="submit" loading={action.busy}>Save changes</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {resetting ? (
        <Modal title="Reset authentication" onClose={() => setResetting(null)}>
          <p className="small muted">
            Generate a new temporary password for <strong>{resetting.full_name}</strong> (
            {resetting.email}). The account will be re-activated.
          </p>
          {action.error ? <Alert tone="error">{action.error}</Alert> : null}
          <div className="row">
            <Button onClick={onReset} loading={action.busy} icon={<KeyRound size={15} />}>
              Generate new password
            </Button>
            <Button variant="ghost" onClick={() => setResetting(null)}>Cancel</Button>
          </div>
        </Modal>
      ) : null}

      {activityFor ? (
        <Modal title={`Activity — ${activityFor.full_name}`} onClose={() => setActivityFor(null)} wide>
          {!activity ? (
            <Loading label="Loading activity…" />
          ) : (
            <>
              <dl className="detail-grid" style={{ marginBottom: '1rem' }}>
                <div className="detail">
                  <dt>Last login</dt>
                  <dd>{formatDateTime(activityFor.last_login_at)}</dd>
                </div>
                <div className="detail">
                  <dt>Presence</dt>
                  <dd>
                    {activity.presence && activity.presence.is_online
                      ? 'Online'
                      : 'Offline'}
                  </dd>
                </div>
                <div className="detail">
                  <dt>Last activity</dt>
                  <dd>{formatDateTime(activityFor.last_activity_at)}</dd>
                </div>
                <div className="detail">
                  <dt>Account created</dt>
                  <dd>{formatDateTime(activityFor.created_at)}</dd>
                </div>
              </dl>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Action</th>
                      <th>Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.logs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="muted small">No recorded activity yet.</td>
                      </tr>
                    ) : (
                      activity.logs.map((log) => (
                        <tr key={String(log.id)}>
                          <td className="small nowrap">{formatDateTime(String(log.created_at))}</td>
                          <td className="small">{String(log.action)}</td>
                          <td className="small muted">{String(log.entity_type)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>
                Passwords and tokens are never recorded in the audit trail.
              </p>
            </>
          )}
        </Modal>
      ) : null}
    </>
  )
}
