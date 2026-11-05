import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { getAdminClient } from '../lib/supabase'
import {
  asyncRoute,
  describeDatabaseError,
  HttpError,
  optionalEmail,
  optionalString,
  requirePhone,
  requireString,
} from '../lib/http'
import { assertBranchScope, getStaff, requireRole, requireStaff } from '../lib/auth'
import { generateTempPassword } from '../lib/passwords'
import { env } from '../env'

const router = Router()

/** Roles an administrator may assign when creating a staff account. */
export const STAFF_ROLE_OPTIONS = ['employee', 'branch_manager', 'admin'] as const

router.use(requireStaff)

const ALLOWED_CHANGE_KEYS = [
  'full_name',
  'contact_number',
  'email',
  'address',
  'city',
  'barangay',
  'notes',
] as const

// ---------------------------------------------------------------------
// Employee accounts.
// Admins can create any role. A branch manager may create employee accounts
// only when an administrator granted the can_create_employees permission, and
// only for their own branch.
// ---------------------------------------------------------------------
router.post(
  '/employees',
  requireRole('admin', 'branch_manager'),
  asyncRoute(async (req, res) => {
    const staff = getStaff(res)
    const admin = getAdminClient()

    const fullName = requireString(req.body?.fullName, 'Full name', { min: 2, max: 120 })
    const email = requireString(req.body?.email, 'Email', { max: 200 }).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Enter a valid email address.')
    }

    const requestedRole = requireString(req.body?.role, 'Role', { max: 30 })
    const normalizedRole = requestedRole.toLowerCase()
    if (!(STAFF_ROLE_OPTIONS as readonly string[]).includes(normalizedRole)) {
      throw new HttpError(400, 'Select a valid role.')
    }
    const role = normalizedRole

    let branchId = optionalString(req.body?.branchId, 'Branch', { max: 60 })

    if (staff.role === 'branch_manager') {
      if (!staff.canCreateEmployees) {
        throw new HttpError(
          403,
          'An administrator must grant you permission to create employee accounts.',
        )
      }
      if (role !== 'employee') {
        throw new HttpError(403, 'Branch managers can only create customer service accounts.')
      }
      if (!staff.branchId) {
        throw new HttpError(400, 'Your account is not assigned to a branch.')
      }
      // Reject a branch outside the manager's scope instead of silently reassigning it.
      assertBranchScope(staff, branchId ?? staff.branchId)
      branchId = staff.branchId
    }

    if (role !== 'admin' && !branchId) {
      throw new HttpError(400, 'Branch managers and employees must be assigned to a branch.')
    }

    if (branchId) {
      const { data: branch } = await admin
        .from('branches')
        .select('id, is_active')
        .eq('id', branchId)
        .maybeSingle()
      if (!branch || !branch.is_active) throw new HttpError(400, 'Select an active branch.')
    }

    const password =
      typeof req.body?.password === 'string' && req.body.password.length > 0
        ? req.body.password
        : generateTempPassword()

    const contactNumber = req.body?.contactNumber ? requirePhone(req.body.contactNumber) : null

    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
      app_metadata: { role },
    })

    if (authError || !authUser.user) {
      const duplicate = authError?.message?.toLowerCase().includes('registered')
      throw new HttpError(
        duplicate ? 409 : 500,
        duplicate
          ? 'An account with that email already exists.'
          : 'Could not create the employee account.',
      )
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .insert({
        id: authUser.user.id,
        full_name: fullName,
        email,
        role,
        branch_id: branchId,
        status: 'active',
        // Only administrators can grant the employee-creation permission.
        can_create_employees:
          staff.role === 'admin' ? Boolean(req.body?.canCreateEmployees) : false,
        contact_number: contactNumber,
      })
      .select('*')
      .single()

    if (profileError) {
      await admin.auth.admin.deleteUser(authUser.user.id)
      console.error('[staff] profile insert failed', profileError)
      throw new HttpError(500, 'Could not create the employee profile.')
    }

    res.status(201).json({
      ok: true,
      employee: profile,
      temporaryPassword: password,
      message:
        'Share these credentials with the employee securely. The password is shown only once.',
    })
  }),
)

