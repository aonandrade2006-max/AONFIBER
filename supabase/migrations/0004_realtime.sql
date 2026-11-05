-- =====================================================================
-- 0004_realtime.sql : publish live tables to Supabase Realtime
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'employee_presence', 'customers', 'inquiries', 'installations',
    'support_tickets', 'billing_records', 'customer_notifications'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;

-- Presence rows are updated frequently; send full rows to subscribers.
alter table public.employee_presence replica identity full;
alter table public.inquiries replica identity full;
alter table public.support_tickets replica identity full;
