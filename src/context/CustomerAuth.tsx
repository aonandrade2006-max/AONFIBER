import type { Session } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { customerSupabase as supabase } from '../lib/supabase'
import type { Branch, Customer, InternetPlan } from '../lib/types'

type CustomerAuthValue = {
  session: Session | null
  customer: Customer | null
  plan: InternetPlan | null
  branch: Branch | null
  loading: boolean
  profileChecked: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null)

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [plan, setPlan] = useState<InternetPlan | null>(null)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileChecked, setProfileChecked] = useState(false)

  const loadCustomer = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setProfileChecked(true)
      setCustomer(null)
      setPlan(null)
      setBranch(null)
      return
    }

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('auth_user_id', activeSession.user.id)
      .maybeSingle()

    setProfileChecked(true)

    if (error || !data) {
      setCustomer(null)
      setPlan(null)
      setBranch(null)
      return
    }

    const customerRow = data as Customer
    setCustomer(customerRow)

    if (customerRow.plan_id) {
      const { data: planRow } = await supabase
        .from('internet_plans')
        .select('*')
        .eq('id', customerRow.plan_id)
        .maybeSingle()
      setPlan((planRow as InternetPlan | null) ?? null)
    } else {
      setPlan(null)
    }

    const { data: branchRow } = await supabase
      .from('branches')
      .select('*')
      .eq('id', customerRow.branch_id)
      .maybeSingle()
    setBranch((branchRow as Branch | null) ?? null)
  }, [])

  useEffect(() => {
    let cancelled = false

    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session ?? null)
      await loadCustomer(data.session ?? null)
      if (!cancelled) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setTimeout(() => {
        void loadCustomer(nextSession)
      }, 0)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [loadCustomer])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session ?? null)
    await loadCustomer(data.session ?? null)
  }, [loadCustomer])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setCustomer(null)
    setPlan(null)
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({ session, customer, plan, branch, loading, profileChecked, refresh, signOut }),
    [session, customer, plan, branch, loading, profileChecked, refresh, signOut],
  )

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>
}

export function useCustomerAuth(): CustomerAuthValue {
  const value = useContext(CustomerAuthContext)
  if (!value) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider')
  return value
}