// ---------------------------------------------------------------------
// Customer creation (employees / branch managers / admins)
// ---------------------------------------------------------------------
router.post(
  '/customers',
  requireRole('admin', 'branch_manager', 'employee'),
  asyncRoute(async (req, res) => {
    const staff = getStaff(res)
    const admin = getAdminClient()

    const fullName = requireString(req.body?.fullName, 'Full name', { min: 2, max: 120 })
    const contactNumber = requirePhone(req.body?.contactNumber)
    const email = optionalEmail(req.body?.email)
    const address = requireString(req.body?.address, 'Address', { min: 5, max: 300 })
    const city = optionalString(req.body?.city, 'City', { max: 120 })
    const barangay = optionalString(req.body?.barangay, 'Barangay', { max: 120 })
    const planId = optionalString(req.body?.planId, 'Plan', { max: 60 })
    const notes = optionalString(req.body?.notes, 'Notes', { max: 1000 })
    const requestedDate = optionalString(req.body?.installationRequestedDate, 'Installation date', { max: 40 })
    const branchId =
      staff.role === 'admin'
        ? requireString(req.body?.branchId ?? staff.branchId, 'Branch', { max: 60 })
        : staff.branchId

    if (!branchId) throw new HttpError(400, 'Assign this employee to a branch first.')
    assertBranchScope(staff, branchId)

    const { data: branch } = await admin
      .from('branches')
      .select('id, is_active')
      .eq('id', branchId)
      .maybeSingle()
    if (!branch || !branch.is_active) throw new HttpError(400, 'Select an active branch.')

    let monthlyBilling = 0
    if (planId) {
      const { data: plan } = await admin
        .from('internet_plans')
        .select('id, is_active, monthly_price')
        .eq('id', planId)
        .maybeSingle()
      if (!plan || !plan.is_active) throw new HttpError(400, 'Select an active internet plan.')
      // Employees never set the billing amount; it is derived from the plan.
      monthlyBilling = Number(plan.monthly_price)
    }

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    // One account per mobile number per branch: ask the employee to open the
    // existing account instead of silently creating a duplicate customer.
    const { data: existing, error: lookupError } = await admin
      .from('customers')
      .select('id, account_number, full_name')
      .eq('branch_id', branchId)
      .eq('contact_number', contactNumber)
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      console.error('[staff] customer duplicate lookup failed', lookupError)
      throw describeDatabaseError(
        lookupError,
        'We could not check for an existing customer with that mobile number.',
      )
    }

    if (existing) {
      throw new HttpError(
        409,
        `That mobile number already belongs to ${existing.full_name} (${existing.account_number}) in this branch. Open that account instead of creating a duplicate.`,
      )
    }

    const { data: customer, error } = await admin
      .from('customers')
      .insert({
        full_name: fullName,
        contact_number: contactNumber,
        email,
        address,
        city,
        barangay,
        branch_id: branchId,
        plan_id: planId,
        monthly_billing: monthlyBilling,
        due_date: dueDate.toISOString().slice(0, 10),
        subscription_status: planId ? 'active' : 'pending',
        installation_status: 'not_scheduled',
        created_by: staff.id,
        notes,
      })
      .select('id, account_number, full_name, contact_number, email, address, city, barangay, branch_id, plan_id, monthly_billing, subscription_status, installation_status, created_at')
      .single()

    if (error || !customer) {
      console.error('[staff] customer insert failed', error)
      throw describeDatabaseError(
        error,
        'We could not create the customer account. Check the server log for the database error.',
      )
    }

    // Provision the Supabase Auth identity used by the OTP login flow.
    const syntheticEmail = `cust-${customer.account_number.toLowerCase()}@customers.aonfiber.ph`
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password: randomBytes(24).toString('base64url'),
      email_confirm: true,
      user_metadata: { customer_id: customer.id, account_number: customer.account_number },
      app_metadata: { role: 'customer' },
    })

    if (authError || !authUser.user) {
      await admin.from('customers').delete().eq('id', customer.id)
      console.error('[staff] auth provisioning failed', authError)
      const reason = authError?.message ?? 'unknown error'
      throw new HttpError(
        500,
        `The account was created but portal access could not be provisioned (${reason}). The customer record was rolled back. Check the server log.`,
      )
    }

    const { error: linkError } = await admin
      .from('customers')
      .update({ auth_user_id: authUser.user.id })
      .eq('id', customer.id)
    if (linkError) {
      await admin.auth.admin.deleteUser(authUser.user.id)
      await admin.from('customers').delete().eq('id', customer.id)
      throw new HttpError(500, 'We could not provision portal access for this customer.')
    }

    let installation: { reference_number: string } | null = null
    let installationWarning: string | null = null
    if (req.body?.createInstallation !== false) {
      const { data: createdInstallation, error: installError } = await admin
        .from('installations')
        .insert({
          customer_id: customer.id,
          branch_id: branchId,
          requested_date: requestedDate || null,
          status: 'pending',
          notes: notes,
          created_by: staff.id,
        })
        .select('reference_number')
        .single()
      if (installError) {
        console.error('[staff] installation insert failed', installError)
        // The customer exists, so this is reported instead of failing the request.
        installationWarning = describeDatabaseError(
          installError,
          'The customer account was created, but the installation request failed.',
        ).message
      } else {
        installation = createdInstallation
      }
    }

    res.status(201).json({
      ok: true,
      customer,
      installation,
      installationWarning,
      createdBy: staff.fullName,
    })
  }),
)

