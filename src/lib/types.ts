export type StaffRole = 'admin' | 'branch_manager' | 'employee'
export type StaffStatus = 'active' | 'inactive' | 'suspended'
export type SubscriptionStatus = 'pending' | 'active' | 'suspended' | 'disconnected'
export type InstallationStatus = 'not_scheduled' | 'scheduled' | 'in_progress' | 'completed' | 'failed'
export type InquiryStatus = 'new' | 'assigned' | 'contacted' | 'resolved' | 'closed'
export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed'
export type TicketCategory = 'technical' | 'billing' | 'installation'
export type BillingStatus = 'unpaid' | 'partial' | 'paid' | 'overdue'

export type Branch = {
  id: string
  name: string
  address: string
  city: string
  province: string
  contact_number: string | null
  email: string | null
  is_active: boolean
  created_at: string
}

export type InternetPlan = {
  id: string
  name: string
  speed_mbps: number
  monthly_price: number
  description: string | null
  features: string[]
  is_active: boolean
  sort_order: number
}

export type StaffProfile = {
  id: string
  full_name: string
  email: string
  role: StaffRole
  branch_id: string | null
  status: StaffStatus
  can_create_employees: boolean
  contact_number: string | null
  last_login_at: string | null
  last_activity_at: string | null
  created_at: string
}

export type Customer = {
  id: string
  account_number: string
  full_name: string
  contact_number: string
  email: string | null
  address: string
  city: string | null
  barangay: string | null
  branch_id: string
  plan_id: string | null
  subscription_status: SubscriptionStatus
  monthly_billing: number
  due_date: string | null
  installation_status: InstallationStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export type BranchCoverage = {
  id: string
  branch_id: string
  city: string
  barangay: string
  area: string | null
  is_serviceable: boolean
  notes: string | null
}

export type Inquiry = {
  id: string
  reference_number: string
  full_name: string
  contact_number: string
  email: string | null
  address: string | null
  city: string | null
  barangay: string | null
  branch_id: string | null
  plan_id: string | null
  message: string | null
  type: 'public_inquiry' | 'coverage_request'
  status: InquiryStatus
  assigned_to: string | null
  created_at: string
  resolved_at: string | null
}

export type Installation = {
  id: string
  reference_number: string
  customer_id: string
  branch_id: string
  requested_date: string | null
  scheduled_date: string | null
  status: InstallationStatus | 'cancelled' | 'pending'
  notes: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
}

export type SupportTicket = {
  id: string
  reference_number: string
  customer_id: string
  branch_id: string
  category: TicketCategory
  subject: string
  description: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: TicketStatus
  assigned_to: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export type BillingRecord = {
  id: string
  customer_id: string
  branch_id: string
  billing_period: string
  amount_due: number
  amount_paid: number
  due_date: string
  status: BillingStatus
  statement_issued_at: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
}

export type CustomerNotification = {
  id: string
  customer_id: string
  title: string
  body: string
  category: 'general' | 'installation' | 'billing' | 'support' | 'account'
  is_read: boolean
  created_at: string
}

export type AccountChangeRequest = {
  id: string
  customer_id: string
  branch_id: string
  requested_by: string
  changes: Record<string, string>
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  review_notes: string | null
  reviewed_at: string | null
  created_at: string
  profile?: { full_name: string } | null
}

export type EmployeePresenceRow = {
  profile_id: string
  branch_id: string | null
  is_online: boolean
  last_seen_at: string | null
  last_login_at: string | null
  last_session_at: string | null
}

export type AuditLog = {
  id: string
  actor_id: string | null
  actor_name: string | null
  actor_role: string | null
  action: string
  entity_type: string
  entity_id: string | null
  branch_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export type MonitoringEmployee = {
  profileId: string
  fullName: string
  email: string
  role: StaffRole
  status: StaffStatus
  branchId: string | null
  branchName: string
  branchLocation: string
  online: boolean
  lastLoginAt: string | null
  lastActivityAt: string | null
  lastSeenAt: string | null
}
