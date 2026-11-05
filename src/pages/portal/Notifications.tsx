import { useEffect, useState } from 'react'
import { Bell, BellOff, CheckCheck, RefreshCw } from 'lucide-react'
import { useCustomerAuth } from '../../context/CustomerAuth'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useAction, useAsync } from '../../lib/hooks'
import type { CustomerNotification } from '../../lib/types'
import { formatDateTime, titleCase } from '../../lib/format'
import { Alert, Button, Card, EmptyState, Loading, StatusBadge } from '../../components/ui'

export function CustomerNotificationsPage() {
  const { customer } = useCustomerAuth()
  const action = useAction()
  const [externalStatus, setExternalStatus] = useState<'enabled' | 'not_configured' | null>(null)

  const data = useAsync(async () => {
    if (!customer) return [] as CustomerNotification[]
    const { data: rows, error } = await supabase
      .from('customer_notifications')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (rows ?? []) as CustomerNotification[]
  }, [customer?.id])

  useEffect(() => {
    api
      .customerAuthStatus()
      .then((status) => setExternalStatus(status.externalNotifications))
      .catch(() => setExternalStatus(null))
  }, [])

  useEffect(() => {
    if (!customer) return
    const channel = supabase
      .channel(`customer-notifications-${customer.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_notifications',
          filter: `customer_id=eq.${customer.id}`,
        },
        () => data.reload(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id])

  if (!customer) return <Loading label="Loading your account…" />

  const notifications = data.data ?? []
  const unread = notifications.filter((item) => !item.is_read).length

  const markRead = async (id: string) => {
    await action.run(
      async () => {
        const { error } = await supabase
          .from('customer_notifications')
          .update({ is_read: true })
          .eq('id', id)
        if (error) throw new Error(error.message)
      },
      { onSuccess: () => data.reload() },
    )
  }

  const markAllRead = async () => {
    await action.run(
      async () => {
        const { error } = await supabase
          .from('customer_notifications')
          .update({ is_read: true })
          .eq('customer_id', customer.id)
          .eq('is_read', false)
        if (error) throw new Error(error.message)
      },
      { onSuccess: () => data.reload() },
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p>
            {unread > 0 ? `${unread} unread notification(s).` : 'All notifications are read.'}
          </p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={data.reload} icon={<RefreshCw size={15} />}>
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={markAllRead}
            disabled={unread === 0}
            loading={action.busy}
            icon={<CheckCheck size={15} />}
          >
            Mark all as read
          </Button>
        </div>
      </div>

      {externalStatus === 'not_configured' ? (
        <Alert tone="info">
          <strong>In-app notifications only.</strong> External email and SMS delivery is not
          enabled for this deployment. Every update below is recorded in your portal.
        </Alert>
      ) : null}

      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      {data.error ? <Alert tone="error">{data.error}</Alert> : null}

      <Card>
        {data.loading ? (
          <Loading />
        ) : notifications.length === 0 ? (
          <EmptyState
            title="No notifications yet"
            hint="Installation updates, billing statements and ticket changes appear here."
          />
        ) : (
          <div className="card-body">
            <div className="note-list">
              {notifications.map((item) => (
                <div className={`note ${item.is_read ? '' : 'unread'}`} key={item.id}>
                  <div className="note-title">
                    <span className="row" style={{ gap: 8 }}>
                      {item.is_read ? <BellOff size={15} className="muted" /> : <Bell size={15} color="var(--blue-700)" />}
                      {item.title}
                    </span>
                    <StatusBadge status={titleCase(item.category)} />
                  </div>
                  <div className="small" style={{ color: 'var(--ink-700)' }}>{item.body}</div>
                  <div className="row-between" style={{ marginTop: 8 }}>
                    <span className="tiny muted">{formatDateTime(item.created_at)}</span>
                    {item.is_read ? (
                      <span className="tiny muted">Read</span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => markRead(item.id)}>
                        Mark as read
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