// ---------------------------------------------------------------------
// Requests for correcting an existing customer account
// ---------------------------------------------------------------------
router.post(
  '/customers/:customerId/change-requests',
  requireRole('admin', 'branch_manager', 'employee'),
  asyncRoute(async (req, res) => {
    const staff = getStaff(res)
    const admin = getAdminClient()
    const customerId = requireString(req.params.customerId, 'Customer', { max: 60 })
    const reason = requireString(req.body?.reason, 'Reason', { min: 10, max: 1000 })

    const { data: customer } = await admin
      .from('customers')
      .select('id, branch_id, account_number')
      .eq('id', customerId)
      .maybeSingle()
    if (!customer) throw new HttpError(404, 'Customer account not found.')
    assertBranchScope(staff, customer.branch_id)

    const changes: Record<string, string> = {}
    for (const key of ALLOWED_CHANGE_KEYS) {
      const value = req.body?.changes?.[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        changes[key] = value.trim()
      }
    }
    if (Object.keys(changes).length === 0) {
      throw new HttpError(400, 'Enter at least one corrected field.')
    }

    if (changes.contact_number) {
      changes.contact_number = requirePhone(changes.contact_number)
    }

    const { data, error } = await admin
      .from('account_change_requests')
      .insert({
        customer_id: customer.id,
        branch_id: customer.branch_id,
        requested_by: staff.id,
        changes,
        reason,
        status: 'pending',
      })
      .select('id, created_at')
      .single()

    if (error) {
      console.error('[staff] change request failed', error)
      throw new HttpError(500, 'We could not submit the correction request.')
    }

    res.status(201).json({ ok: true, request: data })
  }),
)

// ---------------------------------------------------------------------
// Installation requests
// ---------------------------------------------------------------------
router.post(
  '/customers/:customerId/installations',
  requireRole('admin', 'branch_manager', 'employee'),
  asyncRoute(async (req, res) => {
    const staff = getStaff(res)
    const admin = getAdminClient()
    const customerId = requireString(req.params.customerId, 'Customer', { max: 60 })
    const requestedDate = optionalString(req.body?.requestedDate, 'Requested date', { max: 40 })
    const notes = optionalString(req.body?.notes, 'Notes', { max: 1000 })

    const { data: customer } = await admin
      .from('customers')
      .select('id, branch_id')
      .eq('id', customerId)
      .maybeSingle()
    if (!customer) throw new HttpError(404, 'Customer account not found.')
    assertBranchScope(staff, customer.branch_id)

    const { data, error } = await admin
      .from('installations')
      .insert({
        customer_id: customer.id,
        branch_id: customer.branch_id,
        requested_date: requestedDate || null,
        notes,
        status: 'pending',
        created_by: staff.id,
      })
      .select('id, reference_number, status, requested_date, created_at')
      .single()

    if (error) {
      console.error('[staff] installation request failed', error)
      throw new HttpError(500, 'We could not create the installation request.')
    }

    res.status(201).json({ ok: true, installation: data })
  }),
)

