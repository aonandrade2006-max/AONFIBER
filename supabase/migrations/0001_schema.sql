-- =====================================================================
-- AON FIBER Telecommunications
-- 0001_schema.sql : core tables, sequences, indexes
-- Run in the Supabase SQL editor (or `supabase db push`).
--
-- This file is IDEMPOTENT and safe to re-run on a database that already
-- contains objects:
--   * tables are created only when they are missing (`if not exists`)
--   * columns missing from a pre-existing table are added (`add column if not exists`)
--   * indexes are created only when missing (`if not exists`)
--   * triggers are dropped and re-created, never duplicated
-- Nothing here drops a table, deletes rows or rewrites existing data.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Reference number helpers
-- ---------------------------------------------------------------------
create sequence if not exists public.account_number_seq start 100001;
create sequence if not exists public.inquiry_ref_seq start 1;
create sequence if not exists public.installation_ref_seq start 1;
create sequence if not exists public.ticket_ref_seq start 1;

create or replace function public.next_reference(prefix text, seq regclass)
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select nextval(%L)', seq) into n;
  return prefix || '-' || lpad(n::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text not null,
  province text not null,
  contact_number text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.branches
  add column if not exists name text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists contact_number text,
  add column if not exists email text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists branches_city_idx on public.branches (lower(city));
create unique index if not exists branches_name_unique on public.branches (lower(name));

-- ---------------------------------------------------------------------
-- Internet plans
-- ---------------------------------------------------------------------
create table if not exists public.internet_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  speed_mbps integer not null check (speed_mbps > 0),
  monthly_price numeric(10, 2) not null check (monthly_price >= 0),
  description text,
  features text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.internet_plans
  add column if not exists name text,
  add column if not exists speed_mbps integer,
  add column if not exists monthly_price numeric(10, 2),
  add column if not exists description text,
  add column if not exists features text[] not null default '{}',
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists internet_plans_name_unique
  on public.internet_plans (lower(name));

-- ---------------------------------------------------------------------
-- Staff profiles (linked 1:1 with Supabase Auth users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'branch_manager', 'employee')),
  branch_id uuid references public.branches (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  can_create_employees boolean not null default false,
  contact_number text,
  last_login_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_required_for_branch_roles
    check (role = 'admin' or branch_id is not null)
);

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists branch_id uuid,
  add column if not exists status text not null default 'active',
  add column if not exists can_create_employees boolean not null default false,
  add column if not exists contact_number text,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_branch_idx on public.profiles (branch_id);

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  account_number text not null unique
    default public.next_reference('AON', 'public.account_number_seq'),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null,
  contact_number text not null,
  email text,
  address text not null,
  city text,
  barangay text,
  branch_id uuid not null references public.branches (id),
  plan_id uuid references public.internet_plans (id),
  subscription_status text not null default 'active'
    check (subscription_status in ('pending', 'active', 'suspended', 'disconnected')),
  monthly_billing numeric(10, 2) not null default 0 check (monthly_billing >= 0),
  due_date date,
  installation_status text not null default 'not_scheduled'
    check (installation_status in ('not_scheduled', 'scheduled', 'in_progress', 'completed', 'failed')),
  created_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `account_number` keeps its sequence default only on fresh tables; on a repair
-- the column is added without a default so no new numbers are generated.
alter table public.customers
  add column if not exists account_number text,
  add column if not exists auth_user_id uuid,
  add column if not exists full_name text,
  add column if not exists contact_number text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists barangay text,
  add column if not exists branch_id uuid,
  add column if not exists plan_id uuid,
  add column if not exists subscription_status text not null default 'active',
  add column if not exists monthly_billing numeric(10, 2) not null default 0,
  add column if not exists due_date date,
  add column if not exists installation_status text not null default 'not_scheduled',
  add column if not exists created_by uuid,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists customers_branch_idx on public.customers (branch_id);
create index if not exists customers_auth_idx on public.customers (auth_user_id);
create index if not exists customers_name_idx on public.customers (lower(full_name));

