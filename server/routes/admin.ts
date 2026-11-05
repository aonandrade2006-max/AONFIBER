import { Router } from 'express'
import { getAdminClient } from '../lib/supabase.js'
import {
  asyncRoute,
  HttpError,
  optionalEmail,
  optionalString,
  requireNumber,
  requirePhone,
  requireString,
} from '../lib/http.js'
import { getStaff, requireRole, requireStaff } from '../lib/auth.js'
import { generateTempPassword } from '../lib/passwords.js'

const router = Router()

router.use(requireStaff)
router.use(requireRole('admin'))

const ROLES = ['admin', 'branch_manager', 'employee'] as const
const STATUSES = ['active', 'inactive', 'suspended'] as const

function writeError(error: { code?: string } | null, fallback: string): HttpError {
  if (error?.code === '23505') {
    return new HttpError(409, 'A record with those details already exists.')
  }
  return new HttpError(500, fallback)
}

// ---------------------------------------------------------------------
// Employees
// (creation lives in the staff router so granted branch managers can use it)
// ---------------------------------------------------------------------
router.patch(
  '/employees/:id',
  asyncRoute(async (req, res) => {
    const staff = getStaff(res)
    const admin = getAdminClient()
    const id = requireString(req.params.id, 'Employee', { max: 60 })

    const { data: existing } = await admin.from('profiles').select('*').eq('id', id).maybeSingle()
    if (!existing) throw new HttpError(404, 'Employee not found.')

    const updates: Record<string, unknown> = {}

    if (req.body?.fullName !== undefined) {
      updates.full_name = requireString(req.body.fullName, 'Full name', { min: 2, max: 120 })
    }
    if (req.body?.contactNumber !== undefined) {
      updates.contact_number = req.body.contactNumber ? requirePhone(req.body.contactNumber) : null
    }
    if (req.body?.role !== undefined) {
      const role = requireString(req.body.role, 'Role', { max: 30 })
      const normalizedRole = role.toLowerCase()
      if (!ROLES.includes(normalizedRole as (typeof ROLES)[number])) {
        throw new HttpError(400, 'Invalid role.')
      }
      if (existing.role === 'admin' && normalizedRole !== 'admin') {
        const { count } = await admin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')
          .eq('status', 'active')
        if ((count ?? 0) <= 1) throw new HttpError(400, 'At least one active administrator is required.')
      }
      updates.role = normalizedRole
    }
    if (req.body?.branchId !== undefined) {
      updates.branch_id = req.body.branchId ? requireString(req.body.branchId, 'Branch', { max: 60 }) : null
    }
    if (req.body?.status !== undefined) {
      const status = requireString(req.body.status, 'Status', { max: 20 })
      if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
        throw new HttpError(400, 'Invalid status.')
      }
      if (id === staff.id && status !== 'active') {
        throw new HttpError(400, 'You cannot deactivate your own account.')
      }
      updates.status = status
    }
    if (req.body?.canCreateEmployees !== undefined) {
      updates.can_create_employees = Boolean(req.body.canCreateEmployees)
    }

    if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nothing to update.')

    const nextRole = (updates.role as string | undefined) ?? existing.role
    const nextBranch = (updates.branch_id as string | null | undefined) ?? existing.branch_id
    if (nextRole !== 'admin' && !nextBranch) {
      throw new HttpError(400, 'Branch roles require an assigned branch.')
    }

    const { data: profile, error } = await admin
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      console.error('[admin] employee update failed', error)
      throw new HttpError(500, 'Could not update the employee.')
    }

    if (updates.status !== undefined) {
      await admin.auth.admin.updateUserById(id, {
        ban_duration: updates.status === 'active' ? 'none' : '876000h',
      })
    }

    res.json({ ok: true, employee: profile })
  }),
)

router.post(
  '/employees/:id/reset-password',
  asyncRoute(async (req, res) => {
    const admin = getAdminClient()
    const id = requireString(req.params.id, 'Employee', { max: 60 })
    const { data: profile } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
    if (!profile) throw new HttpError(404, 'Employee not found.')

    const password =
      typeof req.body?.password === 'string' && req.body.password.length > 0
        ? req.body.password
        : generateTempPassword()

    const { error } = await admin.auth.admin.updateUserById(id, { password })
    if (error) {
      console.error('[admin] password reset failed', error)
      throw new HttpError(500, 'Could not reset the password.')
    }

    await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
    await admin.from('profiles').update({ status: 'active' }).eq('id', id)

    res.json({
      ok: true,
      temporaryPassword: password,
      message: 'Password reset. Share it with the employee securely; it is shown only once.',
    })
  }),
)

