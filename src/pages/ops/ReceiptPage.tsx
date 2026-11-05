import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/hooks'
import { usePortalBase } from '../../lib/portal'
import type { Branch, Customer, Installation, InternetPlan } from '../../lib/types'
import { formatDate } from '../../lib/format'
import { Alert, Button, Card, EmptyState, Loading } from '../../components/ui'

export function ReceiptPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const base = usePortalBase()

  const data = useAsync(async () => {
    if (!customerId) return null
    const { data: customerRow, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .maybeSingle()
    if (error) throw error
    if (!customerRow) return null

    const customer = customerRow as Customer
    const [planResult, branchResult, installationResult, creatorResult] = await Promise.all([
      customer.plan_id
        ? supabase.from('internet_plans').select('*').eq('id', customer.plan_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('branches').select('*').eq('id', customer.branch_id).maybeSingle(),
      supabase
        .from('installations')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase.from('profiles').select('full_name').eq('branch_id', customer.branch_id),
    ])

    return {
      customer,
      plan: (planResult.data as InternetPlan | null) ?? null,
      branch: (branchResult.data as Branch | null) ?? null,
      installation: (installationResult.data as Installation | null) ?? null,
      creatorCount: (creatorResult.data ?? []).length,
    }
  }, [customerId])

  if (data.loading) return <Loading label="Preparing receipt…" />
  if (data.error) return <Alert tone="error">{data.error}</Alert>
  if (!data.data) {
    return (
      <Card>
        <EmptyState title="Receipt not available" hint="The customer account could not be found." />
      </Card>
    )
  }

  const { customer, plan, branch, installation } = data.data

  return (
    <>
      <div className="page-head no-print">
        <div>
          <h1>Account receipt</h1>
          <p>Print or save as PDF and hand it to the customer.</p>
        </div>
        <div className="row">
          <Link className="btn btn-ghost" to={`${base}/customers/${customer.id}`}>
            <ArrowLeft size={15} /> Back to account
          </Link>
          <Button onClick={() => window.print()} icon={<Printer size={15} />}>
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="receipt">
        <div className="receipt-head">
          <img src="/aonfiber-logo.svg" alt="AON FIBER" />
          <div className="receipt-title">
            <strong>CUSTOMER ACCOUNT RECEIPT</strong>
            AON FIBER Telecommunications<br />
            Speed Without Limits
          </div>
        </div>

        <table className="receipt-table">
          <tbody>
            <tr>
              <td>Customer name</td>
              <td><strong>{customer.full_name}</strong></td>
            </tr>
            <tr>
              <td>Account number</td>
              <td><strong>{customer.account_number}</strong></td>
            </tr>
            <tr>
              <td>Registered mobile</td>
              <td>{customer.contact_number}</td>
            </tr>
            <tr>
              <td>Registered email</td>
              <td>{customer.email ?? '—'}</td>
            </tr>
            <tr>
              <td>Service address</td>
              <td>
                {customer.address}
                {customer.barangay ? `, ${customer.barangay}` : ''}
                {customer.city ? `, ${customer.city}` : ''}
              </td>
            </tr>
            <tr>
              <td>Internet plan</td>
              <td>{plan ? `${plan.name} — ${plan.speed_mbps} Mbps` : 'No plan assigned yet'}</td>
            </tr>
            <tr>
              <td>Assigned branch</td>
              <td>{branch?.name ?? '—'}{branch ? ` · ${branch.contact_number ?? ''}` : ''}</td>
            </tr>
            <tr>
              <td>Account creation date</td>
              <td>{formatDate(customer.created_at)}</td>
            </tr>
            <tr>
              <td>Installation request reference</td>
              <td>{installation?.reference_number ?? 'No installation request on file'}</td>
            </tr>
          </tbody>
        </table>

        <div className="receipt-foot">
          <p style={{ margin: '0 0 8px' }}>
            <strong>How to sign in:</strong> Go to the Customer Portal, enter this account number,
            and verify with the one-time code sent to your registered mobile number or email. You do
            not need a password.
          </p>
          <p style={{ margin: 0 }}>
            Keep this receipt for your records. For concerns, visit {branch?.name ?? 'your branch'} or
            call {branch?.contact_number ?? '(02) 8555-0110'}. This receipt does not contain
            passwords, verification codes or other authentication information.
          </p>
        </div>
      </div>

      <div className="receipt-actions">
        <Link className="btn btn-ghost" to={`${base}/customers/${customer.id}`}>
          Back to account
        </Link>
        <Button onClick={() => window.print()} icon={<Printer size={15} />}>
          Print receipt
        </Button>
      </div>
    </>
  )
}
