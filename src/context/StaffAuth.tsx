import type { Session } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { audienceForPath, supabase } from '../lib/supabase'
import { api } from '../lib/api'
import type { Branch, StaffProfile } from '../lib/types'

type StaffAuthValue = {
  session: Session | null
  profile: StaffProfile | null
  branch: Branch | null
  loading: boolean
  online: boolean
  /** Set when the presence heartbeat cannot reach the API or the database rejects it. */
  presenceError: string | null
  signIn: (email: string, password: string) => Promise<StaffProfile>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const StaffAuthContext = createContext<StaffAuthValue | null>(null)

const HEARTBEAT_MS = 45_000

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(false)
  const [presenceError, setPresenceError] = useState<string | null>(null)
  const heartbeatRef = useRef<number | null>(null)

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setProfile(null)
      setBranch(null)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeSession.user.id)
      .maybeSingle()

    if (error || !data) {
      setProfile(null)
      setBranch(null)
      return
    }

    const staffProfile = data as StaffProfile
    setProfile(staffProfile)

    if (staffProfile.branch_id) {
      const { data: branchRow } = await supabase
        .from('branches')
        .select('*')
        .eq('id', staffProfile.branch_id)
        .maybeSingle()
      setBranch((branchRow as Branch | null) ?? null)
    } else {
      setBranch(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session ?? null)
      await loadProfile(data.session ?? null)
      if (!cancelled) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      // Session expired, refresh token revoked or signed out elsewhere: stop the
      // heartbeat and tell the API this employee is offline. Scoped to this token.
      if (event === 'SIGNED_OUT') {
        setOnline(false)
        void api.goOffline().catch(() => undefined)
      }
      setTimeout(() => {
        void loadProfile(nextSession)
      }, 0)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [loadProfile])

  // Presence heartbeat only runs for active staff sessions.
  useEffect(() => {
    const clear = () => {
      if (heartbeatRef.current !== null) {
        window.clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }

    clear()

    if (!profile || profile.status !== 'active') {
      setOnline(false)
      return
    }

    let disposed = false
    let first = true
    let retryTimer: number | null = null

    const beat = async () => {
      try {
        const result = await api.heartbeat(first)
        first = false
        if (!disposed) {
          setOnline(Boolean(result.online))
          setPresenceError(null)
        }
      } catch (caught) {
        if (disposed) return
        setOnline(false)
        setPresenceError(
          caught instanceof Error && caught.message
            ? caught.message
            : 'Presence could not be synced. Live Monitoring will show you offline.',
        )
        // Retry well before the next scheduled beat so a transient failure heals.
        if (retryTimer !== null) window.clearTimeout(retryTimer)
        retryTimer = window.setTimeout(() => {
          if (!disposed) void beat()
        }, 15_000)
      }
    }

    void beat()
    heartbeatRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') void beat()
    }, HEARTBEAT_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void beat()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      clear()
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [profile])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (error) {
        const message = error.message.toLowerCase()
        if (message.includes('invalid login')) {
          throw new Error('Incorrect email or password.')
        }
        if (message.includes('email not confirmed')) {
          throw new Error('This account has not been confirmed. Contact an administrator.')
        }
        throw new Error(error.message)
      }

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!profileRow) {
        await supabase.auth.signOut()
        throw new Error('This account does not have staff access.')
      }
      const staffProfile = profileRow as StaffProfile
      if (staffProfile.status !== 'active') {
        await supabase.auth.signOut()
        throw new Error('This staff account is not active. Contact an administrator.')
      }

      // Each portal only accepts its own audience, so an employee can never end up
      // holding an administrator session (and vice versa).
      const audience = audienceForPath(window.location.pathname)
      if (audience === 'admin' && staffProfile.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error(
          'This is the Admin Portal. Employees and branch managers sign in at /staff/login.',
        )
      }
      if (audience === 'staff' && staffProfile.role === 'admin') {
        await supabase.auth.signOut()
        throw new Error(
          'Administrator accounts sign in at the Admin Portal (/admin/login). Your Admin Portal session is not affected.',
        )
      }

      setProfile(staffProfile)
      await loadProfile(data.session)
      return staffProfile
    },
    [loadProfile],
  )

  const signOut = useCallback(async () => {
    try {
      await api.goOffline()
    } catch {
      /* presence is best effort */
    }
    await supabase.auth.signOut()
    setProfile(null)
    setBranch(null)
    setSession(null)
    setOnline(false)
    setPresenceError(null)
  }, [])

  const refresh = useCallback(async () => {
    await loadProfile(session)
  }, [loadProfile, session])

  const value = useMemo(
    () => ({ session, profile, branch, loading, online, presenceError, signIn, signOut, refresh }),
    [session, profile, branch, loading, online, presenceError, signIn, signOut, refresh],
  )

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>
}

export function useStaffAuth(): StaffAuthValue {
  const value = useContext(StaffAuthContext)
  if (!value) throw new Error('useStaffAuth must be used inside StaffAuthProvider')
  return value
}
