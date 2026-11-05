import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { useStaffAuth } from '../../context/StaffAuth'
import type { Branch, Customer, Inquiry, Installation, SupportTicket } from '../../lib/types'
import { addDaysIso, formatDate, todayIso } from '../../lib/format'
import {
  Alert,
  BarChart,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Loading,
  Select,
  StatCard,
} from '../../components/ui'

type BranchStats = {
  branch: Branch
  customers: number
  activeSubs: number
  newInquiries: number
  resolvedInquiries: number
  resolutionRate: number
  pendingInstallations: number
  openTickets: number
  onlineEmployees: number
}

export function ReportsPage() {
  const { profile } = useStaffAuth()
  const isAdmin = profile?.role === 'admin'
  const [from, setFrom] = useState(addDaysIso(-30))
  const [to, setTo] = useState(todayIso())
  const [branchFilter, setBranchFilter] = useState('')

  const data = useAsync(async () => {
    const [branchResult, customerResult, inquiryResult, installationResult, ticketResult, monitoringResult] =
      await Promise.all([
        supabase.from('branches').select('*').order('name'),
        supabase.from('customers').select('id, branch_id, subscription_status'),
        supabase
          .from('inquiries')
          .select('id, branch_id, status, created_at')
          .gte('created_at', `${from}T00:00:00`)
          .lte('created_at', `${to}T23:59:59`),
        supabase.from('installations').select('id, branch_id, status'),
        supabase.from('support_tickets').select('id, branch_id, status'),
        api.monitoring().catch(() => null),
      ])

    if (branchResult.error) throw branchResult.error
    if (inquiryResult.error) throw inquiryResult.error

    return {
      branches: (branchResult.data ?? []) as Branch[],
      customers: (customerResult.data ?? []) as Array<Pick<Customer, 'id' | 'branch_id' | 'subscription_status'>>,
      inquiries: (inquiryResult.data ?? []) as Array<Pick<Inquiry, 'id' | 'branch_id' | 'status' | 'created_at'>>,
      installations: (installationResult.data ?? []) as Array<Pick<Installation, 'id' | 'branch_id' | 'status'>>,
      tickets: (ticketResult.data ?? []) as Array<Pick<SupportTicket, 'id' | 'branch_id' | 'status'>>,
      online: monitoringResult?.employees ?? [],
    }
  }, [from, to])

  const stats: BranchStats[] = (data.data?.branches ?? [])
    .filter((branch) => (branchFilter ? branch.id === branchFilter : true))
    .map((branch) => {
      const customers = (data.data?.customers ?? []).filter((row) => row.branch_id === branch.id)
      const inquiries = (data.data?.inquiries ?? []).filter((row) => row.branch_id === branch.id)
      const resolved = inquiries.filter((row) => row.status === 'resolved' || row.status === 'closed')
      const pendingInstallations = (data.data?.installations ?? []).filter(
        (row) => row.branch_id === branch.id && ['pending', 'scheduled', 'in_progress'].includes(row.status),
      ).length
      const openTickets = (data.data?.tickets ?? []).filter(
        (row) =>
          row.branch_id === branch.id &&
          ['open', 'in_progress', 'waiting_customer'].includes(row.status),
      ).length
      const onlineEmployees = (data.data?.online ?? []).filter(
        (employee) => employee.branchId === branch.id && employee.online,
      ).length

      return {
        branch,
        customers: customers.length,
        activeSubs: customers.filter((row) => row.subscription_status === 'active').length,
        newInquiries: inquiries.length,
        resolvedInquiries: resolved.length,
        resolutionRate: inquiries.length === 0 ? 0 : Math.round((resolved.length / inquiries.length) * 100),
        pendingInstallations,
        openTickets,
        onlineEmployees,
      }
    })

  const totals = stats.reduce(
    (accumulator, row) => ({
      customers: accumulator.customers + row.customers,
      activeSubs: accumulator.activeSubs + row.activeSubs,
      newInquiries: accumulator.newInquiries + row.newInquiries,
      pendingInstallations: accumulator.pendingInstallations + row.pendingInstallations,
      openTickets: accumulator.openTickets + row.openTickets,
      onlineEmployees: accumulator.onlineEmployees + row.onlineEmployees,
    }),
    { customers: 0, activeSubs: 0, newInquiries: 0, pendingInstallations: 0, openTickets: 0, onlineEmployees: 0 },
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'Branch performance' : 'Branch performance report'}</h1>
          <p>Compare branch activity for the selected period and spot where support is needed.</p>
        </div>
        <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
          Refresh
        </Button>
      </div>

      <Card style={{ marginBottom: '1.25rem' }}>
        <div className="card-body">
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <Field label="From" htmlFor="report-from">
              <Input id="report-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To" htmlFor="report-to">
              <Input id="report-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            {isAdmin ? (
              <Field label="Branch" htmlFor="report-branch">
                <Select
                  id="report-branch"
                  value={branchFilter}
                  onChange={(event) => setBranchFilter(event.target.value)}
                >
                  <option value="">All branches</option>
                  {(data.data?.branches ?? []).map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <div className="row" style={{ marginBottom: '1rem' }}>
              <Button
                variant="outline"
                onClick={() => {
                  setFrom(addDaysIso(-7))
                  setTo(todayIso())
                }}
              >
                Last 7 days
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFrom(addDaysIso(-30))
                  setTo(todayIso())
                }}
              >
                Last 30 days
              </Button>
            </div>
          </div>
          <p className="help" style={{ marginBottom: 0 }}>
            Reporting period: {formatDate(from)} – {formatDate(to)}. Inquiry metrics use the
            inquiry creation date; customer and ticket totals are current.
          </p>
        </div>
      </Card>

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      {data.loading ? (
        <Loading label="Building report…" />
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
            <StatCard label="Customers" value={totals.customers} hint={`${totals.activeSubs} active subscriptions`} />
            <StatCard label="New inquiries" value={totals.newInquiries} hint="In selected period" />
            <StatCard label="Pending installations" value={totals.pendingInstallations} />
            <StatCard label="Unresolved tickets" value={totals.openTickets} hint={`${totals.onlineEmployees} employees online`} />
          </div>

          <div className="grid grid-2" style={{ marginBottom: '1.25rem', alignItems: 'start' }}>
            <Card>
              <CardHeader title="New inquiries per branch" subtitle="Selected period" />
              <div className="card-body">
                <BarChart
                  data={stats.map((row) => ({
                    label: row.branch.name.replace('AON FIBER – ', ''),
                    value: row.newInquiries,
                    hint: `${row.resolutionRate}% resolved`,
                  }))}
                  emptyLabel="No inquiries in this period."
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Inquiry resolution rate" subtitle="Resolved or closed ÷ total inquiries" />
              <div className="card-body">
                <BarChart
                  data={stats.map((row) => ({
                    label: row.branch.name.replace('AON FIBER – ', ''),
                    value: row.resolutionRate,
                    hint: `${row.resolvedInquiries} of ${row.newInquiries} inquiries`,
                  }))}
                  emptyLabel="No data in this period."
                />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Branch comparison" subtitle={`${stats.length} branch(es)`} />
            <div className="table-wrap" style={{ border: 0 }}>
              {stats.length === 0 ? (
                <EmptyState title="No branches configured" />
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Branch</th>
                      <th>Customers</th>
                      <th>Active subs</th>
                      <th>New inquiries</th>
                      <th>Resolution rate</th>
                      <th>Pending installs</th>
                      <th>Open tickets</th>
                      <th>Online staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((row) => (
                      <tr key={row.branch.id}>
                        <td>
                          <div className="strong">{row.branch.name}</div>
                          <div className="tiny muted">{row.branch.city}, {row.branch.province}</div>
                        </td>
                        <td>{row.customers}</td>
                        <td>{row.activeSubs}</td>
                        <td>{row.newInquiries}</td>
                        <td>
                          <span className={`badge ${row.resolutionRate >= 60 ? 'badge-green' : row.newInquiries === 0 ? 'badge-gray' : 'badge-amber'}`}>
                            {row.resolutionRate}%
                          </span>
                        </td>
                        <td>{row.pendingInstallations}</td>
                        <td>{row.openTickets}</td>
                        <td>{row.onlineEmployees}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  )
}
