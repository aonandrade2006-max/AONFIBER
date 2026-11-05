import type { NextFunction, Request, RequestHandler, Response } from 'express'

export class HttpError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

type Handler = (req: Request, res: Response, next: NextFunction) => unknown

export function asyncRoute(handler: Handler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

/**
 * Turns a Supabase/PostgREST failure into an HttpError whose message tells the
 * user what actually went wrong. Without this the client only ever sees a
 * generic "Something went wrong" and the real cause stays buried in the server
 * log.
 */
export type DatabaseError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

const SCHEMA_OUT_OF_DATE =
  'The database is missing part of the AON FIBER schema. Re-run the files in supabase/migrations in order (they are safe to re-run).'

export function describeDatabaseError(
  error: DatabaseError | null | undefined,
  fallback: string,
): HttpError {
  const code = error?.code ?? ''
  switch (code) {
    case '23505':
      return new HttpError(409, 'A record with those details already exists.', { code })
    case '23503':
      return new HttpError(400, 'A related branch, plan or staff record no longer exists.', { code })
    case '23514':
      return new HttpError(
        400,
        `The database rejected one of the values in this request. ${error?.details ?? ''}`.trim(),
        { code },
      )
    case '23502':
      return new HttpError(
        400,
        `A required database column was left empty (${error?.details ?? 'unknown column'}).`,
        { code },
      )
    case '42501':
      return new HttpError(
        500,
        'The API is not allowed to write this table. Check that SUPABASE_SERVICE_ROLE_KEY belongs to the same project and that RLS policies are up to date.',
        { code },
      )
    case '42P01':
    case '42703':
    case '42883':
      return new HttpError(500, SCHEMA_OUT_OF_DATE, { code })
    default:
      return new HttpError(500, fallback, { code: code || undefined })
  }
}

export function requireString(
  value: unknown,
  field: string,
  { min = 1, max = 500 }: { min?: number; max?: number } = {},
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} is required.`)
  }
  const trimmed = value.trim()
  if (trimmed.length < min) {
    throw new HttpError(400, `${field} is required.`)
  }
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} must be ${max} characters or fewer.`)
  }
  return trimmed
}

export function optionalString(
  value: unknown,
  field: string,
  { max = 500 }: { max?: number } = {},
): string | null {
  if (value === undefined || value === null || value === '') return null
  return requireString(value, field, { max })
}

export function requireNumber(
  value: unknown,
  field: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `${field} must be a number.`)
  }
  if (parsed < min || parsed > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max}.`)
  }
  return parsed
}

const PH_PHONE = /^(\+?63|0)9\d{9}$/

export function requirePhone(value: unknown, field = 'Contact number'): string {
  const raw = requireString(value, field, { max: 32 })
  const compact = raw.replace(/[\s-]/g, '')
  if (!PH_PHONE.test(compact)) {
    throw new HttpError(400, `${field} must be a valid PH mobile number (e.g. 09171234567).`)
  }
  return compact
}

export function optionalEmail(value: unknown, field = 'Email'): string | null {
  const raw = optionalString(value, field, { max: 200 })
  if (!raw) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new HttpError(400, `${field} must be a valid email address.`)
  }
  return raw.toLowerCase()
}
