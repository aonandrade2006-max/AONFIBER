import { Link } from 'react-router-dom'

export function Brand({ to = '/', compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="brand" aria-label="AON FIBER home">
      <img src="/Main logo.png" alt="AON Fiber" style={{ width: compact ? '32px' : 'auto', height: compact ? '32px' : 'auto', maxHeight: compact ? '32px' : '36px', maxWidth: compact ? '32px' : 'auto', display: 'block' }} />
      {compact ? null : (
        <span className="brand-text">
          <small>Speed Without Limits</small>
        </span>
      )}
    </Link>
  )
}
