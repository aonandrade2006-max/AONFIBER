import { env } from '../env'

export type ExternalChannel = 'email' | 'sms'

export type ExternalMessage = {
  channel: ExternalChannel
  to: string
  subject: string
  body: string
}

export function externalNotificationsEnabled(): boolean {
  return env.notifyWebhookUrl.length > 0
}

export function externalDeliveryStatus(): 'enabled' | 'not_configured' {
  return externalNotificationsEnabled() ? 'enabled' : 'not_configured'
}

/**
 * Optional outbound delivery. Anything that speaks HTTP can be wired here
 * (Resend, Semaphore, Twilio, an automation tool, ...) through
 * NOTIFY_WEBHOOK_URL. When unconfigured the app keeps working with in-app
 * notifications only, which the UI states explicitly.
 */
export async function deliverExternal(
  message: ExternalMessage,
): Promise<{ delivered: boolean; reason?: string }> {
  if (!externalNotificationsEnabled()) {
    return { delivered: false, reason: 'not_configured' }
  }
  try {
    const response = await fetch(env.notifyWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.NOTIFY_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.NOTIFY_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(message),
    })
    if (!response.ok) {
      return { delivered: false, reason: `provider_status_${response.status}` }
    }
    return { delivered: true }
  } catch (error) {
    console.error('[notify] external delivery failed', error)
    return { delivered: false, reason: 'provider_error' }
  }
}
