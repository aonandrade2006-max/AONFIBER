import { useLocation } from 'react-router-dom'

/** `/admin` for the administrator portal, otherwise the employee portal base. */
export function portalBase(pathname: string): string {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? '/admin' : '/staff'
}

export function usePortalBase(): string {
  const { pathname } = useLocation()
  return portalBase(pathname)
}