// ---------------------------------------------------------------------
// Support tickets recorded by staff on behalf of a customer
// ---------------------------------------------------------------------
router.post(
  '/customers/:customerId/tickets',
  requireRole('admin', 'branch_manager', 'employee'),
  asyncRoute(async (req, res) => {
    const staff = getStaff(res)
    const admin = getAdminClient()
    const customerId = requireString(req.params.customerId, 'Customer', { max: 60 })
    const category = requireString(req.body?.category, 'Category', { max: 20 })
    if (!['technical', 'billing', 'installation'].includes(category)) {
      throw new HttpError(400, 'Select a valid concern category.')
    }
    const subject = requireString(req.body?.subject, 'Subject', { min: 4, max: 140 })
    const description = requireString(req.body?.description, 'Description', { min: 5, max: 2000 })
    const priority = optionalString(req.body?.priority, 'Priority', { max: 20 }) ?? 'normal'
    if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
      throw new HttpError(400, 'Select a valid priority.')
    }

    const { data: customer } = await admin
      .from('customers')
      .select('id, branch_id')
      .eq('id', customerId)
      .maybeSingle()
    if (!customer) throw new HttpError(404, 'Customer account not found.')
    assertBranchScope(staff, customer.branch_id)

    const { data, error } = await admin
      .from('support_tickets')
      .insert({
        customer_id: customer.id,
        branch_id: customer.branch_id,
        category,
        subject,
        description,
        priority,
        status: 'open',
        assigned_to: staff.id,
      })
      .select('id, reference_number, status, created_at')
      .single()

    if (error) {
      console.error('[staff] ticket creation failed', error)
      throw new HttpError(500, 'We could not record the support ticket.')
    }

    res.status(201).json({ ok: true, ticket: data })
  }),
)

