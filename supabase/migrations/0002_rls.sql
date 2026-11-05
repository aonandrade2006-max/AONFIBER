-- =====================================================================
-- 0002_rls.sql : helper functions, row level security, grants
--
-- Safe to re-run: RLS enabling is idempotent and every policy is dropped
-- before it is created, so a policy can never be duplicated. Policies hold
-- no data, so this never touches rows. Anything you changed in the dashboard
-- for one of these policies will be reset to the definition below.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (security definer so policies never recurse)
-- ---------------------------------------------------------------------
create or replace function public.is_active_staff()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
  );
$$;

create or replace function public.staff_branch_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.branch_id from public.profiles p
  where p.id = auth.uid() and p.status = 'active';
$$;

create or replace function public.staff_role()
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.status = 'active';
$$;

-- Admin can see every branch; employees/managers only their own.
create or replace function public.can_access_branch(target uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (p.role = 'admin' or p.branch_id = target)
  );
$$;

create or replace function public.current_customer_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id from public.customers c where c.auth_user_id = auth.uid();
$$;

create or replace function public.is_branch_manager_for(target uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (p.role = 'admin' or (p.role = 'branch_manager' and p.branch_id = target))
  );
$$;

revoke all on function public.is_active_staff() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.staff_branch_id() from public;
revoke all on function public.staff_role() from public;
revoke all on function public.can_access_branch(uuid) from public;
revoke all on function public.current_customer_id() from public;
revoke all on function public.is_branch_manager_for(uuid) from public;

