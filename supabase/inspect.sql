-- =====================================================================
-- inspect.sql : read-only snapshot of the public schema
--
-- Paste into the Supabase SQL editor BEFORE running the migrations, so you
-- know what already exists. It only reads catalog views: nothing is created,
-- altered or deleted.
--
-- Each query returns one result set, so run them one at a time.
-- =====================================================================

-- 1. Tables and whether RLS is enabled
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       pg_size_pretty(pg_total_relation_size(c.oid)) as size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 2. Columns, types, nullability and defaults
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 3. Primary keys, unique and check constraints
select conrelid::regclass as table_name,
       conname as constraint_name,
       contype as kind,  -- p = primary key, u = unique, c = check, f = foreign key
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text, contype, conname;

-- 4. Foreign keys with their referenced table
select conrelid::regclass as table_name,
       conname as foreign_key,
       confrelid::regclass as references_table,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace and contype = 'f'
order by conrelid::regclass::text, conname;

-- 5. Indexes
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 6. RLS policies (this is where "already exists" errors come from)
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual as using_expression,
       with_check as check_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 7. Functions and triggers in the public schema
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

select tgrelid::regclass as table_name, tgname as trigger_name,
       pg_get_triggerdef(oid) as definition
from pg_trigger
where not tgisinternal
  and tgrelid::regclass::text like 'public.%'
order by tgrelid::regclass::text, tgname;

-- 8. Sequences owned by the schema
select sequencename, last_value, start_value, increment_by
from pg_sequences
where schemaname = 'public'
order by sequencename;

-- 9. Row counts (cheap estimate; exact counts on big tables can be slow)
select relname as table_name, n_live_tup as estimated_rows
from pg_stat_user_tables
order by relname;

-- 10. Tables published to Supabase Realtime
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 11. Tables with RLS enabled but no policy (these block every client silently)
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by c.relname;
