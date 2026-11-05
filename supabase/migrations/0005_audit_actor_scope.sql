-- =====================================================================
-- 0005_audit_actor_scope.sql
--
-- Fix: insert or update on table "audit_logs" violates foreign key
--      constraint "audit_logs_actor_id_fkey"
--
-- Cause
-- -----
-- public.log_audit() always stored auth.uid() as audit_logs.actor_id.
-- audit_logs.actor_id references public.profiles(id). Customers sign in with
-- their own Supabase auth user (customers.auth_user_id) and do NOT have a
-- profiles row, so every audit trail entry produced by a customer action
-- (support ticket, account correction request, ...) tried to reference a
-- profile that does not exist and the whole write rolled back.
--
-- Fix
-- ---
-- Resolve the actor against public.profiles first. When the signed-in user is
-- a customer (or has no profile at all) the log row keeps the human readable
-- actor name/role and stores actor_id as NULL instead of pointing at a
-- missing profile. The foreign key stays enforced; no data is removed and no
-- constraint, policy or guard is disabled.
-- =====================================================================

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
  v_actor uuid := auth.uid();
  v_profile_id uuid;
  v_staff_name text;
  v_staff_role text;
  v_customer_name text;
begin
  if v_actor is not null then
    select p.id, p.full_name, p.role
      into v_profile_id, v_staff_name, v_staff_role
      from public.profiles p
     where p.id = v_actor;
  end if;

  -- Customers authenticate as their own auth user but live in public.customers.
  if v_actor is not null and v_profile_id is null then
    select c.full_name
      into v_customer_name
      from public.customers c
     where c.auth_user_id = v_actor
     limit 1;
  end if;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, action, entity_type, entity_id, branch_id, details)
  values
    (v_profile_id,
     coalesce(v_staff_name, v_customer_name, 'System'),
     coalesce(v_staff_role, case when v_customer_name is null then 'system' else 'customer' end),
     p_action,
     p_entity_type,
     p_entity_id,
     p_branch_id,
     coalesce(p_details, '{}'::jsonb));
end;
$$;

-- The trigger functions already run as definer; make the helper callable by
-- signed-in users that hit the audited tables directly through RLS.
grant execute on function public.log_audit(text, text, text, uuid, jsonb) to authenticated;
