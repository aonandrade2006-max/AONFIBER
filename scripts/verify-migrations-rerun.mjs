/**
 * Runs every migration in supabase/migrations twice against a real (in-process,
 * WASM) PostgreSQL, to prove that re-running the SQL no longer raises
 *   42P07 relation "..." already exists
 *   42710 policy "..." for table "..." already exists
 *
 * Usage:  npm i --no-save @electric-sql/pglite && node scripts/verify-migrations-rerun.mjs
 *
 * Two scenarios are checked:
 *   1. empty database   - the normal fresh install
 *   2. partial database - `branches` was created by an earlier interrupted run
 *      and already has the policy "branches are publicly readable"
 *
 * The harness stubs the few Supabase-managed objects the migrations touch
 * (auth schema, auth.uid(), anon/authenticated roles, the realtime publication)
 * because PGlite is a bare PostgreSQL. pgcrypto is not shipped with PGlite, so
 * that one line is replaced by core gen_random_uuid(), which is what Supabase
 * provides anyway.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const dir = join(process.cwd(), 'supabase', 'migrations')
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }))
const seed = readFileSync(join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')
const inspectSql = readFileSync(join(process.cwd(), 'supabase', 'inspect.sql'), 'utf8')

const BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create publication supabase_realtime;
`

/** A previous run that stopped after `branches` was created. */
const PARTIAL = `
  create table public.branches (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    is_active boolean not null default true
  );
  alter table public.branches enable row level security;
  create policy "branches are publicly readable"
    on public.branches for select to anon, authenticated
    using (is_active = true);
`

const prepare = (sql) => sql.replace(/create extension if not exists pgcrypto;/i, '')

let failures = 0

async function run(db, label, sql) {
  try {
    await db.exec(sql)
    console.log(`PASS  ${label}`)
    return true
  } catch (error) {
    failures += 1
    console.log(`FAIL  ${label} -> ${`${error.code ?? ''} ${error.message}`.trim()}`)
    return false
  }
}

async function scenario(name, { partial = false, withSeed = false, inspect = false } = {}) {
  console.log(`\n== ${name} ==`)
  const db = new PGlite()
  await db.exec(BOOTSTRAP)

  if (partial) {
    await run(db, 'pre-existing branches table + policy', PARTIAL)
  }

  for (const pass of [1, 2]) {
    for (const file of files) {
      await run(db, `pass ${pass} · ${file.name}`, prepare(file.sql))
    }
  }

  if (withSeed) {
    await run(db, 'pass 1 · seed.sql', seed)
    await run(db, 'pass 2 · seed.sql', seed)
  }

  if (inspect) {
    await run(db, 'supabase/inspect.sql (read-only)', inspectSql)
  }

  const { rows } = await db.query(`
    select
      (select count(*) from pg_tables where schemaname = 'public') as tables,
      (select count(*) from pg_policies where schemaname = 'public') as policies,
      (select count(*) from pg_trigger where not tgisinternal) as triggers,
      (select count(*) from public.branches) as branches,
      (select count(*) from public.internet_plans) as plans,
      (select count(*) from public.branch_coverage) as coverage
  `)
  const r = rows[0]
  console.log(
    `  -> ${r.tables} tables · ${r.policies} policies · ${r.triggers} triggers · ` +
      `${r.branches} branches · ${r.plans} plans · ${r.coverage} coverage rows`,
  )

  // A repaired table has to end up with the same shape as a freshly created one.
  const { rows: cols } = await db.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'branches'
    order by column_name
  `)
  const names = cols.map((c) => c.column_name)
  const expected = [
    'address', 'city', 'contact_number', 'created_at', 'email',
    'id', 'is_active', 'name', 'province', 'updated_at',
  ]
  const missing = expected.filter((c) => !names.includes(c))
  if (missing.length > 0) {
    failures += 1
    console.log(`FAIL  branches is missing columns after migration: ${missing.join(', ')}`)
  } else {
    console.log(`  -> branches repaired: ${names.length} columns`)
  }
  await db.close()
}

await scenario('empty database', { withSeed: true, inspect: true })
await scenario('partially applied database', { partial: true })

if (failures > 0) {
  console.error(`\n${failures} statement group(s) FAILED`)
  process.exit(1)
}
console.log('\nALL MIGRATIONS RAN TWICE WITHOUT ERRORS')
