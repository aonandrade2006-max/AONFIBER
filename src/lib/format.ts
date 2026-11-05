const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en-PH')

export function peso(value: number | string | null | undefined): string {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(amount)) return '₱0.00'
  return pesoFormatter.format(amount)
}

export function number(value: number | string | null | undefined): string {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(amount)) return '0'
  return numberFormatter.format(amount)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '—'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Returns the first day of the current month as YYYY-MM-DD plus helpers. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function todayIso(): string {
  return isoDate(new Date())
}

export function addDaysIso(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

export function currentBillingPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}
