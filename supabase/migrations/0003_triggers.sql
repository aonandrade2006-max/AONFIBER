-- =====================================================================
-- 0003_triggers.sql : guards, audit trail, notifications, billing
--
-- Safe to re-run: functions use create or replace and every trigger is
-- dropped before it is created, so triggers can never be duplicated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Audit helper
-- ---------------------------------------------------------------------
create or replace function public.log_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_branch_id uuid,
  p_details jsonb
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_role text;
begin
  select full_name, role into v_name, v_role
  from public.profiles where id = auth.uid();

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, action, entity_type, entity_id, branch_id, details)
  values
    (auth.uid(), coalesce(v_name, 'System'), coalesce(v_role, 'system'),
     p_action, p_entity_type, p_entity_id, p_branch_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_entity_id text;
  v_branch uuid;
  v_details jsonb := '{}'::jsonb;
  v_new jsonb;
  v_old jsonb;
  k text;
begin
  if tg_op = 'INSERT' then
    v_action := 'create';
    v_new := to_jsonb(new);
    v_entity_id := coalesce(new.id::text, '');
    v_details := jsonb_build_object('after', v_new - 'auth_user_id');
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_new := to_jsonb(new);
    v_old := to_jsonb(old);
    v_entity_id := coalesce(new.id::text, old.id::text, '');
    for k in select jsonb_object_keys(v_new) loop
      -- Presence stamps change on every request; they do not belong in the audit trail.
      if k not in ('updated_at', 'last_activity_at')
         and (v_old -> k) is distinct from (v_new -> k) then
        v_details := v_details || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
      end if;
    end loop;
    if v_details = '{}'::jsonb then
      return null;
    end if;
  else
    v_action := lower(tg_op);
    v_old := to_jsonb(old);
    v_entity_id := coalesce(old.id::text, '');
    v_details := jsonb_build_object('before', v_old - 'auth_user_id');
  end if;

  if tg_table_name in ('customers', 'installations',
                       'support_tickets', 'billing_records', 'account_change_requests') then
    if tg_op = 'DELETE' then
      v_branch := (v_old ->> 'branch_id')::uuid;
    else
      v_branch := (v_new ->> 'branch_id')::uuid;
    end if;
  elsif tg_table_name = 'branches' then
    v_branch := (v_new ->> 'id')::uuid;
  end if;

  perform public.log_audit(
    tg_table_name || '.' || v_action,
    tg_table_name,
    v_entity_id,
    v_branch,
    v_details
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Immutable customer account numbers
-- ---------------------------------------------------------------------
create or replace function public.guard_customer_update()
returns trigger
language plpgsql
as $$
begin
  if new.account_number is distinct from old.account_number then
    raise exception 'Customer account numbers cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_guard on public.customers;
create trigger customers_guard before update on public.customers
for each row execute function public.guard_customer_update();

-- ---------------------------------------------------------------------
-- Customers may only toggle the read flag of their notifications
-- ---------------------------------------------------------------------
create or replace function public.guard_notification_update()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.customer_id is distinct from old.customer_id
       or new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.category is distinct from old.category
       or new.created_at is distinct from old.created_at then
      raise exception 'Only the read status of a notification can be updated';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_notifications_guard on public.customer_notifications;
create trigger customer_notifications_guard before update on public.customer_notifications
for each row execute function public.guard_notification_update();

-- ---------------------------------------------------------------------
-- Only managers/admins may review change requests
-- ---------------------------------------------------------------------
create or replace function public.guard_change_request_review()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if auth.uid() is not null and not public.is_branch_manager_for(old.branch_id) then
      raise exception 'Only a branch manager or administrator can review change requests';
    end if;
    if new.status = 'pending' then
      raise exception 'A reviewed request cannot return to pending';
    end if;
    new.reviewed_by := coalesce(auth.uid(), new.reviewed_by, old.reviewed_by);
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists account_change_requests_guard on public.account_change_requests;
create trigger account_change_requests_guard before update on public.account_change_requests
for each row execute function public.guard_change_request_review();

-- ---------------------------------------------------------------------
-- Apply an approved correction to the customer record
-- ---------------------------------------------------------------------
create or replace function public.apply_change_request()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_changes jsonb := new.changes;
  v_customer public.customers;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select * into v_customer from public.customers where id = new.customer_id;
    if v_customer.id is null then
      return null;
    end if;

    update public.customers set
      full_name = coalesce(nullif(v_changes ->> 'full_name', ''), full_name),
      contact_number = coalesce(nullif(v_changes ->> 'contact_number', ''), contact_number),
      email = coalesce(nullif(v_changes ->> 'email', ''), email),
      address = coalesce(nullif(v_changes ->> 'address', ''), address),
      city = coalesce(nullif(v_changes ->> 'city', ''), city),
      barangay = coalesce(nullif(v_changes ->> 'barangay', ''), barangay),
      notes = coalesce(nullif(v_changes ->> 'notes', ''), notes)
    where id = new.customer_id;

    insert into public.customer_notifications (customer_id, title, body, category)
    values (new.customer_id, 'Account details updated',
            'Your account information was corrected by our team after review. Please check your details in the customer portal.',
            'account');
  end if;
  return null;
end;
$$;

drop trigger if exists account_change_requests_apply on public.account_change_requests;
create trigger account_change_requests_apply after update on public.account_change_requests
for each row execute function public.apply_change_request();

-- ---------------------------------------------------------------------
-- Installation notifications + customer installation status
-- ---------------------------------------------------------------------
create or replace function public.on_installation_change()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.customer_notifications (customer_id, title, body, category)
    values (
      new.customer_id,
      'Installation request received',
      'Your installation request ' || new.reference_number || ' was received and is being scheduled.',
      'installation'
    );
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.customer_notifications (customer_id, title, body, category)
    values (
      new.customer_id,
      'Installation status updated',
      'Your installation request ' || new.reference_number || ' is now marked "' ||
        replace(new.status, '_', ' ') || '".',
      'installation'
    );

    if new.status = 'scheduled' then
      update public.customers set installation_status = 'scheduled' where id = new.customer_id;
    elsif new.status = 'in_progress' then
      update public.customers set installation_status = 'in_progress' where id = new.customer_id;
    elsif new.status = 'completed' then
      update public.customers set installation_status = 'completed', subscription_status = 'active'
        where id = new.customer_id;
    elsif new.status in ('failed', 'cancelled') then
      update public.customers set installation_status = 'failed' where id = new.customer_id;
    end if;
  end if;

  if new.scheduled_date is distinct from old.scheduled_date and new.scheduled_date is not null then
    insert into public.customer_notifications (customer_id, title, body, category)
    values (
      new.customer_id,
      'Installation schedule updated',
      'Your installation is scheduled on ' || to_char(new.scheduled_date, 'FMMonth DD, YYYY') || '.',
      'installation'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists installations_notify on public.installations;
create trigger installations_notify after insert or update on public.installations
for each row execute function public.on_installation_change();

-- ---------------------------------------------------------------------
-- Support ticket notifications
-- ---------------------------------------------------------------------
create or replace function public.on_ticket_change()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      new.resolved_at := now();
    end if;
    insert into public.customer_notifications (customer_id, title, body, category)
    values (
      new.customer_id,
      'Support ticket status changed',
      'Ticket ' || new.reference_number || ' is now "' || replace(new.status, '_', ' ') || '".',
      'support'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_notify on public.support_tickets;
create trigger support_tickets_notify before update on public.support_tickets
for each row execute function public.on_ticket_change();

-- ---------------------------------------------------------------------
-- Billing: derive status, notify on new statement and on payments
-- ---------------------------------------------------------------------
create or replace function public.billing_status_for(due date, due_amt numeric, paid_amt numeric)
returns text
language sql stable
as $$
  select case
    when paid_amt >= due_amt and due_amt > 0 then 'paid'
    when paid_amt > 0 then 'partial'
    when due < current_date then 'overdue'
    else 'unpaid'
  end;
$$;

create or replace function public.on_billing_before()
returns trigger
language plpgsql
as $$
begin
  new.status := public.billing_status_for(new.due_date, new.amount_due, new.amount_paid);
  if new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  else
    new.paid_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists billing_before_write on public.billing_records;
create trigger billing_before_write before insert or update on public.billing_records
for each row execute function public.on_billing_before();

create or replace function public.on_billing_after()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.customer_notifications (customer_id, title, body, category)
    values (
      new.customer_id,
      'New billing statement available',
      'Statement for ' || new.billing_period || ': PHP ' ||
        to_char(new.amount_due, 'FM999,999,990.00') || ' due on ' ||
        to_char(new.due_date, 'FMMonth DD, YYYY') || '.',
      'billing'
    );
  elsif new.amount_paid is distinct from old.amount_paid then
    insert into public.customer_notifications (customer_id, title, body, category)
    values (
      new.customer_id,
      'Payment recorded',
      'We recorded a payment of PHP ' || to_char(new.amount_paid - old.amount_paid, 'FM999,999,990.00') ||
        ' for ' || new.billing_period || '. Outstanding balance: PHP ' ||
        to_char(greatest(new.amount_due - new.amount_paid, 0), 'FM999,999,990.00') || '.',
      'billing'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists billing_notify on public.billing_records;
create trigger billing_notify after insert or update on public.billing_records
for each row execute function public.on_billing_after();

-- ---------------------------------------------------------------------
-- Due date reminders (called from the Admin portal)
-- ---------------------------------------------------------------------
create or replace function public.generate_due_date_reminders()
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only administrators can send due date reminders';
  end if;

  insert into public.customer_notifications (customer_id, title, body, category)
  select b.customer_id,
         'Payment due date approaching',
         'Your ' || b.billing_period || ' bill of PHP ' ||
           to_char(b.amount_due - b.amount_paid, 'FM999,999,990.00') ||
           ' is due on ' || to_char(b.due_date, 'FMMonth DD, YYYY') || '.',
         'billing'
  from public.billing_records b
  where b.status in ('unpaid', 'partial', 'overdue')
    and b.due_date between current_date and current_date + 5
    and not exists (
      select 1 from public.customer_notifications n
      where n.customer_id = b.customer_id
        and n.title = 'Payment due date approaching'
        and n.created_at > now() - interval '3 days'
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.generate_due_date_reminders() to authenticated;

-- ---------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'branches', 'internet_plans', 'profiles', 'customers', 'branch_coverage',
    'installations', 'support_tickets', 'billing_records', 'account_change_requests'
  ]
  loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      t, t
    );
  end loop;
end;
$$;

-- Keep the presence table seeded for staff as they are created.
create or replace function public.seed_presence()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.employee_presence (profile_id, branch_id)
  values (new.id, new.branch_id)
  on conflict (profile_id) do nothing;
  return null;
end;
$$;

drop trigger if exists profiles_seed_presence on public.profiles;
create trigger profiles_seed_presence after insert on public.profiles
for each row execute function public.seed_presence();
