import { describe, expect, it } from 'vitest'
import { checkCoverage, normalize, placeMatches } from '../src/lib/coverage'
import type { BranchCoverage } from '../src/lib/types'

const row = (overrides: Partial<BranchCoverage> = {}): BranchCoverage => ({
  id: 'row-1',
  branch_id: 'branch-1',
  city: 'Quezon City',
  barangay: 'Diliman',
  area: null,
  is_serviceable: true,
  notes: null,
  ...overrides,
})

describe('normalize', () => {
  it('lowercases, trims and drops city suffixes', () => {
    expect(normalize('  Quezon CITY ')).toBe('quezon')
    expect(normalize('City of Cebu')).toBe('cebu')
  })
})

describe('placeMatches', () => {
  it('matches case-insensitively', () => {
    expect(placeMatches('Quezon City', 'quezon city')).toBe(true)
  })

  it('matches partial barangay names', () => {
    expect(placeMatches('Diliman', 'diliman')).toBe(true)
    expect(placeMatches('Batasan Hills', 'batasan')).toBe(true)
  })

  it('does not match unrelated places', () => {
    expect(placeMatches('Diliman', 'Cebu')).toBe(false)
  })
})

describe('checkCoverage', () => {
  it('reports available when a serviceable record matches', () => {
    const result = checkCoverage([row()], { city: 'Quezon City', barangay: 'Diliman' })
    expect(result.status).toBe('available')
    if (result.status === 'available') {
      expect(result.branchId).toBe('branch-1')
    }
  })

  it('reports unavailable when the configured record is not serviceable', () => {
    const result = checkCoverage([row({ is_serviceable: false })], {
      city: 'Quezon City',
      barangay: 'Diliman',
    })
    expect(result.status).toBe('unavailable')
  })

  it('asks to contact a branch when the barangay is not configured', () => {
    const result = checkCoverage([row()], { city: 'Quezon City', barangay: 'Kamuning' })
    expect(result.status).toBe('contact')
  })

  it('asks to contact a branch when nothing is configured for the city', () => {
    const result = checkCoverage([row()], { city: 'Davao City' })
    expect(result.status).toBe('contact')
    expect(result.matches).toHaveLength(0)
  })

  it('uses the area when one is provided', () => {
    const rows = [
      row({ area: 'Sikatuna Village', is_serviceable: true }),
      row({ id: 'row-2', area: 'UP Village', is_serviceable: false }),
    ]
    const up = checkCoverage(rows, {
      city: 'Quezon City',
      barangay: 'Diliman',
      address: 'UP Village',
    })
    expect(up.status).toBe('unavailable')
  })

  it('prefers the serviceable area when both match broadly', () => {
    const rows = [
      row({ area: 'UP Village', is_serviceable: true }),
      row({ id: 'row-2', area: null, is_serviceable: false }),
    ]
    const result = checkCoverage(rows, {
      city: 'Quezon City',
      barangay: 'Diliman',
      address: 'UP Village',
    })
    expect(result.status).toBe('available')
  })

  it('returns empty when no query is given', () => {
    expect(checkCoverage([row()], {}).status).toBe('empty')
  })
})
