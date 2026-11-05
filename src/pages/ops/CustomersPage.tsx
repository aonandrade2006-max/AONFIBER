import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Search, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import { usePortalBase } from '../../lib/portal'
import { useStaffAuth } from '../../context/StaffAuth'
import type { Branch, Customer } from '../../lib/types'
import { formatDate, titleCase } from '../../lib/format'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Loading,
  Select,
  StatusBadge,
} from '../../components/ui'

export type CustomerRow = Customer & {
  internet_plans?: { name: string; speed_mbps: number } | null
  branches?: { name: string } | null
}

export function CustomersPage() {
  const { profile } = useStaffAuth()
  const isAdmin = profile?.role === 'admin'
  const base = usePortalBase()
  const [term, setTerm] = useState('')
  const [search, setSearch] = useState('')
  const [branchId, setBranchId] = useState('')
  const [status, setStatus] = useState('')

  const branches = useAsync(async () => {
    if (!isAdmin) return [] as Branch[]
    const { data } = await supabase.from('branches').select('*').order('name')
    return (data ?? []) as Branch[]
  }, [isAdmin])

  const data = useAsync(async () => {
    let query = supabase
      .from('customers')
      .select('*, internet_plans(name, speed_mbps), branches(name)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (search.trim()) {
      const safe = search.trim().replace(/[%_]/g, '')
      query = query.or(
        `account_number.ilike.%${safe}%,full_name.ilike.%${safe}%,contact_number.ilike.%${safe}%`,
      )
    }
    if (branchId) query = query.eq('branch_id', branchId)
    if (status) query = query.eq('subscription_status', status)

    const { data: rows, error } = await query
    if (error) throw error
    return (rows ?? []) as CustomerRow[]
  }, [search, branchId, status])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSearch(term)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p>
            {isAdmin
              ? 'Search every AON FIBER customer account.'
              : 'Search customer accounts assigned to your branch.'}
          </p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          <Link className="btn btn-primary" to={`${base}/customers/new`}>
            <UserPlus size={15} /> New customer
          </Link>
        </div>
      </div>

      <Card style={{ marginBottom: '1.25rem' }}>
        <div className="card-body">
          <form onSubmit={onSubmit}>
            <div className="form-grid" style={{ alignItems: 'end' }}>
              <Field label="Search by account number, name or mobile" htmlFor="customer-search">
                <Input
                  id="customer-search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="AON-100001, Ana Villanueva, 09171234567"
                />
              </Field>
              {isAdmin ? (
                <Field label="Branch" htmlFor="customer-branch">
                  <Select
                    id="customer-branch"
                    value={branchId}
                    onChange={(event) => setBranchId(event.target.value)}
                  >
                    <option value="">All branches</option>
                    {(branches.data ?? []).map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="Subscription status" htmlFor="customer-status">
                <Select
                  id="customer-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">All statuses</option>
                  {['active', 'pending', 'suspended', 'disconnected'].map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="row" style={{ marginBottom: '1rem' }}>
                <Button type="submit" icon={<Search size={15} />}>
                  Search
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setTerm('')
                    setSearch('')
                    setBranchId('')
                    setStatus('')
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </form>
        </div>
      </Card>

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      <Card>
        <CardHeader
          title="Accounts"
          subtitle={`${data.data?.length ?? 0} result(s)${search ? ` for “${search}”` : ''}`}
        />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : (data.data ?? []).length === 0 ? (
            <EmptyState
              title="No customer accounts found"
              hint="Try a different account number or name, or create a new account after a branch inquiry."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Installation</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data.data ?? []).map((customer) => (
                  <tr key={customer.id}>
                    <td className="strong nowrap">{customer.account_number}</td>
                    <td>
                      <div className="strong">{customer.full_name}</div>
                      <div className="tiny muted">{customer.contact_number}</div>
                    </td>
                    <td className="small">
                      {customer.internet_plans
                        ? `${customer.internet_plans.name} (${customer.internet_plans.speed_mbps} Mbps)`
                        : '—'}
                    </td>
                    <td className="small">{customer.branches?.name ?? '—'}</td>
                    <td><StatusBadge status={customer.subscription_status} /></td>
                    <td><StatusBadge status={customer.installation_status} /></td>
                    <td className="small nowrap">{formatDate(customer.created_at)}</td>
                    <td className="right">
                      <Link className="btn btn-outline btn-sm" to={`${base}/customers/${customer.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </>
  )
}
