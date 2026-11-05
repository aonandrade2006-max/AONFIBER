import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }))

function lines(sql: string) {
  return sql.split(/\r?\n/)
}

function statementLines(sql: string) {
  return lines(sql).map((line) => line.trim())
}

/**
 * These migrations are run by hand in the Supabase SQL editor as well as by
 * `supabase db push`, so every one of them has to survive being executed again
 * on a database that already contains the objects. These checks pin that down:
 * re-running must never raise 42P07 (duplicate table/index), 42710 (duplicate
 * policy/trigger) or touch existing rows.
 */
describe('sql migrations are safe to re-run', () => {
  it('finds the migration files', () => {
    expect(files.map((file) => file.name)).toEqual([
      '0001_schema.sql',
      '0002_rls.sql',
      '0003_triggers.sql',
      '0004_realtime.sql',
      '0005_audit_actor_scope.sql',
      '0006_customer_installation_default.sql',
    ])
  })

  it('creates tables only when they are missing', () => {
    for (const { name, sql } of files) {
      for (const line of statementLines(sql)) {
        if (/^create table (?!if not exists)/i.test(line)) {
          throw new Error(`${name}: unguarded table creation -> ${line}`)
        }
      }
    }
  })

  it('creates indexes and sequences only when they are missing', () => {
    for (const { name, sql } of files) {
      for (const line of statementLines(sql)) {
        if (/^create (unique )?index (?!if not exists)/i.test(line)) {
          throw new Error(`${name}: unguarded index creation -> ${line}`)
        }
        if (/^create sequence (?!if not exists)/i.test(line)) {
          throw new Error(`${name}: unguarded sequence creation -> ${line}`)
        }
      }
    }
  })

  it('drops each policy before creating it', () => {
    const policyPattern = /^create policy "([^"]+)"$/i
    for (const { name, sql } of files) {
      const rows = statementLines(sql)
      rows.forEach((line, index) => {
        const match = policyPattern.exec(line)
        if (!match) return
        const onLine = rows[index + 1] ?? ''
        const table = /^on (public\.\w+)/i.exec(onLine)?.[1]
        expect(table, `${name}: policy without a table -> ${line}`).toBeTruthy()
        const drop = `drop policy if exists "${match[1]}" on ${table};`.toLowerCase()
        const guarded = rows
          .slice(0, index)
          .some((candidate) => candidate.toLowerCase() === drop)
        expect(guarded, `${name}: policy "${match[1]}" is never dropped before create`).toBe(true)
      })
    }
  })

  it('drops each trigger before creating it', () => {
    const triggerPattern = /^create trigger (\w+) .*? on (public\.\w+)/i
    for (const { name, sql } of files) {
      const rows = statementLines(sql)
      rows.forEach((line, index) => {
        const match = triggerPattern.exec(line)
        if (!match) return
        const drop = `drop trigger if exists ${match[1]} on ${match[2]};`.toLowerCase()
        const guarded = rows
          .slice(0, index)
          .some((candidate) => candidate.toLowerCase() === drop)
        expect(guarded, `${name}: trigger ${match[1]} is never dropped before create`).toBe(true)
      })
    }
  })

  it('drops each trigger created from a loop before re-creating it', () => {
    for (const { name, sql } of files) {
      const rows = statementLines(sql)
      rows.forEach((line, index) => {
        if (!/'create trigger %I_/i.test(line)) return
        const guarded = rows
          .slice(0, index)
          .some((candidate) => /'drop trigger if exists %I_/i.test(candidate))
        expect(guarded, `${name}: loop trigger is never dropped before create`).toBe(true)
      })
    }
  })

  it('adds missing columns instead of recreating tables', () => {
    const schema = files.find((file) => file.name === '0001_schema.sql')!.sql
    const tables = [...schema.matchAll(/^create table if not exists public\.(\w+)/gm)].map(
      (match) => match[1],
    )
    expect(tables.length).toBeGreaterThanOrEqual(14)
    for (const table of tables) {
      expect(schema).toMatch(
        new RegExp(`alter table public\\.${table}\\s+add column if not exists`),
      )
    }
  })

  it('never drops a table or removes rows', () => {
    for (const { name, sql } of files) {
      const body = lines(sql)
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
      expect(body, `${name} drops a table`).not.toMatch(/drop table/i)
      expect(body, `${name} truncates a table`).not.toMatch(/truncate/i)
      expect(body, `${name} deletes rows`).not.toMatch(/delete\s+from/i)
      expect(body, `${name} drops a column`).not.toMatch(/drop column/i)
    }
  })
})
