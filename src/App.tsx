import { lazy, type ComponentType } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { PublicLayout } from './components/PublicLayout'
import { OpsLayout } from './components/OpsLayout'
import { PortalLayout } from './components/PortalLayout'
import { RequireCustomer, RequireStaff, StaffRoleGate } from './components/guards'
import { CustomerAuthProvider } from './context/CustomerAuth'
import { StaffAuthProvider } from './context/StaffAuth'

import { HomePage } from './pages/public/Home'
import { PlansPage } from './pages/public/Plans'
import { CoveragePage } from './pages/public/Coverage'
import { AboutPage } from './pages/public/About'
import { BranchesPage } from './pages/public/Branches'
import { ContactPage } from './pages/public/Contact'

import { StaffLoginPage } from './pages/auth/StaffLogin'
import { CustomerLoginPage } from './pages/auth/CustomerLogin'
import { AdminLoginPage } from './pages/auth/AdminLogin'

// Portal pages are only fetched when their route is opened, so visitors do not download the
// admin and employee modules. Each layout provides the Suspense boundary.
const named = (loader: () => Promise<object>, key: string) =>
  lazy(async () => {
    const mod = await loader()
    return { default: (mod as Record<string, unknown>)[key] as ComponentType }
  })

const CustomerDashboardPage = named(() => import('./pages/portal/Dashboard'), 'CustomerDashboardPage')
const CustomerBillingPage = named(() => import('./pages/portal/Billing'), 'CustomerBillingPage')
const CustomerSupportPage = named(() => import('./pages/portal/Support'), 'CustomerSupportPage')
const CustomerNotificationsPage = named(
  () => import('./pages/portal/Notifications'),
  'CustomerNotificationsPage',
)

const StaffDashboardPage = named(() => import('./pages/ops/StaffDashboard'), 'StaffDashboardPage')
const AdminDashboardPage = named(() => import('./pages/ops/AdminDashboard'), 'AdminDashboardPage')
const CustomersPage = named(() => import('./pages/ops/CustomersPage'), 'CustomersPage')
const NewCustomerPage = named(() => import('./pages/ops/NewCustomerPage'), 'NewCustomerPage')
const CustomerDetailPage = named(() => import('./pages/ops/CustomerDetailPage'), 'CustomerDetailPage')
const ReceiptPage = named(() => import('./pages/ops/ReceiptPage'), 'ReceiptPage')
const InquiriesPage = named(() => import('./pages/ops/InquiriesPage'), 'InquiriesPage')
const InstallationsPage = named(() => import('./pages/ops/InstallationsPage'), 'InstallationsPage')
const TicketsPage = named(() => import('./pages/ops/TicketsPage'), 'TicketsPage')
const ChangeRequestsPage = named(() => import('./pages/ops/ChangeRequestsPage'), 'ChangeRequestsPage')
const MonitoringPage = named(() => import('./pages/ops/MonitoringPage'), 'MonitoringPage')
const ReportsPage = named(() => import('./pages/ops/ReportsPage'), 'ReportsPage')
const EmployeesPage = named(() => import('./pages/ops/EmployeesPage'), 'EmployeesPage')
const PlansAdminPage = named(() => import('./pages/ops/PlansAdminPage'), 'PlansAdminPage')
const BranchesAdminPage = named(() => import('./pages/ops/BranchesAdminPage'), 'BranchesAdminPage')
const CoverageAdminPage = named(() => import('./pages/ops/CoverageAdminPage'), 'CoverageAdminPage')
const BillingAdminPage = named(() => import('./pages/ops/BillingAdminPage'), 'BillingAdminPage')
const AuditPage = named(() => import('./pages/ops/AuditPage'), 'AuditPage')

function NotFoundPage() {
  return (
    <div className="container section center">
      <span className="eyebrow">404</span>
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist or has moved.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link className="btn btn-primary" to="/">
          Back to the homepage
        </Link>
        <Link className="btn btn-ghost" to="/contact">
          Contact us
        </Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <StaffAuthProvider>
      <CustomerAuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/coverage" element={<CoveragePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/branches" element={<BranchesPage />} />
            <Route path="/contact" element={<ContactPage />} />
          </Route>

  <Route path="/staff/login" element={<StaffLoginPage />} />
  <Route path="/portal/login" element={<CustomerLoginPage />} />
  <Route path="/admin/login" element={<AdminLoginPage />} />

          <Route element={<RequireStaff />}>
            <Route element={<OpsLayout />}>
              <Route path="/staff" element={<StaffDashboardPage />} />
              <Route path="/staff/customers" element={<CustomersPage />} />
              <Route path="/staff/customers/new" element={<NewCustomerPage />} />
              <Route path="/staff/customers/:customerId" element={<CustomerDetailPage />} />
              <Route path="/staff/customers/:customerId/receipt" element={<ReceiptPage />} />
              <Route path="/staff/inquiries" element={<InquiriesPage />} />
              <Route path="/staff/installations" element={<InstallationsPage />} />
              <Route path="/staff/tickets" element={<TicketsPage />} />
              <Route path="/staff/change-requests" element={<ChangeRequestsPage />} />
              <Route
                path="/staff/monitoring"
                element={
                  <StaffRoleGate roles={['admin', 'branch_manager']}>
                    <MonitoringPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/staff/branch"
                element={
                  <StaffRoleGate roles={['admin', 'branch_manager']}>
                    <ReportsPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/staff/team"
                element={
                  <StaffRoleGate roles={['admin', 'branch_manager']}>
                    <EmployeesPage />
                  </StaffRoleGate>
                }
              />

              <Route
                path="/admin"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <AdminDashboardPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/customers"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <CustomersPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/customers/new"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <NewCustomerPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/customers/:customerId"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <CustomerDetailPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/customers/:customerId/receipt"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <ReceiptPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/inquiries"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <InquiriesPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/installations"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <InstallationsPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/tickets"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <TicketsPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/change-requests"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <ChangeRequestsPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/employees"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <EmployeesPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/monitoring"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <MonitoringPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/reports"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <ReportsPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/plans"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <PlansAdminPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/branches"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <BranchesAdminPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/coverage"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <CoverageAdminPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/billing"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <BillingAdminPage />
                  </StaffRoleGate>
                }
              />
              <Route
                path="/admin/audit"
                element={
                  <StaffRoleGate roles={['admin']}>
                    <AuditPage />
                  </StaffRoleGate>
                }
              />
            </Route>
          </Route>

          <Route element={<RequireCustomer />}>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<CustomerDashboardPage />} />
              <Route path="billing" element={<CustomerBillingPage />} />
              <Route path="support" element={<CustomerSupportPage />} />
              <Route path="notifications" element={<CustomerNotificationsPage />} />
            </Route>
          </Route>

          <Route element={<PublicLayout />}>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </CustomerAuthProvider>
    </StaffAuthProvider>
  )
}