grant execute on function public.is_active_staff() to authenticated, anon;
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.staff_branch_id() to authenticated;
grant execute on function public.staff_role() to authenticated;
grant execute on function public.can_access_branch(uuid) to authenticated, anon;
grant execute on function public.current_customer_id() to authenticated;
grant execute on function public.is_branch_manager_for(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Enable RLS on everything
-- ---------------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.internet_plans enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.branch_coverage enable row level security;
alter table public.inquiries enable row level security;
alter table public.installations enable row level security;
alter table public.support_tickets enable row level security;
alter table public.billing_records enable row level security;
alter table public.employee_presence enable row level security;
alter table public.audit_logs enable row level security;
alter table public.customer_notifications enable row level security;
alter table public.account_change_requests enable row level security;
alter table public.customer_otp_codes enable row level security;

-- ---------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------
drop policy if exists "branches are publicly readable" on public.branches;
create policy "branches are publicly readable"
  on public.branches for select to anon, authenticated
  using (is_active = true);

drop policy if exists "staff read accessible branches" on public.branches;
create policy "staff read accessible branches"
  on public.branches for select to authenticated
  using (public.can_access_branch(id));

drop policy if exists "admins manage branches" on public.branches;
create policy "admins manage branches"
  on public.branches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Internet plans
-- ---------------------------------------------------------------------
drop policy if exists "active plans are publicly readable" on public.internet_plans;
create policy "active plans are publicly readable"
  on public.internet_plans for select to anon, authenticated
  using (is_active = true);

drop policy if exists "staff read all plans" on public.internet_plans;
create policy "staff read all plans"
  on public.internet_plans for select to authenticated
  using (public.is_active_staff());

drop policy if exists "admins manage plans" on public.internet_plans;
create policy "admins manage plans"
  on public.internet_plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Branch coverage (public read of admin-configured data only)
-- ---------------------------------------------------------------------
drop policy if exists "coverage is publicly readable" on public.branch_coverage;
create policy "coverage is publicly readable"
  on public.branch_coverage for select to anon, authenticated
  using (true);

drop policy if exists "admins manage coverage" on public.branch_coverage;
create policy "admins manage coverage"
  on public.branch_coverage for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------
drop policy if exists "staff read own profile" on public.profiles;
create policy "staff read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "staff read branch profiles" on public.profiles;
create policy "staff read branch profiles"
  on public.profiles for select to authenticated
  using (public.can_access_branch(branch_id));

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
  on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
drop policy if exists "customers read own record" on public.customers;
create policy "customers read own record"
  on public.customers for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "staff read branch customers" on public.customers;
create policy "staff read branch customers"
  on public.customers for select to authenticated
  using (public.can_access_branch(branch_id));

drop policy if exists "admins insert customers" on public.customers;
create policy "admins insert customers"
  on public.customers for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update customers" on public.customers;
create policy "admins update customers"
  on public.customers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete customers" on public.customers;
create policy "admins delete customers"
  on public.customers for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Public inquiries
-- ---------------------------------------------------------------------
drop policy if exists "anyone can submit an inquiry" on public.inquiries;
create policy "anyone can submit an inquiry"
  on public.inquiries for insert to anon, authenticated
  with check (status = 'new' and assigned_to is null and resolved_at is null);

drop policy if exists "staff read branch inquiries" on public.inquiries;
create policy "staff read branch inquiries"
  on public.inquiries for select to authenticated
  using (public.can_access_branch(branch_id));

drop policy if exists "employees update assigned branch inquiries" on public.inquiries;
create policy "employees update assigned branch inquiries"
  on public.inquiries for update to authenticated
  using (
    public.staff_role() = 'employee'
    and branch_id = public.staff_branch_id()
    and (assigned_to = auth.uid() or assigned_to is null)
  )
  with check (
    public.staff_role() = 'employee'
    and branch_id = public.staff_branch_id()
    and (assigned_to = auth.uid() or assigned_to is null)
  );

drop policy if exists "managers update branch inquiries" on public.inquiries;
create policy "managers update branch inquiries"
  on public.inquiries for update to authenticated
  using (public.is_branch_manager_for(branch_id))
  with check (public.is_branch_manager_for(branch_id));

drop policy if exists "admins manage inquiries" on public.inquiries;
create policy "admins manage inquiries"
  on public.inquiries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Installations
-- ---------------------------------------------------------------------
drop policy if exists "customers read own installations" on public.installations;
create policy "customers read own installations"
  on public.installations for select to authenticated
  using (customer_id = public.current_customer_id());

drop policy if exists "staff read branch installations" on public.installations;
create policy "staff read branch installations"
  on public.installations for select to authenticated
  using (public.can_access_branch(branch_id));

drop policy if exists "branches create installations" on public.installations;
create policy "branches create installations"
  on public.installations for insert to authenticated
  with check (public.can_access_branch(branch_id));

drop policy if exists "staff update branch installations" on public.installations;
create policy "staff update branch installations"
  on public.installations for update to authenticated
  using (public.can_access_branch(branch_id))
  with check (public.can_access_branch(branch_id));

drop policy if exists "staff delete branch installations" on public.installations;
create policy "staff delete branch installations"
  on public.installations for delete to authenticated
  using (public.can_access_branch(branch_id));

-- ---------------------------------------------------------------------
-- Support tickets
-- ---------------------------------------------------------------------
drop policy if exists "customers read own tickets" on public.support_tickets;
create policy "customers read own tickets"
  on public.support_tickets for select to authenticated
  using (customer_id = public.current_customer_id());

drop policy if exists "customers create own tickets" on public.support_tickets;
create policy "customers create own tickets"
  on public.support_tickets for insert to authenticated
  with check (
    customer_id = public.current_customer_id()
    and status = 'open'
    and assigned_to is null
    and resolution_notes is null
  );

drop policy if exists "staff read branch tickets" on public.support_tickets;
create policy "staff read branch tickets"
  on public.support_tickets for select to authenticated
  using (public.can_access_branch(branch_id));

drop policy if exists "employees update assigned branch tickets" on public.support_tickets;
create policy "employees update assigned branch tickets"
  on public.support_tickets for update to authenticated
  using (
    public.staff_role() = 'employee'
    and branch_id = public.staff_branch_id()
    and (assigned_to = auth.uid() or assigned_to is null)
  )
  with check (
    public.staff_role() = 'employee'
    and branch_id = public.staff_branch_id()
    and (assigned_to = auth.uid() or assigned_to is null)
  );

drop policy if exists "managers update branch tickets" on public.support_tickets;
create policy "managers update branch tickets"
  on public.support_tickets for update to authenticated
  using (public.is_branch_manager_for(branch_id))
  with check (public.is_branch_manager_for(branch_id));

-- ---------------------------------------------------------------------
-- Billing records
-- ---------------------------------------------------------------------
drop policy if exists "customers read own billing" on public.billing_records;
create policy "customers read own billing"
  on public.billing_records for select to authenticated
  using (customer_id = public.current_customer_id());

drop policy if exists "staff read branch billing" on public.billing_records;
create policy "staff read branch billing"
  on public.billing_records for select to authenticated
  using (public.can_access_branch(branch_id));

drop policy if exists "admins manage billing" on public.billing_records;
create policy "admins manage billing"
  on public.billing_records for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Employee presence
-- ---------------------------------------------------------------------
drop policy if exists "staff read branch presence" on public.employee_presence;
create policy "staff read branch presence"
  on public.employee_presence for select to authenticated
  using (profile_id = auth.uid() or public.can_access_branch(branch_id));

drop policy if exists "staff upsert own presence" on public.employee_presence;
create policy "staff upsert own presence"
  on public.employee_presence for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "staff update own presence" on public.employee_presence;
create policy "staff update own presence"
  on public.employee_presence for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------
drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs"
  on public.audit_logs for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Customer notifications
-- ---------------------------------------------------------------------
drop policy if exists "customers read own notifications" on public.customer_notifications;
create policy "customers read own notifications"
  on public.customer_notifications for select to authenticated
  using (customer_id = public.current_customer_id());

drop policy if exists "customers mark own notifications read" on public.customer_notifications;
create policy "customers mark own notifications read"
  on public.customer_notifications for update to authenticated
  using (customer_id = public.current_customer_id())
  with check (customer_id = public.current_customer_id());

drop policy if exists "admins create notifications" on public.customer_notifications;
create policy "admins create notifications"
  on public.customer_notifications for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Account change requests
-- ---------------------------------------------------------------------
drop policy if exists "staff read branch change requests" on public.account_change_requests;
create policy "staff read branch change requests"
  on public.account_change_requests for select to authenticated
  using (public.can_access_branch(branch_id));

drop policy if exists "staff create change requests" on public.account_change_requests;
create policy "staff create change requests"
  on public.account_change_requests for insert to authenticated
  with check (
    requested_by = auth.uid() and public.can_access_branch(branch_id)
  );

drop policy if exists "managers review branch change requests" on public.account_change_requests;
create policy "managers review branch change requests"
  on public.account_change_requests for update to authenticated
  using (public.is_branch_manager_for(branch_id))
  with check (public.is_branch_manager_for(branch_id));

-- ---------------------------------------------------------------------
-- Customer OTP codes: no policies -> only the service role can touch them
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Explicit grants
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.branches, public.internet_plans, public.branch_coverage to anon, authenticated;
grant select, insert on public.inquiries to anon, authenticated;
grant select, insert, update, delete on public.branches, public.internet_plans,
  public.profiles, public.customers, public.branch_coverage, public.inquiries,
  public.installations, public.support_tickets, public.billing_records,
  public.employee_presence, public.audit_logs, public.customer_notifications,
  public.account_change_requests to authenticated;
