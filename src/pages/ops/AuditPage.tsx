import { useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import type { AuditLog } from '../../lib/types'
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
  Select,
  StatusBadge,
} from '../../components/ui'

type AuditRow = AuditLog & { branches?: { name: string } | null }

const ENTITY_TYPES = [
  'customers',
  'branches',
  'profiles',
  'internet_plans',
  'branch_coverage',
  'installations',
  'support_tickets',
  'billing_records',
  'account_change_requests',
]

function summarizeDetails(details: Record<string, unknown>): string {
  const keys = Object.keys(details ?? {})
  if (keys.length === 0) return '—'
  const changed = keys.filter((key) => {
    const value = details[key]
    return value && typeof value === 'object' && ('from' in (value as object) || 'to' in (value as object))
  })
  if (changed.length > 0) return `Changed: ${changed.join(', ')}`
  return `Fields: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? '…' : ''}`
}

export function AuditPage() {
  const [term, setTerm] = useState('')
  const [entity, setEntity] = useState('')

  const data = useAsync(async () => {
    let query = supabase
      .from('audit_logs')
      .select('*, branches(name)')
      .order('created_at', { ascending: false })
      .limit(300)

    if (entity) query = query.eq('entity_type', entity)
    if (term.trim()) {
      const safe = term.trim().replace(/[%_]/g, '')
      query = query.or(
        `action.ilike.%${safe}%,actor_name.ilike.%${safe}%,entity_type.ilike.%${safe}%`,
      )
    }

    const { data: rows, error } = await query
    if (error) throw error
    return (rows ?? []) as AuditRow[]
  }, [term, entity])

  const rows = data.data ?? []

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Administrative and operational changes recorded across the system.</p>
        </div>
        <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
          Refresh
        </Button>
      </div>

      <Card style={{ marginBottom: '1.25rem' }}>
        <div className="card-body">
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <Field label="Search" htmlFor="audit-search">
              <Input
                id="audit-search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Action, employee name or entity"
              />
            </Field>
            <Field label="Entity type" htmlFor="audit-entity">
              <Select id="audit-entity" value={entity} onChange={(event) => setEntity(event.target.value)}>
                <option value="">All entities</option>
                {ENTITY_TYPES.map((value) => (
                  <option key={value} value={value}>{titleCase(value)}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      <Card>
        <CardHeader
          title="Recent activity"
          subtitle={`${rows.length} record(s) · newest 300`}
          actions={<span className="pill"><Search size={13} /> Immutable history</span>}
        />
        <div className="table-wrap" style={{ border: 0 }}>
          {data.loading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <EmptyState title="No audit entries match" hint="Changes made in the portals are recorded here." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Branch</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="small nowrap">{formatDateTime(row.created_at)}</td>
                    <td className="small">
                      <div className="strong">{row.actor_name ?? 'System'}</div>
                      <div className="tiny muted">{row.actor_role ? titleCase(row.actor_role) : '—'}</div>
                    </td>
                    <td className="small"><StatusBadge status={row.action.split('.').pop() ?? row.action} /></td>
                    <td className="small">{titleCase(row.entity_type)}</td>
                    <td className="small">{row.branches?.name ?? '—'}</td>
                    <td className="small muted">{summarizeDetails(row.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <p className="help" style={{ marginTop: 10 }}>
        Audit entries never include passwords, verification codes or authentication tokens.
      </p>
    </>
  )
}
