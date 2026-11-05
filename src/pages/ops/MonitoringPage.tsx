import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import { useStaffAuth } from '../../context/StaffAuth'
import { ROLE_LABELS } from '../../lib/permissions'
import { formatDateTime, relativeTime } from '../../lib/format'
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
  type BarDatum,
} from '../../components/ui'

export function MonitoringPage() {
  const { profile, online, presenceError } = useStaffAuth()
  const isAdmin = profile?.role === 'admin'
  const [term, setTerm] = useState('')
  const [branchId, setBranchId] = useState('')
  const [onlyOnline, setOnlyOnline] = useState(false)

  const data = useAsync(() => api.monitoring(), [])

  // Refresh when presence rows change, and every 30 seconds regardless.
  useEffect(() => {
    const timer = window.setInterval(() => data.reload(), 30_000)
    const channel = supabase
      .channel('presence-monitor')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employee_presence' },
        () => data.reload(),
      )
      .subscribe()
    return () => {
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const employees = useMemo(() => {
    const rows = data.data?.employees ?? []
    return rows.filter((employee) => {
      if (branchId && employee.branchId !== branchId) return false
      if (onlyOnline && !employee.online) return false
      if (term.trim()) {
        const needle = term.trim().toLowerCase()
        return (
          employee.fullName.toLowerCase().includes(needle) ||
          employee.email.toLowerCase().includes(needle) ||
          employee.branchName.toLowerCase().includes(needle)
        )
      }
      return true
    })
  }, [data.data, branchId, onlyOnline, term])

  const branchRows = data.data?.branches ?? []

  const perBranch: BarDatum[] = branchRows.map((branch) => ({
    label: branch.name.replace('AON FIBER – ', ''),
    value: (data.data?.employees ?? []).filter(
      (employee) => employee.branchId === branch.id && employee.online,
    ).length,
    hint: `${(data.data?.employees ?? []).filter((employee) => employee.branchId === branch.id).length} employee(s)`,
  }))

  const onlineCount = (data.data?.employees ?? []).filter((employee) => employee.online).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'Company-wide monitoring' : 'Branch monitoring'}</h1>
          <p>
            Presence is based on active portal sessions. Employees are marked offline after{' '}
            {Math.round((data.data?.timeoutMs ?? 120000) / 1000)} seconds of inactivity, logout or
            session expiry.
          </p>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Presence rows: {data.data?.presenceRows ?? 0} · server time{' '}
            {formatDateTime(data.data?.serverTime ?? data.data?.generatedAt)}
            {profile && !online && presenceError ? ' · your own heartbeat is failing' : ''}
          </p>
        </div>
        <div className="row">
          <span className="pill">
            <span className="dot dot-online" /> {onlineCount} online
          </span>
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
        </div>
      </div>

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      {data.data && onlineCount === 0 && (data.data.presenceRows ?? 0) === 0 ? (
        <Alert tone="info">
          No heartbeat has been received from any employee yet. Presence is written by the employee
          portal, so an employee becomes online within a few seconds of signing in at{' '}
          <code>/staff/login</code>. If everyone stays offline, check that the API is running and
          that the employee portal browser tab is open.
        </Alert>
      ) : null}

      <Card style={{ marginBottom: '1.25rem' }}>
        <div className="card-body">
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <Field label="Search employees" htmlFor="monitor-search">
              <Input
                id="monitor-search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Name, email or branch"
              />
            </Field>
            {isAdmin ? (
              <Field label="Branch" htmlFor="monitor-branch">
                <Select id="monitor-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                  <option value="">All branches</option>
                  {branchRows.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <label className="checkbox" style={{ marginBottom: '1rem' }}>
              <input
                type="checkbox"
                checked={onlyOnline}
                onChange={(event) => setOnlyOnline(event.target.checked)}
              />
              <span>Show online employees only</span>
            </label>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: '1.25rem' }}>
        <CardHeader title="Online employees per branch" subtitle={`Updated ${relativeTime(data.data?.generatedAt)}`} />
        <div className="card-body">
          <div className="bar-chart">
            {perBranch.map((item) => {
              const max = Math.max(1, ...perBranch.map((row) => row.value))
              return (
                <div className="bar-row" key={item.label} title={item.hint}>
                  <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${item.value === 0 ? 0 : Math.max(6, Math.round((item.value / max) * 100))}%` }}
                    />
                  </div>
                  <span className="bar-value">{item.value}</span>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Employees" subtitle={`${employees.length} shown`} />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading label="Loading presence…" />
          ) : employees.length === 0 ? (
            <EmptyState title="No employees match those filters" />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Last activity</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.profileId}>
                    <td>
                      <div className="strong">{employee.fullName}</div>
                      <div className="tiny muted">{employee.email}</div>
                    </td>
                    <td className="small">{ROLE_LABELS[employee.role] ?? employee.role}</td>
                    <td className="small">
                      <div>{employee.branchName}</div>
                      <div className="tiny muted">{employee.branchLocation}</div>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <span className={`dot ${employee.online ? 'dot-online' : 'dot-offline'}`} />
                        <StatusBadge status={employee.online ? 'online' : 'inactive'} label={employee.online ? 'Online' : 'Offline'} />
                      </span>
                      {employee.status !== 'active' ? (
                        <div style={{ marginTop: 4 }}>
                          <StatusBadge status={employee.status} />
                        </div>
                      ) : null}
                    </td>
                    <td className="small nowrap">{formatDateTime(employee.lastLoginAt)}</td>
                    <td className="small nowrap">{relativeTime(employee.lastActivityAt)}</td>
                    <td className="small nowrap">{employee.lastSeenAt ? relativeTime(employee.lastSeenAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <p className="help" style={{ marginTop: 10 }}>
        <Search size={13} className="inline-icon" /> Passwords and authentication tokens are never
        exposed on this dashboard.
      </p>
    </>
  )
}