// ---------------------------------------------------------------------
// Change request review (branch managers and admins)
// ---------------------------------------------------------------------
router.patch(
  '/change-requests/:id',
  requireRole('admin', 'branch_manager'),
  asyncRoute(async (req, res) => {
    const staff = getStaff(res)
    const admin = getAdminClient()
    const id = requireString(req.params.id, 'Change request', { max: 60 })
    const status = requireString(req.body?.status, 'Status', { max: 20 })
    if (!['approved', 'rejected'].includes(status)) {
      throw new HttpError(400, 'Invalid review status.')
    }
    const reviewNotes = optionalString(req.body?.reviewNotes, 'Review notes', { max: 1000 })

    const { data: request } = await admin
      .from('account_change_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!request) throw new HttpError(404, 'Change request not found.')
    if (request.status !== 'pending') {
      throw new HttpError(400, 'This request has already been reviewed.')
    }
    assertBranchScope(staff, request.branch_id)

    const { data, error } = await admin
      .from('account_change_requests')
      .update({
        status,
        review_notes: reviewNotes,
        reviewed_by: staff.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('[staff] review failed', error)
      throw new HttpError(500, 'Could not review the change request.')
    }
    res.json({ ok: true, request: data })
  }),
)

// ---------------------------------------------------------------------
// Presence heartbeat
// ---------------------------------------------------------------------
router.post(
  '/presence/heartbeat',
  asyncRoute(async (req, res) => {
    const staff = getStaff(res)
    const admin = getAdminClient()
    const now = new Date().toISOString()
    const isSessionStart = Boolean(req.body?.sessionStart)

    const payload = {
      profile_id: staff.id,
      branch_id: staff.branchId,
      is_online: true,
      last_seen_at: now,
      last_activity_at: now,
      updated_at: now,
      ...(isSessionStart ? { last_login_at: now, session_started_at: now } : {}),
    }

    // Upsert on the profile id: no read-then-write race between two tabs and no
    // silent failure when the presence row was never created by the trigger.
    const { data: presence, error } = await admin
      .from('employee_presence')
      .upsert(payload, { onConflict: 'profile_id' })
      .select('profile_id, is_online, last_seen_at, last_login_at, last_activity_at')
      .single()

    if (error) {
      // Previously this was logged and swallowed, which is exactly how an
      // employee ended up "logged in but offline" on the monitoring page.
      console.error('[presence] heartbeat failed', error)
      throw describeDatabaseError(
        error,
        'Presence could not be saved, so Live Monitoring will show you offline.',
      )
    }

    if (isSessionStart) {
      await admin.from('profiles').update({ last_login_at: now }).eq('id', staff.id)
    }

    res.json({
      ok: true,
      online: true,
      timeoutMs: env.presenceTimeoutMs,
      serverTime: now,
      presence,
    })
  }),
)

router.post(
  '/presence/offline',
  asyncRoute(async (_req, res) => {
    const staff = getStaff(res)
    const now = new Date().toISOString()
    // Scoped to this employee only: signing out never touches a colleague.
    const { error } = await getAdminClient()
      .from('employee_presence')
      .update({ is_online: false, last_seen_at: now, last_activity_at: now, updated_at: now })
      .eq('profile_id', staff.id)

    if (error) {
      console.error('[presence] offline update failed', error)
      throw describeDatabaseError(error, 'Sign-out could not update your presence status.')
    }
    res.json({ ok: true })
  }),
)

// ---------------------------------------------------------------------
// Monitoring (branch managers see their branch, admins see everything)
// ---------------------------------------------------------------------
router.get(
  '/monitoring',
  requireRole('admin', 'branch_manager'),
  asyncRoute(async (_req, res) => {
    const staff = getStaff(res)
    const admin = getAdminClient()

    const [{ data: profiles, error: profileError }, { data: branches }, { data: presence }] =
      await Promise.all([
        admin
          .from('profiles')
          .select('id, full_name, email, role, branch_id, status, last_login_at, last_activity_at, created_at')
          .order('full_name'),
        admin.from('branches').select('id, name, city, province').order('name'),
        admin.from('employee_presence').select('*'),
      ])

    if (profileError) throw new HttpError(500, 'Unable to load employees.')

    const now = Date.now()
    const scoped = (profiles ?? []).filter(
      (profile) => staff.role === 'admin' || profile.branch_id === staff.branchId,
    )

    const rows = scoped.map((profile) => {
      const row = (presence ?? []).find((p) => p.profile_id === profile.id)
      const lastSeen = row?.last_seen_at ? new Date(row.last_seen_at).getTime() : 0
      const online =
        Boolean(row?.is_online) &&
        profile.status === 'active' &&
        now - lastSeen < env.presenceTimeoutMs
      return {
        profileId: profile.id,
        fullName: profile.full_name,
        email: profile.email,
        role: profile.role,
        status: profile.status,
        branchId: profile.branch_id,
        branchName: (branches ?? []).find((b) => b.id === profile.branch_id)?.name ?? '—',
        branchLocation: (() => {
          const branch = (branches ?? []).find((b) => b.id === profile.branch_id)
          return branch ? `${branch.city}, ${branch.province}` : '—'
        })(),
        online,
        lastLoginAt: row?.last_login_at ?? profile.last_login_at ?? null,
        lastActivityAt: row?.last_activity_at ?? profile.last_activity_at ?? null,
        lastSeenAt: row?.last_seen_at ?? null,
      }
    })

    res.json({
      ok: true,
      timeoutMs: env.presenceTimeoutMs,
      generatedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      presenceRows: (presence ?? []).length,
      employees: rows,
      branches: (branches ?? []).filter(
        (branch) => staff.role === 'admin' || branch.id === staff.branchId,
      ),
    })
  }),
)

export default router
