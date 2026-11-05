-- =====================================================================
-- 0006_customer_installation_default.sql
--
-- customers.installation_status had default 'pending', but the check
-- constraint only allows not_scheduled / scheduled / in_progress /
-- completed / failed. Any insert that omitted the column (service-role
-- scripts, data imports, future API routes) failed with:
--   new row for relation "customers" violates check constraint
--   "customers_installation_status_check"
--
-- The application always sends an explicit value, so no existing row is
-- affected; this only corrects the default. 0001_schema.sql has been updated
-- to match for fresh installs.
-- =====================================================================

alter table public.customers
  alter column installation_status set default 'not_scheduled';