-- ---------------------------------------------------------------------
-- Branch coverage (admin configured only)
-- ---------------------------------------------------------------------
create table if not exists public.branch_coverage (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  city text not null,
  barangay text not null,
  area text,
  is_serviceable boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.branch_coverage
  add column if not exists branch_id uuid,
  add column if not exists city text,
  add column if not exists barangay text,
  add column if not exists area text,
  add column if not exists is_serviceable boolean not null default true,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists branch_coverage_lookup_idx
  on public.branch_coverage (lower(city), lower(barangay));

create unique index if not exists branch_coverage_unique_idx
  on public.branch_coverage (branch_id, lower(city), lower(barangay), coalesce(lower(area), ''));

-- ---------------------------------------------------------------------
-- Public inquiries
-- ---------------------------------------------------------------------
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique
    default public.next_reference('INQ', 'public.inquiry_ref_seq'),
  full_name text not null,
  contact_number text not null,
  email text,
  address text,
  city text,
  barangay text,
  branch_id uuid references public.branches (id) on delete set null,
  plan_id uuid references public.internet_plans (id) on delete set null,
  message text,
  type text not null default 'public_inquiry'
    check (type in ('public_inquiry', 'coverage_request')),
  status text not null default 'new'
    check (status in ('new', 'assigned', 'contacted', 'resolved', 'closed')),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.inquiries
  add column if not exists reference_number text,
  add column if not exists full_name text,
  add column if not exists contact_number text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists barangay text,
  add column if not exists branch_id uuid,
  add column if not exists plan_id uuid,
  add column if not exists message text,
  add column if not exists type text not null default 'public_inquiry',
  add column if not exists status text not null default 'new',
  add column if not exists assigned_to uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists resolved_at timestamptz;

create index if not exists inquiries_branch_idx on public.inquiries (branch_id, status);
create index if not exists inquiries_created_idx on public.inquiries (created_at desc);

-- ---------------------------------------------------------------------
-- Installations
-- ---------------------------------------------------------------------
create table if not exists public.installations (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique
    default public.next_reference('INST', 'public.installation_ref_seq'),
  customer_id uuid not null references public.customers (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  requested_date date,
  scheduled_date date,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled')),
  notes text,
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.installations
  add column if not exists reference_number text,
  add column if not exists customer_id uuid,
  add column if not exists branch_id uuid,
  add column if not exists requested_date date,
  add column if not exists scheduled_date date,
  add column if not exists status text not null default 'pending',
  add column if not exists notes text,
  add column if not exists assigned_to uuid,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists installations_customer_idx on public.installations (customer_id);
create index if not exists installations_branch_idx on public.installations (branch_id, status);

-- ---------------------------------------------------------------------
-- Support tickets (technical / billing / installation concerns)
-- ---------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique
    default public.next_reference('TKT', 'public.ticket_ref_seq'),
  customer_id uuid not null references public.customers (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  category text not null check (category in ('technical', 'billing', 'installation')),
  subject text not null,
  description text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  assigned_to uuid references public.profiles (id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.support_tickets
  add column if not exists reference_number text,
  add column if not exists customer_id uuid,
  add column if not exists branch_id uuid,
  add column if not exists category text,
  add column if not exists subject text,
  add column if not exists description text,
  add column if not exists priority text not null default 'normal',
  add column if not exists status text not null default 'open',
  add column if not exists assigned_to uuid,
  add column if not exists resolution_notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists resolved_at timestamptz;

create index if not exists support_tickets_customer_idx on public.support_tickets (customer_id);
create index if not exists support_tickets_branch_idx on public.support_tickets (branch_id, status);

-- ---------------------------------------------------------------------
-- Billing records
-- ---------------------------------------------------------------------
create table if not exists public.billing_records (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  billing_period text not null,
  amount_due numeric(10, 2) not null check (amount_due >= 0),
  amount_paid numeric(10, 2) not null default 0 check (amount_paid >= 0),
  due_date date not null,
  status text not null default 'unpaid'
    check (status in ('unpaid', 'partial', 'paid', 'overdue')),
  statement_issued_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, billing_period)
);

alter table public.billing_records
  add column if not exists customer_id uuid,
  add column if not exists branch_id uuid,
  add column if not exists billing_period text,
  add column if not exists amount_due numeric(10, 2),
  add column if not exists amount_paid numeric(10, 2) not null default 0,
  add column if not exists due_date date,
  add column if not exists status text not null default 'unpaid',
  add column if not exists statement_issued_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists billing_customer_idx on public.billing_records (customer_id);
create index if not exists billing_branch_idx on public.billing_records (branch_id, status);

-- ---------------------------------------------------------------------
-- Employee presence (heartbeat based)
-- ---------------------------------------------------------------------
create table if not exists public.employee_presence (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  is_online boolean not null default false,
  last_seen_at timestamptz,
  last_login_at timestamptz,
  last_activity_at timestamptz,
  session_started_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.employee_presence
  add column if not exists branch_id uuid,
  add column if not exists is_online boolean not null default false,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists session_started_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  branch_id uuid references public.branches (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs
  add column if not exists actor_id uuid,
  add column if not exists actor_name text,
  add column if not exists actor_role text,
  add column if not exists action text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists branch_id uuid,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------
-- Customer notifications
-- ---------------------------------------------------------------------
create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'general'
    check (category in ('general', 'installation', 'billing', 'support', 'account')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.customer_notifications
  add column if not exists customer_id uuid,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists category text not null default 'general',
  add column if not exists is_read boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create index if not exists customer_notifications_customer_idx
  on public.customer_notifications (customer_id, created_at desc);

-- ---------------------------------------------------------------------
-- Account change requests (employee -> branch manager/admin approval)
-- ---------------------------------------------------------------------
create table if not exists public.account_change_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  requested_by uuid not null references public.profiles (id),
  changes jsonb not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.account_change_requests
  add column if not exists customer_id uuid,
  add column if not exists branch_id uuid,
  add column if not exists requested_by uuid,
  add column if not exists changes jsonb,
  add column if not exists reason text,
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_by uuid,
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

create index if not exists account_change_requests_branch_idx
  on public.account_change_requests (branch_id, status);

-- ---------------------------------------------------------------------
-- Customer one-time codes (server writes with service role only)
-- ---------------------------------------------------------------------
create table if not exists public.customer_otp_codes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip text,
  created_at timestamptz not null default now()
);

alter table public.customer_otp_codes
  add column if not exists customer_id uuid,
  add column if not exists code_hash text,
  add column if not exists attempts integer not null default 0,
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists requested_ip text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists customer_otp_customer_idx
  on public.customer_otp_codes (customer_id, created_at desc);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'branches', 'internet_plans', 'profiles', 'customers', 'branch_coverage',
    'inquiries', 'installations', 'support_tickets', 'billing_records',
    'employee_presence', 'account_change_requests'
  ]
  loop
    -- Drop first so a re-run never hits "trigger already exists".
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;
