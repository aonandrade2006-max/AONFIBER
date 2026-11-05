import { useState, type FormEvent } from 'react'
import { RefreshCw, Search, UserCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import { useStaffAuth } from '../../context/StaffAuth'
import type { Branch, Inquiry, InquiryStatus } from '../../lib/types'
import { formatDateTime, titleCase } from '../../lib/format'
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

type InquiryRow = Inquiry & {
  branches?: { name: string } | null
  internet_plans?: { name: string } | null
}

const STATUSES: InquiryStatus[] = ['new', 'assigned', 'contacted', 'resolved', 'closed']

export function InquiriesPage() {
  const { profile } = useStaffAuth()
  const isAdmin = profile?.role === 'admin'
  const [term, setTerm] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [branchId, setBranchId] = useState('')
  const [selected, setSelected] = useState<InquiryRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const branches = useAsync(async () => {
    if (!isAdmin) return [] as Branch[]
    const { data } = await supabase.from('branches').select('*').order('name')
    return (data ?? []) as Branch[]
  }, [isAdmin])

  const data = useAsync(async () => {
    let query = supabase
      .from('inquiries')
      .select('*, branches(name), internet_plans(name)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) query = query.eq('status', status)
    if (branchId) query = query.eq('branch_id', branchId)
    if (search.trim()) {
      const safe = search.trim().replace(/[%_]/g, '')
      query = query.or(
        `full_name.ilike.%${safe}%,contact_number.ilike.%${safe}%,reference_number.ilike.%${safe}%`,
      )
    }

    const { data: rows, error: queryError } = await query
    if (queryError) throw queryError

    const { data: staffRows } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .order('full_name')

    return {
      rows: (rows ?? []) as InquiryRow[],
      staff: (staffRows ?? []) as Array<{ id: string; full_name: string; role: string }>,
    }
  }, [status, branchId, search])

  const inquiries = data.data?.rows ?? []
  const staffOptions = data.data?.staff ?? []
  const canAssign = profile?.role === 'admin' || profile?.role === 'branch_manager'

  const updateInquiry = async (
    id: string,
    updates: Record<string, unknown>,
    message: string,
  ) => {
    setBusyId(id)
    setError(null)
    setSuccess(null)
    const { error: updateError } = await supabase.from('inquiries').update(updates).eq('id', id)
    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(message)
      data.reload()
    }
    setBusyId(null)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSearch(term)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Public inquiries</h1>
          <p>
            Prospective customers who submitted the website inquiry form
            {isAdmin ? ' across all branches.' : ' for your branch.'}
          </p>
        </div>
        <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
          Refresh
        </Button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      <Card style={{ marginBottom: '1.25rem' }}>
        <div className="card-body">
          <form onSubmit={onSubmit}>
            <div className="form-grid" style={{ alignItems: 'end' }}>
              <Field label="Search" htmlFor="inq-search">
                <Input
                  id="inq-search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Name, contact number or reference"
                />
              </Field>
              <Field label="Status" htmlFor="inq-status">
                <Select id="inq-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>{titleCase(value)}</option>
                  ))}
                </Select>
              </Field>
              {isAdmin ? (
                <Field label="Branch" htmlFor="inq-branch">
                  <Select id="inq-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                    <option value="">All branches</option>
                    {(branches.data ?? []).map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <div className="row" style={{ marginBottom: '1rem' }}>
                <Button type="submit" icon={<Search size={15} />}>Filter</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setTerm('')
                    setSearch('')
                    setStatus('')
                    setBranchId('')
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title="Inquiry queue" subtitle={`${inquiries.length} result(s)`} />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : inquiries.length === 0 ? (
            <EmptyState title="No inquiries found" hint="New website inquiries arrive here automatically." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Branch</th>
                  <th>Plan</th>
                  <th>Type</th>
                  <th>Received</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inquiry) => (
                  <tr key={inquiry.id}>
                    <td className="strong nowrap">{inquiry.reference_number}</td>
                    <td>
                      <div className="strong">{inquiry.full_name}</div>
                      <div className="tiny muted">{inquiry.contact_number}</div>
                    </td>
                    <td className="small">{inquiry.branches?.name ?? 'Unassigned'}</td>
                    <td className="small">{inquiry.internet_plans?.name ?? '—'}</td>
                    <td className="small">{titleCase(inquiry.type)}</td>
                    <td className="small nowrap">{formatDateTime(inquiry.created_at)}</td>
                    <td>
                      <Select
                        value={inquiry.status}
                        aria-label={`Status for ${inquiry.reference_number}`}
                        onChange={(event) =>
                          updateInquiry(
                            inquiry.id,
                            { status: event.target.value },
                            `Inquiry ${inquiry.reference_number} marked ${titleCase(event.target.value)}.`,
                          )
                        }
                        disabled={
                          busyId === inquiry.id ||
                          (profile?.role === 'employee' &&
                            Boolean(inquiry.assigned_to) &&
                            inquiry.assigned_to !== profile.id)
                        }
                        style={{ minWidth: 130 }}
                      >
                        {STATUSES.map((value) => (
                          <option key={value} value={value}>{titleCase(value)}</option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <div className="actions">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(inquiry)}>
                          View
                        </Button>
                        {profile && inquiry.assigned_to !== profile.id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={busyId === inquiry.id}
                            icon={<UserCheck size={14} />}
                            onClick={() =>
                              updateInquiry(
                                inquiry.id,
                                {
                                  assigned_to: profile.id,
                                  status: inquiry.status === 'new' ? 'assigned' : inquiry.status,
                                },
                                `Inquiry ${inquiry.reference_number} assigned to you.`,
                              )
                            }
                          >
                            Assign to me
                          </Button>
                        ) : null}
                        {canAssign ? (
                          <Select
                            aria-label={`Assign ${inquiry.reference_number}`}
                            value={inquiry.assigned_to ?? ''}
                            style={{ minWidth: 150 }}
                            onChange={(event) => {
                              const value = event.target.value
                              const target = staffOptions.find((member) => member.id === value)
                              void updateInquiry(
                                inquiry.id,
                                {
                                  assigned_to: value || null,
                                  status: value && inquiry.status === 'new' ? 'assigned' : inquiry.status,
                                },
                                value
                                  ? `Inquiry ${inquiry.reference_number} assigned to ${target?.full_name ?? 'employee'}.`
                                  : `Inquiry ${inquiry.reference_number} unassigned.`,
                              )
                            }}
                          >
                            <option value="">Unassigned</option>
                            {staffOptions.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.full_name}
                              </option>
                            ))}
                          </Select>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {selected ? (
        <Modal title={`Inquiry ${selected.reference_number}`} onClose={() => setSelected(null)} wide>
          <dl className="detail-grid">
            <div className="detail"><dt>Name</dt><dd>{selected.full_name}</dd></div>
            <div className="detail"><dt>Contact number</dt><dd>{selected.contact_number}</dd></div>
            <div className="detail"><dt>Email</dt><dd>{selected.email ?? '—'}</dd></div>
            <div className="detail"><dt>Preferred branch</dt><dd>{selected.branches?.name ?? '—'}</dd></div>
            <div className="detail"><dt>Desired plan</dt><dd>{selected.internet_plans?.name ?? '—'}</dd></div>
            <div className="detail"><dt>Type</dt><dd>{titleCase(selected.type)}</dd></div>
            <div className="detail"><dt>Received</dt><dd>{formatDateTime(selected.created_at)}</dd></div>
            <div className="detail"><dt>Status</dt><dd><StatusBadge status={selected.status} /></dd></div>
            <div className="detail" style={{ gridColumn: '1 / -1' }}>
              <dt>Address</dt>
              <dd>
                {selected.address ?? '—'}
                {selected.barangay ? `, ${selected.barangay}` : ''}
                {selected.city ? `, ${selected.city}` : ''}
              </dd>
            </div>
            <div className="detail" style={{ gridColumn: '1 / -1' }}>
              <dt>Inquiry details</dt>
              <dd>{selected.message ?? '—'}</dd>
            </div>
          </dl>
          <div className="row" style={{ marginTop: '1rem' }}>
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null)
                void updateInquiry(
                  selected.id,
                  { status: 'resolved', resolved_at: new Date().toISOString() },
                  `Inquiry ${selected.reference_number} resolved.`,
                )
              }}
            >
              Mark resolved
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
