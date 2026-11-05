/**
 * Minimal in-memory stand-in for the Supabase service-role client.
 *
 * It implements just the query surface the API uses: select / insert / update /
 * delete, eq filters, order, limit, maybeSingle / single and column projection.
 * Used by the server tests so API routes can be exercised over real HTTP without
 * touching a live Supabase project.
 */

export type Row = Record<string, unknown>

type Filter = { column: string; value: unknown }
type Mode = 'select' | 'insert' | 'update' | 'delete'

let sequence = 0

function nextId() {
  sequence += 1
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

export type FakeError = { code: string; message: string; details?: string | null }

export class FakeSupabase {
  tables: Record<string, Row[]> = {}
  /** Per-table failures used to exercise the API's error handling. */
  failures: Record<string, FakeError> = {}

  constructor(seed: Record<string, Row[]> = {}, failures: Record<string, FakeError> = {}) {
    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((row) => ({ ...row }))
    }
    this.failures = failures
  }

  rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = []
    return this.tables[table]
  }

  from(table: string) {
    return new Query(this, table)
  }

  // The routes never call these in the tested paths, but keeping them makes
  // accidental usage obvious instead of a TypeError.
  auth = {
    getUser: async () => ({ data: { user: null }, error: new Error('not implemented') }),
    admin: {
      createUser: async () => ({ data: { user: null }, error: new Error('not implemented') }),
      deleteUser: async () => ({ data: null, error: null }),
    },
  }
}

export class Query implements PromiseLike<{ data: unknown; error: FakeError | null }> {
  private filters: Filter[] = []
  private orderBy: { column: string; ascending: boolean } | null = null
  private limitCount: number | null = null
  private projected: string[] | null = null
  private inserted: Row[] | null = null
  private updated: Row | null = null
  private upserted: Row[] | null = null
  private conflictColumn: string | null = null
  private deleting = false
  private mode: Mode = 'select'

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(columns?: string) {
    if (this.mode === 'delete' || this.mode === 'update' || this.mode === 'insert') {
      // .select() after a write only chooses what to return.
      this.projected = project(columns)
      return this
    }
    this.mode = 'select'
    this.projected = project(columns)
    return this
  }

  insert(payload: Row | Row[]) {
    this.mode = 'insert'
    this.inserted = Array.isArray(payload) ? payload : [payload]
    return this
  }

  update(payload: Row) {
    this.mode = 'update'
    this.updated = payload
    return this
  }

  upsert(payload: Row | Row[], options: { onConflict?: string } = {}) {
    this.mode = 'insert'
    this.upserted = Array.isArray(payload) ? payload : [payload]
    this.conflictColumn = options.onConflict ?? 'id'
    return this
  }

  delete() {
    this.mode = 'delete'
    this.deleting = true
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value })
    return this
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy = { column, ascending: options.ascending ?? true }
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  maybeSingle() {
    return this.run(true)
  }

  single() {
    return this.run(false)
  }

  then<TResult1 = { data: unknown; error: FakeError | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: FakeError | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run(false).then(onfulfilled, onrejected)
  }

  private matches(row: Row) {
    return this.filters.every(({ column, value }) => row[column] === value)
  }

  private shape(row: Row): Row {
    if (!this.projected) return { ...row }
    const shaped: Row = {}
    for (const column of this.projected) shaped[column] = row[column]
    return shaped
  }

  private async run(maybe: boolean): Promise<{ data: unknown; error: FakeError | null }> {
    const failure = this.db.failures[this.table]
    if (failure) {
      return { data: null, error: failure }
    }

    const rows = this.db.rows(this.table)

    if (this.upserted) {
      const conflict = this.conflictColumn ?? 'id'
      const results: Row[] = []
      for (const row of this.upserted) {
        const existing = rows.find((candidate) => candidate[conflict] === row[conflict])
        if (existing) {
          for (const [key, value] of Object.entries(row)) {
            if (value !== undefined) existing[key] = value
          }
          results.push(existing)
        } else {
          const created: Row = { id: nextId(), created_at: new Date().toISOString(), ...row }
          rows.push(created)
          results.push(created)
        }
      }
      const data = results.map((row) => this.shape(row))
      return { data: maybe ? (data[0] ?? null) : data, error: null }
    }

    if (this.mode === 'insert') {
      const inserted = (this.inserted ?? []).map((row) => {
        const withDefaults: Row = {
          id: nextId(),
          created_at: new Date().toISOString(),
          ...row,
        }
        rows.push(withDefaults)
        return withDefaults
      })
      const data = this.projected ? inserted.map((row) => this.shape(row)) : inserted
      return { data: maybe ? (data[0] ?? null) : data, error: null }
    }

    const matching = rows.filter((row) => this.matches(row))

    if (this.mode === 'update') {
      for (const row of matching) {
        for (const [key, value] of Object.entries(this.updated ?? {})) {
          if (value !== undefined) row[key] = value
        }
      }
      const data = matching.map((row) => this.shape(row))
      return { data: maybe ? (data[0] ?? null) : data, error: null }
    }

    if (this.deleting) {
      const remaining = rows.filter((row) => !this.matches(row))
      const removed = matching
      this.db.tables[this.table] = remaining
      return { data: removed.map((row) => this.shape(row)), error: null }
    }

    let result = [...matching]
    if (this.orderBy) {
      const { column, ascending } = this.orderBy
      result.sort((a, b) => {
        const left = String(a[column] ?? '')
        const right = String(b[column] ?? '')
        return ascending ? left.localeCompare(right) : right.localeCompare(left)
      })
    }
    if (this.limitCount !== null) result = result.slice(0, this.limitCount)

    const data = result.map((row) => this.shape(row))
    return { data: maybe ? (data[0] ?? null) : data, error: null }
  }
}

function project(columns?: string): string[] | null {
  if (!columns || columns.trim() === '*') return null
  return columns
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
}
