#!/usr/bin/env node
/**
 * Optional demo data: fictional branches staff, customers, installations,
 * bills, tickets and inquiries so every portal has something to show.
 *
 * Run after supabase/seed.sql:
 *   node scripts/seed-demo.mjs
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'AonFiber!Demo2026'

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function findUserByEmail(email) {
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (match) return match
    if (data.users.length < 200) return null
    page += 1
  }
}

async function ensureStaff({ email, fullName, role, branchId, canCreateEmployees = false }) {
  let user = await findUserByEmail(email)
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
      app_metadata: { role },
    })
    if (error) throw error
    user = data.user
  }
  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      full_name: fullName,
      email,
      role,
      branch_id: branchId,
      status: 'active',
      can_create_employees: canCreateEmployees,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
  return user
}

async function ensureCustomer({ fullName, contact, email, address, city, barangay, branchId, planId }) {
  const { data: existing } = await supabase
    .from('customers')
    .select('id, account_number')
    .eq('full_name', fullName)
    .maybeSingle()
  if (existing) return existing

  const { data: plan } = await supabase
    .from('internet_plans')
    .select('id, monthly_price')
    .eq('id', planId)
    .maybeSingle()

  const due = new Date()
  due.setDate(due.getDate() + 30)

  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      full_name: fullName,
      contact_number: contact,
      email,
      address,
      city,
      barangay,
      branch_id: branchId,
      plan_id: planId,
      monthly_billing: Number(plan?.monthly_price ?? 0),
      due_date: due.toISOString().slice(0, 10),
      subscription_status: 'active',
      installation_status: 'completed',
    })
    .select('id, account_number, branch_id')
    .single()
  if (error) throw error

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: `cust-${customer.account_number.toLowerCase()}@customers.aonfiber.ph`,
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
    user_metadata: { customer_id: customer.id, account_number: customer.account_number },
    app_metadata: { role: 'customer' },
  })
  if (authError) throw authError
  await supabase.from('customers').update({ auth_user_id: authUser.user.id }).eq('id', customer.id)
  return customer
}

async function main() {
  const { data: branches, error: branchError } = await supabase.from('branches').select('*')
  if (branchError) throw branchError
  if (!branches?.length) {
    console.error('No branches found. Run supabase/seed.sql first.')
    process.exit(1)
  }
  const { data: plans, error: planError } = await supabase.from('internet_plans').select('*').order('sort_order')
  if (planError) throw planError
  if (!plans?.length) {
    console.error('No internet plans found. Run supabase/seed.sql first.')
    process.exit(1)
  }

  const qc = branches.find((b) => b.city === 'Quezon City') ?? branches[0]
  const cebu = branches.find((b) => b.city === 'Cebu City') ?? branches[branches.length - 1]

  await ensureStaff({
    email: 'manager.qc@aonfiber.example',
    fullName: 'Marisol Reyes',
    role: 'branch_manager',
    branchId: qc.id,
  })
  await ensureStaff({
    email: 'csr.qc@aonfiber.example',
    fullName: 'Paolo Santos',
    role: 'employee',
    branchId: qc.id,
  })
  await ensureStaff({
    email: 'csr.cebu@aonfiber.example',
    fullName: 'Jessa Lim',
    role: 'employee',
    branchId: cebu.id,
  })

  const ana = await ensureCustomer({
    fullName: 'Ana Villanueva',
    contact: '09171234567',
    email: 'ana.villanueva@example.com',
    address: '24 Sikatuna Street',
    city: 'Quezon City',
    barangay: 'Diliman',
    branchId: qc.id,
    planId: plans[1].id,
  })
  const ben = await ensureCustomer({
    fullName: 'Benjie Cruz',
    contact: '09182234567',
    email: 'benjie.cruz@example.com',
    address: '9 Kamuning Road',
    city: 'Quezon City',
    barangay: 'Kamuning',
    branchId: qc.id,
    planId: plans[0].id,
  })
  const cara = await ensureCustomer({
    fullName: 'Cara Mendoza',
    contact: '09193234567',
    email: 'cara.mendoza@example.com',
    address: '17 Horizon Street',
    city: 'Cebu City',
    barangay: 'Lahug',
    branchId: cebu.id,
    planId: plans[2].id,
  })

  const { data: existingInquiries } = await supabase
    .from('inquiries')
    .select('id')
    .eq('contact_number', '09195551234')
  if (!existingInquiries?.length) {
    await supabase.from('inquiries').insert([
      {
        full_name: 'Diego Ramos',
        contact_number: '09195551234',
        email: 'diego.ramos@example.com',
        address: '3 Sampaguita Lane, Diliman',
        city: 'Quezon City',
        barangay: 'Diliman',
        branch_id: qc.id,
        plan_id: plans[1].id,
        message: 'Interested in a 100 Mbps plan. Is installation free this month?',
      },
      {
        full_name: 'Elena Bautista',
        contact_number: '09195551235',
        email: 'elena.bautista@example.com',
        address: '8 Summit Street',
        city: 'Baguio City',
        barangay: 'Session Road Area',
        branch_id: (branches.find((b) => b.city === 'Baguio City') ?? branches[0]).id,
        plan_id: plans[0].id,
        message: 'Please confirm coverage for my address before I apply.',
      },
    ])
  }

  const { data: existingInstall } = await supabase
    .from('installations')
    .select('id')
    .eq('customer_id', ana.id)
  if (!existingInstall?.length) {
    await supabase.from('installations').insert({
      customer_id: ana.id,
      branch_id: qc.id,
      requested_date: new Date().toISOString().slice(0, 10),
      scheduled_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      status: 'scheduled',
      notes: 'Customer prefers morning schedule.',
    })
  }

  const { data: existingBills } = await supabase
    .from('billing_records')
    .select('id')
    .eq('customer_id', ben.id)
  if (!existingBills?.length) {
    const period = new Date().toISOString().slice(0, 7)
    const due = new Date()
    due.setDate(due.getDate() + 7)
    await supabase.from('billing_records').insert([
      {
        customer_id: ben.id,
        branch_id: qc.id,
        billing_period: period,
        amount_due: Number(plans[0].monthly_price),
        due_date: due.toISOString().slice(0, 10),
        statement_issued_at: new Date().toISOString(),
      },
      {
        customer_id: cara.id,
        branch_id: cebu.id,
        billing_period: period,
        amount_due: Number(plans[2].monthly_price),
        due_date: due.toISOString().slice(0, 10),
        statement_issued_at: new Date().toISOString(),
      },
    ])
  }

  const { data: existingTickets } = await supabase
    .from('support_tickets')
    .select('id')
    .eq('customer_id', ana.id)
  if (!existingTickets?.length) {
    await supabase.from('support_tickets').insert({
      customer_id: ana.id,
      branch_id: qc.id,
      category: 'technical',
      subject: 'Intermittent connection at night',
      description: 'The connection drops for a few minutes around 9 PM since Monday.',
      priority: 'normal',
      status: 'open',
    })
  }

  console.log('\n✓ Demo data ready')
  console.log('─'.repeat(60))
  console.log('Branch manager : manager.qc@aonfiber.example')
  console.log('Employee (QC)  : csr.qc@aonfiber.example')
  console.log('Employee (Cebu): csr.cebu@aonfiber.example')
  console.log(`Password       : ${DEMO_PASSWORD}`)
  console.log('─'.repeat(60))
  console.log('Fictional customer accounts:', [ana, ben, cara].map((c) => c.account_number).join(', '))
  console.log('Sign in as staff at /staff/login and as a customer at /portal/login.\n')
}

main().catch((error) => {
  console.error('Demo seeding failed:', error.message ?? error)
  process.exit(1)
})
