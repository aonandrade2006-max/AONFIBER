import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { getAdminClient } from '../lib/supabase'
import { asyncRoute, HttpError, requireString } from '../lib/http'
import { consume, retryAfterSeconds } from '../lib/rateLimit'
import { generateOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS, otpMatches } from '../lib/otp'
import { deliverExternal, externalDeliveryStatus } from '../lib/externalNotify'
import { env } from '../env'

const router = Router()

const GENERIC_CODE_MESSAGE =
  'If that account number is registered, a verification code has been sent to the registered contact details.'

function normalizeAccount(value: unknown): string {
  return requireString(value, 'Account number', { max: 40 }).toUpperCase()
}

router.get('/status', (_req, res) => {
  res.json({
    externalNotifications: externalDeliveryStatus(),
    devMode: env.otpDevMode,
  })
})

router.post(
  '/request-code',
  asyncRoute(async (req, res) => {
    const accountNumber = normalizeAccount(req.body?.accountNumber)
    const ip = req.ip ?? 'unknown'

    if (!consume(`otp-request-ip:${ip}`, 8, 10 * 60_000)) {
      throw new HttpError(429, 'Too many verification requests. Please wait a few minutes.')
    }
    if (!consume(`otp-request-account:${accountNumber}`, 3, 10 * 60_000)) {
      throw new HttpError(
        429,
        `A code was requested recently. Please wait ${retryAfterSeconds(
          `otp-request-account:${accountNumber}`,
          10 * 60_000,
        )} seconds before requesting another.`,
      )
    }

    const admin = getAdminClient()
    const { data: customer } = await admin
      .from('customers')
      .select('id, email, contact_number, subscription_status')
      .eq('account_number', accountNumber)
      .maybeSingle()

    const usable = Boolean(customer && customer.subscription_status !== 'disconnected')
    const code = generateOtp()

    let delivery: 'email' | 'sms' | 'not_configured' = 'not_configured'
    if (usable && customer) {
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()
      const { error } = await admin.from('customer_otp_codes').insert({
        customer_id: customer.id,
        code_hash: hashOtp(customer.id, code),
        expires_at: expiresAt,
        requested_ip: ip,
      })
      if (error) {
        console.error('[customer-auth] could not store code', error)
        throw new HttpError(500, 'We could not process that request. Please try again.')
      }

      const text = `Your AON FIBER verification code is ${code}. It expires in 10 minutes. Never share this code.`
      if (customer.email && externalDeliveryStatus() === 'enabled') {
        const result = await deliverExternal({
          channel: 'email',
          to: customer.email,
          subject: 'AON FIBER verification code',
          body: text,
        })
        if (result.delivered) delivery = 'email'
      }
      if (delivery === 'not_configured' && externalDeliveryStatus() === 'enabled') {
        const result = await deliverExternal({
          channel: 'sms',
          to: customer.contact_number,
          subject: 'AON FIBER verification code',
          body: text,
        })
        if (result.delivered) delivery = 'sms'
      }
    }

    const payload: Record<string, unknown> = {
      ok: true,
      message: GENERIC_CODE_MESSAGE,
      externalNotifications: externalDeliveryStatus(),
      delivery,
    }

    // Local development convenience: when no email/SMS provider is configured,
    // return the code so the flow can be tested end to end. The code is only
    // valid for real accounts, and the response shape never changes.
    if (env.otpDevMode && !env.isProduction) {
      payload.devCode = code
      payload.devNotice =
        'Development mode: no email/SMS provider is configured, so the code is shown here and in the API console.'
      if (usable) console.log(`[customer-auth] OTP for ${accountNumber}: ${code}`)
    }

    res.json(payload)
  }),
)

router.post(
  '/verify-code',
  asyncRoute(async (req, res) => {
    const accountNumber = normalizeAccount(req.body?.accountNumber)
    const code = requireString(req.body?.code, 'Verification code', { max: 12 }).replace(/\s/g, '')
    const ip = req.ip ?? 'unknown'

    if (!consume(`otp-verify-ip:${ip}`, 12, 10 * 60_000)) {
      throw new HttpError(429, 'Too many verification attempts. Please wait a few minutes.')
    }

    const genericFailure = new HttpError(
      400,
      'That verification code is not valid or has expired. Please request a new code.',
    )

    if (!/^\d{6}$/.test(code)) throw genericFailure

    const admin = getAdminClient()
    const { data: customer } = await admin
      .from('customers')
      .select('id, account_number, full_name, email, auth_user_id, subscription_status')
      .eq('account_number', accountNumber)
      .maybeSingle()

    if (!customer || customer.subscription_status === 'disconnected') throw genericFailure

    const { data: otp } = await admin
      .from('customer_otp_codes')
      .select('id, code_hash, attempts, expires_at, used_at')
      .eq('customer_id', customer.id)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!otp) throw genericFailure
    if (new Date(otp.expires_at).getTime() < Date.now()) throw genericFailure

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await admin
        .from('customer_otp_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', otp.id)
      throw new HttpError(429, 'Too many incorrect codes. Please request a new verification code.')
    }

    if (!otpMatches(customer.id, code, otp.code_hash)) {
      await admin
        .from('customer_otp_codes')
        .update({ attempts: otp.attempts + 1 })
        .eq('id', otp.id)
      throw genericFailure
    }

    await admin
      .from('customer_otp_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', otp.id)

    let authUserId = customer.auth_user_id
    let email: string | null = null

    if (!authUserId) {
      const syntheticEmail = `cust-${customer.account_number.toLowerCase()}@customers.aonfiber.ph`
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: syntheticEmail,
        password: randomBytes(24).toString('base64url'),
        email_confirm: true,
        user_metadata: { customer_id: customer.id, account_number: customer.account_number },
        app_metadata: { role: 'customer' },
      })
      if (createError || !created.user) {
        console.error('[customer-auth] could not provision auth user', createError)
        throw new HttpError(500, 'We could not complete sign in. Please contact your branch.')
      }
      authUserId = created.user.id
      email = created.user.email ?? syntheticEmail
      const { error: linkError } = await admin
        .from('customers')
        .update({ auth_user_id: authUserId })
        .eq('id', customer.id)
      if (linkError) {
        console.error('[customer-auth] could not link auth user', linkError)
        throw new HttpError(500, 'We could not complete sign in. Please contact your branch.')
      }
    } else {
      const { data: userData } = await admin.auth.admin.getUserById(authUserId)
      email = userData.user?.email ?? null
    }

    if (!email) throw new HttpError(500, 'We could not complete sign in. Please contact your branch.')

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (linkError || !link?.properties?.hashed_token) {
      console.error('[customer-auth] generateLink failed', linkError)
      throw new HttpError(500, 'We could not complete sign in. Please try again.')
    }

    res.json({
      ok: true,
      tokenHash: link.properties.hashed_token,
      message: 'Verification successful.',
    })
  }),
)

export default router
