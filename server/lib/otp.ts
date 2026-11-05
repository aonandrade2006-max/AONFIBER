import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'

export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function hashOtp(customerId: string, code: string): string {
  return createHmac('sha256', env.otpPepper)
    .update(`${customerId}:${code}`)
    .digest('hex')
}

export function otpMatches(customerId: string, code: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashOtp(customerId, code), 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function maskEmail(email: string | null): string | null {
  if (!email || !email.includes('@')) return null
  const [name, domain] = email.split('@')
  if (name.length <= 2) return `${name[0] ?? '*'}***@${domain}`
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return null
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}