router.get(
  '/employees/:id/activity',
  asyncRoute(async (req, res) => {
    const admin = getAdminClient()
    const id = requireString(req.params.id, 'Employee', { max: 60 })

    const [{ data: profile }, { data: logs }, { data: presence }] = await Promise.all([
      admin.from('profiles').select('*').eq('id', id).maybeSingle(),
      admin
        .from('audit_logs')
        .select('*')
        .eq('actor_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      admin.from('employee_presence').select('*').eq('profile_id', id).maybeSingle(),
    ])

    if (!profile) throw new HttpError(404, 'Employee not found.')

    res.json({ ok: true, profile, logs: logs ?? [], presence: presence ?? null })
  }),
)

// ---------------------------------------------------------------------
// Internet plans
// ---------------------------------------------------------------------
function planPayload(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>
  const features = Array.isArray(input.features)
    ? input.features.map(String).map((f) => f.trim()).filter(Boolean)
    : typeof input.features === 'string'
      ? input.features.split('\n').map((f) => f.trim()).filter(Boolean)
      : []

  return {
    name: requireString(input.name, 'Plan name', { min: 2, max: 80 }),
    speed_mbps: requireNumber(input.speedMbps, 'Speed', { min: 1, max: 100000 }),
    monthly_price: requireNumber(input.monthlyPrice, 'Monthly price', { min: 0, max: 1_000_000 }),
    description: optionalString(input.description, 'Description', { max: 500 }),
    features,
    is_active: input.isActive === undefined ? true : Boolean(input.isActive),
    sort_order: input.sortOrder === undefined ? 0 : requireNumber(input.sortOrder, 'Sort order', { min: 0, max: 1000 }),
  }
}

router.post(
  '/plans',
  asyncRoute(async (req, res) => {
    const { data, error } = await getAdminClient().from('internet_plans').insert(planPayload(req.body)).select('*').single()
    if (error) throw writeError(error, 'Could not create the plan.')
    res.status(201).json({ ok: true, plan: data })
  }),
)

router.patch(
  '/plans/:id',
  asyncRoute(async (req, res) => {
    const id = requireString(req.params.id, 'Plan', { max: 60 })
    const payload = planPayload(req.body)
    const { data, error } = await getAdminClient()
      .from('internet_plans')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw writeError(error, 'Could not update the plan.')
    res.json({ ok: true, plan: data })
  }),
)

router.delete(
  '/plans/:id',
  asyncRoute(async (req, res) => {
    const admin = getAdminClient()
    const id = requireString(req.params.id, 'Plan', { max: 60 })

    const { count } = await admin
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', id)

    if ((count ?? 0) > 0) {
      const { error } = await admin.from('internet_plans').update({ is_active: false }).eq('id', id)
      if (error) throw new HttpError(500, 'Could not archive the plan.')
      res.json({
        ok: true,
        archived: true,
        message: `This plan is assigned to ${count} customer(s), so it was archived instead of deleted.`,
      })
      return
    }

    const { error } = await admin.from('internet_plans').delete().eq('id', id)
    if (error) throw new HttpError(500, 'Could not delete the plan.')
    res.json({ ok: true, deleted: true })
  }),
)

// ---------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------
function branchPayload(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>
  return {
    name: requireString(input.name, 'Branch name', { min: 2, max: 120 }),
    address: requireString(input.address, 'Address', { min: 5, max: 250 }),
    city: requireString(input.city, 'City', { min: 2, max: 120 }),
    province: requireString(input.province, 'Province', { min: 2, max: 120 }),
    contact_number: optionalString(input.contactNumber, 'Contact number', { max: 40 }),
    email: optionalEmail(input.email),
    is_active: input.isActive === undefined ? true : Boolean(input.isActive),
  }
}

router.post(
  '/branches',
  asyncRoute(async (req, res) => {
    const { data, error } = await getAdminClient().from('branches').insert(branchPayload(req.body)).select('*').single()
    if (error) throw writeError(error, 'Could not create the branch.')
    res.status(201).json({ ok: true, branch: data })
  }),
)

router.patch(
  '/branches/:id',
  asyncRoute(async (req, res) => {
    const id = requireString(req.params.id, 'Branch', { max: 60 })
    const { data, error } = await getAdminClient()
      .from('branches')
      .update(branchPayload(req.body))
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw writeError(error, 'Could not update the branch.')
    res.json({ ok: true, branch: data })
  }),
)

// ---------------------------------------------------------------------
// Branch coverage
// ---------------------------------------------------------------------
function coveragePayload(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>
  return {
    branch_id: requireString(input.branchId, 'Branch', { max: 60 }),
    city: requireString(input.city, 'City', { min: 2, max: 120 }),
    barangay: requireString(input.barangay, 'Barangay', { min: 2, max: 120 }),
    area: optionalString(input.area, 'Area', { max: 120 }),
    is_serviceable: Boolean(input.isServiceable),
    notes: optionalString(input.notes, 'Notes', { max: 300 }),
  }
}

router.post(
  '/coverage',
  asyncRoute(async (req, res) => {
    const { data, error } = await getAdminClient().from('branch_coverage').insert(coveragePayload(req.body)).select('*').single()
    if (error) throw writeError(error, 'Could not add coverage.')
    res.status(201).json({ ok: true, coverage: data })
  }),
)

router.patch(
  '/coverage/:id',
  asyncRoute(async (req, res) => {
    const id = requireString(req.params.id, 'Coverage', { max: 60 })
    const { data, error } = await getAdminClient()
      .from('branch_coverage')
      .update(coveragePayload(req.body))
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw writeError(error, 'Could not update coverage.')
    res.json({ ok: true, coverage: data })
  }),
)

router.delete(
  '/coverage/:id',
  asyncRoute(async (req, res) => {
    const id = requireString(req.params.id, 'Coverage', { max: 60 })
    const { error } = await getAdminClient().from('branch_coverage').delete().eq('id', id)
    if (error) throw new HttpError(500, 'Could not delete coverage.')
    res.json({ ok: true })
  }),
)

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------
router.patch(
  '/customers/:id',
  asyncRoute(async (req, res) => {
    const admin = getAdminClient()
    const id = requireString(req.params.id, 'Customer', { max: 60 })
    const { data: existing } = await admin
      .from('customers')
      .select('id, plan_id, monthly_billing')
      .eq('id', id)
      .maybeSingle()
    if (!existing) throw new HttpError(404, 'Customer not found.')

    const updates: Record<string, unknown> = {}

    if (req.body?.fullName !== undefined)
      updates.full_name = requireString(req.body.fullName, 'Full name', { min: 2, max: 120 })
    if (req.body?.contactNumber !== undefined)
      updates.contact_number = requirePhone(req.body.contactNumber)
    if (req.body?.email !== undefined) updates.email = optionalEmail(req.body.email)
    if (req.body?.address !== undefined)
      updates.address = requireString(req.body.address, 'Address', { min: 5, max: 300 })
    if (req.body?.city !== undefined) updates.city = optionalString(req.body.city, 'City', { max: 120 })
    if (req.body?.barangay !== undefined) updates.barangay = optionalString(req.body.barangay, 'Barangay', { max: 120 })
    if (req.body?.notes !== undefined) updates.notes = optionalString(req.body.notes, 'Notes', { max: 1000 })
    if (req.body?.dueDate !== undefined)
      updates.due_date = optionalString(req.body.dueDate, 'Due date', { max: 40 })

    if (req.body?.planId !== undefined) {
      const planId = optionalString(req.body.planId, 'Plan', { max: 60 })
      updates.plan_id = planId
      if (planId) {
        const { data: plan } = await admin
          .from('internet_plans')
          .select('id, is_active, monthly_price')
          .eq('id', planId)
          .maybeSingle()
        if (!plan || !plan.is_active) throw new HttpError(400, 'Select an active internet plan.')
        if (req.body?.monthlyBilling === undefined) {
          updates.monthly_billing = Number(plan.monthly_price)
        }
      }
    }

    if (req.body?.monthlyBilling !== undefined) {
      updates.monthly_billing = requireNumber(req.body.monthlyBilling, 'Monthly billing', { min: 0, max: 1_000_000 })
    }
    if (req.body?.subscriptionStatus !== undefined) {
      const status = requireString(req.body.subscriptionStatus, 'Subscription status', { max: 20 })
      if (!['pending', 'active', 'suspended', 'disconnected'].includes(status)) {
        throw new HttpError(400, 'Invalid subscription status.')
      }
      updates.subscription_status = status
    }
    if (req.body?.installationStatus !== undefined) {
      const status = requireString(req.body.installationStatus, 'Installation status', { max: 20 })
      if (!['not_scheduled', 'scheduled', 'in_progress', 'completed', 'failed'].includes(status)) {
        throw new HttpError(400, 'Invalid installation status.')
      }
      updates.installation_status = status
    }

    if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nothing to update.')

    const { data: updatedCustomer, error } = await admin.from('customers').update(updates).eq('id', id).select('*').single()
    if (error) {
      console.error('[admin] customer update failed', error)
      throw new HttpError(500, 'Could not update the customer.')
    }
    res.json({ ok: true, customer: updatedCustomer })
  }),
)

// ---------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------
router.post(
  '/billing',
  asyncRoute(async (req, res) => {
    const admin = getAdminClient()
    const customerId = requireString(req.body?.customerId, 'Customer', { max: 60 })
    const billingPeriod = requireString(req.body?.billingPeriod, 'Billing period', { min: 4, max: 20 })
    const amountDue = requireNumber(req.body?.amountDue, 'Amount due', { min: 0, max: 1_000_000 })
    const dueDate = requireString(req.body?.dueDate, 'Due date', { min: 8, max: 40 })
    const notes = optionalString(req.body?.notes, 'Notes', { max: 500 })

    const { data: customer } = await admin
      .from('customers')
      .select('id, branch_id')
      .eq('id', customerId)
      .maybeSingle()
    if (!customer) throw new HttpError(404, 'Customer not found.')

    const { data, error } = await admin
      .from('billing_records')
      .insert({
        customer_id: customer.id,
        branch_id: customer.branch_id,
        billing_period: billingPeriod,
        amount_due: amountDue,
        due_date: dueDate,
        statement_issued_at: new Date().toISOString(),
        notes,
      })
      .select('*')
      .single()

    if (error) {
      const duplicate = error.code === '23505' || error.message.includes('duplicate')
      throw new HttpError(
        duplicate ? 409 : 500,
        duplicate ? 'A statement already exists for that customer and period.' : 'Could not create the statement.',
      )
    }
    res.status(201).json({ ok: true, billing: data })
  }),
)

router.post(
  '/billing/:id/payments',
  asyncRoute(async (req, res) => {
    const admin = getAdminClient()
    const id = requireString(req.params.id, 'Statement', { max: 60 })
    const amount = requireNumber(req.body?.amount, 'Amount', { min: 0.01, max: 1_000_000 })

    const { data: record } = await admin.from('billing_records').select('*').eq('id', id).maybeSingle()
    if (!record) throw new HttpError(404, 'Billing statement not found.')

    const paid = Number(record.amount_paid) + amount
    if (paid > Number(record.amount_due) + 0.001) {
      throw new HttpError(400, 'The payment exceeds the outstanding balance.')
    }

    const { data, error } = await admin
      .from('billing_records')
      .update({ amount_paid: paid })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw new HttpError(500, 'Could not record the payment.')

    res.json({ ok: true, billing: data })
  }),
)

router.patch(
  '/billing/:id',
  asyncRoute(async (req, res) => {
    const admin = getAdminClient()
    const id = requireString(req.params.id, 'Statement', { max: 60 })
    const { data: record } = await admin.from('billing_records').select('*').eq('id', id).maybeSingle()
    if (!record) throw new HttpError(404, 'Billing statement not found.')

    const updates: Record<string, unknown> = {}
    if (req.body?.dueDate !== undefined)
      updates.due_date = requireString(req.body.dueDate, 'Due date', { min: 8, max: 40 })
    if (req.body?.amountDue !== undefined) {
      const amount = requireNumber(req.body.amountDue, 'Amount due', { min: 0, max: 1_000_000 })
      if (amount < Number(record.amount_paid)) {
        throw new HttpError(400, 'Amount due cannot be lower than the amount already paid.')
      }
      updates.amount_due = amount
    }
    if (req.body?.notes !== undefined) updates.notes = optionalString(req.body.notes, 'Notes', { max: 500 })
    if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nothing to update.')

    const { data, error } = await admin.from('billing_records').update(updates).eq('id', id).select('*').single()
    if (error) throw new HttpError(500, 'Could not update the statement.')
    res.json({ ok: true, billing: data })
  }),
)

router.post(
  '/reminders/run',
  asyncRoute(async (_req, res) => {
    const { data, error } = await getAdminClient().rpc('generate_due_date_reminders')
    if (error) throw new HttpError(500, 'Could not run due date reminders.')
    res.json({ ok: true, created: Number(data ?? 0) })
  }),
)

// ---------------------------------------------------------------------
// Direct customer notifications
// ---------------------------------------------------------------------
router.post(
  '/customers/:id/notifications',
  asyncRoute(async (req, res) => {
    const admin = getAdminClient()
    const id = requireString(req.params.id, 'Customer', { max: 60 })
    const title = requireString(req.body?.title, 'Title', { min: 3, max: 120 })
    const body = requireString(req.body?.body, 'Message', { min: 3, max: 2000 })
    const category = optionalString(req.body?.category, 'Category', { max: 20 }) ?? 'general'
    if (!['general', 'installation', 'billing', 'support', 'account'].includes(category)) {
      throw new HttpError(400, 'Invalid notification category.')
    }

    const { data: customer } = await admin.from('customers').select('id').eq('id', id).maybeSingle()
    if (!customer) throw new HttpError(404, 'Customer not found.')

    const { data, error } = await admin
      .from('customer_notifications')
      .insert({ customer_id: id, title, body, category, is_read: false })
      .select('*')
      .single()
    if (error) throw new HttpError(500, 'Could not send the notification.')
    res.status(201).json({ ok: true, notification: data })
  }),
)

export default router
