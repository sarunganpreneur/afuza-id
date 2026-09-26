-- ============================================================================
-- AFUZA OPS EXECUTION GATE V1A.1
-- Fix: ambiguous "version" reference in ops_set_execution_control()
--
-- Root cause:
-- RETURNS TABLE exposes "version" as a PL/pgSQL output variable, so
-- "version = version + 1" is ambiguous inside UPDATE.
--
-- Safety:
-- - No execution is performed.
-- - No control state is changed by this migration.
-- ============================================================================

begin;

create or replace function public.ops_set_execution_control(
  p_master_execution_enabled boolean,
  p_emergency_stop boolean,
  p_reason text,
  p_actor_user_id uuid
)
returns table (
  master_execution_enabled boolean,
  emergency_stop boolean,
  gate_open boolean,
  reason text,
  updated_by uuid,
  updated_at timestamptz,
  version bigint,
  changed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current public.ops_execution_controls%rowtype;
  v_reason text;
  v_changed boolean;
begin
  if p_actor_user_id is null then
    raise exception 'OPS_ADMIN identity required';
  end if;

  if not public.ops_user_has_permission(
    p_actor_user_id,
    'OPS_ADMIN'
  ) then
    raise exception 'OPS_ADMIN permission required';
  end if;

  if p_master_execution_enabled is null
     or p_emergency_stop is null then
    raise exception 'Execution control state is required';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  if v_reason is null then
    raise exception 'Execution control reason is required';
  end if;

  if length(v_reason) > 500 then
    raise exception 'Execution control reason is too long';
  end if;

  select *
  into v_current
  from public.ops_execution_controls
  where singleton_id = true
  for update;

  if not found then
    raise exception 'Execution control singleton is missing';
  end if;

  v_changed :=
    v_current.master_execution_enabled
      is distinct from p_master_execution_enabled
    or
    v_current.emergency_stop
      is distinct from p_emergency_stop;

  if v_changed then
    update public.ops_execution_controls as c
    set
      master_execution_enabled = p_master_execution_enabled,
      emergency_stop = p_emergency_stop,
      reason = v_reason,
      updated_by = p_actor_user_id,
      updated_at = now(),
      version = c.version + 1
    where c.singleton_id = true;

    insert into public.ops_execution_control_events (
      event_type,
      actor_user_id,
      previous_master_execution_enabled,
      previous_emergency_stop,
      new_master_execution_enabled,
      new_emergency_stop,
      reason
    )
    values (
      'UPDATED',
      p_actor_user_id,
      v_current.master_execution_enabled,
      v_current.emergency_stop,
      p_master_execution_enabled,
      p_emergency_stop,
      v_reason
    );
  end if;

  return query
  select
    c.master_execution_enabled,
    c.emergency_stop,
    (
      c.master_execution_enabled
      and not c.emergency_stop
    ) as gate_open,
    c.reason,
    c.updated_by,
    c.updated_at,
    c.version,
    v_changed
  from public.ops_execution_controls c
  where c.singleton_id = true;
end;
$$;

revoke all
on function public.ops_set_execution_control(
  boolean,
  boolean,
  text,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.ops_set_execution_control(
  boolean,
  boolean,
  text,
  uuid
)
to service_role;

commit;
