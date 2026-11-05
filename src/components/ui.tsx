import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react'
import { titleCase } from '../lib/format'

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */
type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'cyan'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  block?: boolean
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  loading,
  icon,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 size={16} className="spin-icon" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */
export function Field({
  label,
  htmlFor,
  required,
  help,
  children,
  className = '',
}: {
  label?: string
  htmlFor?: string
  required?: boolean
  help?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`field ${className}`}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label} {required ? <span className="req">*</span> : null}
        </label>
      ) : null}
      {children}
      {help ? <span className="help">{help}</span> : null}
    </div>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return <input className={`input ${className}`} {...rest} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props
  return <textarea className={`textarea ${className}`} {...rest} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props
  return (
    <select className={`select ${className}`} {...rest}>
      {children}
    </select>
  )
}

/* ------------------------------------------------------------------ */
/* Layout blocks                                                       */
/* ------------------------------------------------------------------ */
export function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="card-header">
      <div>
        <h3>{title}</h3>
        {subtitle ? <div className="small muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="card-body">{children}</div>
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`modal ${wide ? 'modal-wide' : ''}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */
type AlertTone = 'info' | 'success' | 'error' | 'warn'

export function Alert({ tone = 'info', children }: { tone?: AlertTone; children: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : tone === 'warn' ? AlertCircle : Info
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <div className="strong" style={{ color: 'var(--ink-700)' }}>
        {title}
      </div>
      {hint ? <div className="small" style={{ marginTop: 4 }}>{hint}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Status badges                                                       */
/* ------------------------------------------------------------------ */
const STATUS_TONES: Record<string, string> = {
  active: 'green',
  online: 'green',
  completed: 'green',
  paid: 'green',
  resolved: 'green',
  approved: 'green',
  available: 'green',
  pending: 'amber',
  partial: 'amber',
  unpaid: 'amber',
  scheduled: 'blue',
  in_progress: 'blue',
  assigned: 'blue',
  open: 'amber',
  new: 'cyan',
  contacted: 'blue',
  waiting_customer: 'amber',
  suspended: 'red',
  disconnected: 'red',
  failed: 'red',
  overdue: 'red',
  rejected: 'red',
  urgent: 'red',
  high: 'amber',
  closed: 'gray',
  inactive: 'gray',
  cancelled: 'gray',
  not_scheduled: 'gray',
  low: 'gray',
  normal: 'gray',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONES[status] ?? 'gray'
  return <span className={`badge badge-${tone}`}>{label ?? titleCase(status)}</span>
}

/* ------------------------------------------------------------------ */
/* Stats + charts                                                      */
/* ------------------------------------------------------------------ */
export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="stat-card">
      {icon ? <div className="stat-icon">{icon}</div> : null}
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint ? <div className="stat-hint">{hint}</div> : null}
      </div>
    </div>
  )
}

export type BarDatum = { label: string; value: number; hint?: string }

export function BarChart({ data, emptyLabel = 'No data yet.' }: { data: BarDatum[]; emptyLabel?: string }) {
  const max = Math.max(1, ...data.map((item) => item.value))
  if (data.length === 0) return <EmptyState title={emptyLabel} />
  return (
    <div className="bar-chart">
      {data.map((item) => (
        <div className="bar-row" key={item.label} title={item.hint ?? `${item.label}: ${item.value}`}>
          <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.label}
          </span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.max(2, Math.round((item.value / max) * 100))}%` }}
              aria-hidden="true"
            />
          </div>
          <span className="bar-value">{item.value}</span>
        </div>
      ))}
    </div>
  )
}
