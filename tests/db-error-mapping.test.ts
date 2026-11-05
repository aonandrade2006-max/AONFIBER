import { describe, expect, it } from 'vitest'
import { describeDatabaseError } from '../server/lib/http'

describe('database error mapping', () => {
  it('reports a duplicate key as a conflict', () => {
    const error = describeDatabaseError({ code: '23505' }, 'fallback')
    expect(error.status).toBe(409)
    expect(error.message).toMatch(/already exists/i)
  })

  it('tells the operator to re-run the migrations when the schema is incomplete', () => {
    for (const code of ['42P01', '42703', '42883']) {
      const error = describeDatabaseError({ code }, 'fallback')
      expect(error.status).toBe(500)
      expect(error.message).toMatch(/supabase\/migrations/)
      expect(error.message).toMatch(/safe to re-run/i)
    }
  })

  it('explains a permission problem instead of hiding it', () => {
    const error = describeDatabaseError({ code: '42501' }, 'fallback')
    expect(error.message).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('reports a missing foreign key target as a bad request', () => {
    const error = describeDatabaseError({ code: '23503' }, 'fallback')
    expect(error.status).toBe(400)
    expect(error.message).toMatch(/branch, plan or staff record/i)
  })

  it('includes the offending column for a not-null violation', () => {
    const error = describeDatabaseError(
      { code: '23502', details: 'Failing row contains (null, ...). Column: contact_number' },
      'fallback',
    )
    expect(error.status).toBe(400)
    expect(error.message).toMatch(/contact_number/)
  })

  it('falls back to the caller message for unknown codes', () => {
    const error = describeDatabaseError({ code: 'XX000', message: 'boom' }, 'We could not save.')
    expect(error.status).toBe(500)
    expect(error.message).toBe('We could not save.')
  })

  it('keeps the database code available for logging', () => {
    const error = describeDatabaseError({ code: '42703' }, 'fallback')
    expect(error.details).toEqual({ code: '42703' })
  })
})
