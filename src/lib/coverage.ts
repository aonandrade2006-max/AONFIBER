import type { BranchCoverage } from './types'

export type CoverageQuery = {
  city?: string
  barangay?: string
  address?: string
}

export type CoverageResult =
  | { status: 'available'; matches: BranchCoverage[]; branchId: string }
  | { status: 'unavailable'; matches: BranchCoverage[]; branchId: string }
  | { status: 'contact'; matches: BranchCoverage[] }
  | { status: 'empty'; matches: [] }

export function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(city of|municipality of)\s+/, '')
    .replace(/\s+(city|municipality)$/, '')
    .trim()
}

/**
 * A configured city/barangay matches when the values are equal or one contains
 * the other. Deliberately strict: a loose match would claim availability the
 * admin has not configured.
 */
export function placeMatches(configured: string, query: string): boolean {
  const a = normalize(configured)
  const b = normalize(query)
  if (!b || !a) return false
  return a === b || a.includes(b) || b.includes(a)
}

export function checkCoverage(rows: BranchCoverage[], query: CoverageQuery): CoverageResult {
  const city = normalize(query.city)
  const barangay = normalize(query.barangay)
  const area = normalize(query.address)

  if (!city && !barangay && !area) return { status: 'empty', matches: [] }

  const cityRows = city
    ? rows.filter((row) => placeMatches(row.city, city))
    : rows

  const barangayRows = barangay
    ? cityRows.filter((row) => placeMatches(row.barangay, barangay))
    : cityRows

  const scopedRows = area
    ? barangayRows.filter((row) => !row.area || placeMatches(row.area, area))
    : barangayRows

  if (scopedRows.length === 0) {
    // Configured data exists for the city but not this barangay: ask the
    // customer to confirm with a branch instead of guessing.
    const nearby = city ? rows.filter((row) => placeMatches(row.city, city)) : []
    return { status: 'contact', matches: nearby.slice(0, 4) }
  }

  const serviceable = scopedRows.filter((row) => row.is_serviceable)
  if (serviceable.length > 0) {
    return {
      status: 'available',
      matches: serviceable,
      branchId: serviceable[0].branch_id,
    }
  }

  return {
    status: 'unavailable',
    matches: scopedRows,
    branchId: scopedRows[0].branch_id,
  }
}

export const COVERAGE_MESSAGES: Record<CoverageResult['status'], string> = {
  available: 'Service available in your area.',
  unavailable: 'Service not yet available.',
  contact: 'Please contact your nearest branch to confirm availability.',
  empty: 'Enter your city, barangay or address to check coverage.',
}
