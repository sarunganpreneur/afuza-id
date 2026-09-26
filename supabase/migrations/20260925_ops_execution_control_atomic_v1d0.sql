-- ============================================================================
-- AFUZA EXECUTION GATE V1D-0
-- Atomic Control + Durable Idempotency Hardening
--
-- SAFETY:
-- - Does NOT change execution-control state.
-- - Does NOT open the execution gate.
-- - Does NOT start/prepare/finish/cancel executions.
-- - Does NOT connect any external executor.
-- - Existing ops_set_execution_control() remains available during staged cutover.
--
-- GOALS:
-- 1. expected_version is checked while the control row is locked.
-- 2. control mutations have durable idempotency.
-- 3. same key + same canonical request = exact historical replay.
-- 4. same key + different canonical request = IDEMPOTENCY_KEY_CONFLICT.
-- 5. SAFE_LOCK / EMERGENCY_STOP ignore stale expected_version.
-- 6. successful state changes remain append-only audited.
-- ============================================================================

begin;


-- ============================================================================
-- DURABLE CONTROL REQUEST LEDGER
-- ============================================================================

create table if not exists public.ops_execution_control_requests (
  id uuid primary key default gen_random_uuid(),

  idempotency_key text not null,

  actor_user_id uuid not null,

  action text not null
    check (
      action in (
        'ARM_MASTER',
        'OPEN_GATE',
        'SAFE_LOCK',
        'EMERGENCY_STOP'
      )
    ),

  -- Canonical expected version.
  --
  -- For ARM_MASTER / OPEN_GATE this contains the caller's expected version.
  -- For SAFE_LOCK / EMERGENCY_STOP it is always normalized to NULL so safety
  -- actions cannot be blocked merely because the browser saw an older version.
  expected_version bigint,

  reason text not null
    check (
      length(reason)
      between 1 and 500
    ),

  outcome_code text not null
    default 'PROCESSING'
    check (
      outcome_code in (
        'PROCESSING',
        'APPLIED',
        'NO_CHANGE',
        'EXPECTED_VERSION_REQUIRED',
        'CONTROL_VERSION_CONFLICT',
        'INVALID_TRANSITION'
      )
    ),

  result_changed boolean,

  result_master_execution_enabled boolean,
  result_emergency_stop boolean,
  result_gate_open boolean,

  result_reason text,
  result_updated_by uuid,
  result_updated_at timestamptz,
  result_version bigint,

  created_at timestamptz not null
    default now(),

  completed_at timestamptz,

  constraint ops_execution_control_requests_idempotency_key_unique
    unique (idempotency_key),

  constraint ops_execution_control_requests_idempotency_key_length
    check (
      length(idempotency_key)
      between 8 and 200
    ),

  constraint ops_execution_control_requests_expected_version_nonnegative
    check (
      expected_version is null
      or expected_version >= 0
    ),

  constraint ops_execution_control_requests_completion_consistency
    check (
      (
        outcome_code = 'PROCESSING'
        and completed_at is null
      )
      or
      (
        outcome_code <> 'PROCESSING'
        and completed_at is not null
      )
    )
);


comment on table public.ops_execution_control_requests is
  'Durable idempotency and deterministic result ledger for AFUZA execution-control mutations.';


create index if not exists
  ops_execution_control_requests_created_idx
on public.ops_execution_control_requests (
  created_at desc
);


create index if not exists
  ops_execution_control_requests_actor_created_idx
on public.ops_execution_control_requests (
  actor_user_id,
  created_at desc
);


alter table
  public.ops_execution_control_requests
enable row level security;


revoke all
on table public.ops_execution_control_requests
from public, anon, authenticated, service_role;


-- Read-only observability is permitted to trusted server-side service role.
-- Inserts/updates occur only through the SECURITY DEFINER atomic RPC.
grant select
on table public.ops_execution_control_requests
to service_role;



-- ============================================================================
-- MAKE COMPLETED IDEMPOTENCY RECORDS IMMUTABLE
-- ============================================================================

create or replace function
public.ops_guard_execution_control_request_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Execution control idempotency records are immutable';
  end if;

  if old.completed_at is not null then
    raise exception
      'Completed execution control idempotency records are immutable';
  end if;

  if
    new.id is distinct from old.id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.actor_user_id is distinct from old.actor_user_id
    or new.action is distinct from old.action
    or new.expected_version is distinct from old.expected_version
    or new.reason is distinct from old.reason
    or new.created_at is distinct from old.created_at
  then
    raise exception
      'Execution control request identity is immutable';
  end if;

  return new;
end;
$$;


revoke all
on function public.ops_guard_execution_control_request_mutation()
from public, anon, authenticated, service_role;


drop trigger if exists
  ops_execution_control_requests_immutable_trigger
on public.ops_execution_control_requests;


create trigger
  ops_execution_control_requests_immutable_trigger
before update or delete
on public.ops_execution_control_requests
for each row
execute function
  public.ops_guard_execution_control_request_mutation();



-- ============================================================================
-- LINK CONTROL AUDIT EVENTS TO DURABLE REQUESTS
-- ============================================================================

alter table public.ops_execution_control_events
  add column if not exists
    control_request_id uuid
      references public.ops_execution_control_requests(id)
      on delete restrict;


alter table public.ops_execution_control_events
  add column if not exists
    idempotency_key text;


create unique index if not exists
  ops_execution_control_events_request_unique
on public.ops_execution_control_events (
  control_request_id
)
where control_request_id is not null;


create unique index if not exists
  ops_execution_control_events_idempotency_unique
on public.ops_execution_control_events (
  idempotency_key
)
where idempotency_key is not null;



-- ============================================================================
-- ATOMIC CONTROL RPC
-- ============================================================================

create or replace function
public.ops_apply_execution_control_action(
  p_action text,
  p_expected_version bigint,
  p_reason text,
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns table (
  request_id uuid,
  outcome_code text,
  replayed boolean,
  changed boolean,

  master_execution_enabled boolean,
  emergency_stop boolean,
  gate_open boolean,

  reason text,
  updated_by uuid,
  updated_at timestamptz,
  version bigint,

  idempotency_key text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_action text;
  v_reason text;
  v_key text;
  v_expected_version bigint;

  v_inserted_request_id uuid;
  v_request public.ops_execution_control_requests%rowtype;

  v_current public.ops_execution_controls%rowtype;

  v_previous_master boolean;
  v_previous_stop boolean;

  v_target_master boolean;
  v_target_stop boolean;

  v_outcome text;
  v_changed boolean := false;
begin

  -- --------------------------------------------------------------------------
  -- AUTHORIZATION
  -- --------------------------------------------------------------------------

  if p_actor_user_id is null then
    raise exception
      'OPS_ADMIN identity required';
  end if;

  if not public.ops_user_has_permission(
    p_actor_user_id,
    'OPS_ADMIN'
  ) then
    raise exception
      'OPS_ADMIN permission required';
  end if;


  -- --------------------------------------------------------------------------
  -- NORMALIZE / VALIDATE REQUEST
  -- --------------------------------------------------------------------------

  v_action :=
    upper(
      trim(
        coalesce(
          p_action,
          ''
        )
      )
    );

  if v_action not in (
    'ARM_MASTER',
    'OPEN_GATE',
    'SAFE_LOCK',
    'EMERGENCY_STOP'
  ) then
    raise exception
      'Execution control action is invalid';
  end if;


  v_reason :=
    nullif(
      trim(
        coalesce(
          p_reason,
          ''
        )
      ),
      ''
    );

  if v_reason is null then
    raise exception
      'Execution control reason is required';
  end if;

  if length(v_reason) > 500 then
    raise exception
      'Execution control reason is too long';
  end if;


  v_key :=
    trim(
      coalesce(
        p_idempotency_key,
        ''
      )
    );

  if length(v_key) < 8
     or length(v_key) > 200
  then
    raise exception
      'Execution control idempotency key is invalid';
  end if;


  if p_expected_version is not null
     and p_expected_version < 0
  then
    raise exception
      'Execution control expected version is invalid';
  end if;


  -- Safety actions deliberately do not participate in optimistic-version
  -- rejection. Their canonical expected_version is therefore NULL.
  if v_action in (
    'SAFE_LOCK',
    'EMERGENCY_STOP'
  ) then
    v_expected_version := null;
  else
    v_expected_version := p_expected_version;
  end if;


  -- --------------------------------------------------------------------------
  -- DURABLE IDEMPOTENCY CLAIM
  --
  -- Concurrent requests using the same key serialize on the UNIQUE index.
  -- If another transaction already owns the key, we replay its durable result
  -- or return IDEMPOTENCY_KEY_CONFLICT when the canonical request differs.
  -- --------------------------------------------------------------------------

  insert into public.ops_execution_control_requests (
    idempotency_key,
    actor_user_id,
    action,
    expected_version,
    reason
  )
  values (
    v_key,
    p_actor_user_id,
    v_action,
    v_expected_version,
    v_reason
  )
  on conflict on constraint
    ops_execution_control_requests_idempotency_key_unique
  do nothing
  returning id
  into v_inserted_request_id;


  if v_inserted_request_id is null then

    select r.*
    into v_request
    from public.ops_execution_control_requests as r
    where r.idempotency_key = v_key
    for update;


    if not found then
      raise exception
        'Execution control idempotency record unavailable';
    end if;


    if
      v_request.actor_user_id
        is distinct from p_actor_user_id
      or
      v_request.action
        is distinct from v_action
      or
      v_request.expected_version
        is distinct from v_expected_version
      or
      v_request.reason
        is distinct from v_reason
    then

      select c.*
      into v_current
      from public.ops_execution_controls as c
      where c.singleton_id = true;


      if not found then
        raise exception
          'Execution control singleton is missing';
      end if;


      return query
      select
        v_request.id,
        'IDEMPOTENCY_KEY_CONFLICT'::text,
        false,
        false,

        v_current.master_execution_enabled,
        v_current.emergency_stop,
        (
          v_current.master_execution_enabled
          and not v_current.emergency_stop
        ),

        v_current.reason,
        v_current.updated_by,
        v_current.updated_at,
        v_current.version,

        v_key;

      return;
    end if;


    if v_request.completed_at is null then
      raise exception
        'Execution control idempotency record incomplete';
    end if;


    return query
    select
      v_request.id,
      v_request.outcome_code,
      true,
      coalesce(
        v_request.result_changed,
        false
      ),

      v_request.result_master_execution_enabled,
      v_request.result_emergency_stop,
      v_request.result_gate_open,

      v_request.result_reason,
      v_request.result_updated_by,
      v_request.result_updated_at,
      v_request.result_version,

      v_request.idempotency_key;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- ATOMIC CONTROL LOCK
  --
  -- expected_version validation and state mutation happen while this row lock
  -- is held. This removes the application-layer read/check/write race.
  -- --------------------------------------------------------------------------

  select c.*
  into v_current
  from public.ops_execution_controls as c
  where c.singleton_id = true
  for update;


  if not found then
    raise exception
      'Execution control singleton is missing';
  end if;


  v_previous_master :=
    v_current.master_execution_enabled;

  v_previous_stop :=
    v_current.emergency_stop;


  -- --------------------------------------------------------------------------
  -- ACTION STATE MACHINE
  -- --------------------------------------------------------------------------

  if v_action = 'ARM_MASTER' then

    if v_expected_version is null then

      v_outcome :=
        'EXPECTED_VERSION_REQUIRED';

    elsif v_expected_version
          <> v_current.version
    then

      v_outcome :=
        'CONTROL_VERSION_CONFLICT';

    elsif
      v_current.master_execution_enabled
        is distinct from false
      or
      v_current.emergency_stop
        is distinct from true
    then

      v_outcome :=
        'INVALID_TRANSITION';

    else

      v_target_master := true;
      v_target_stop := true;

    end if;


  elsif v_action = 'OPEN_GATE' then

    if v_expected_version is null then

      v_outcome :=
        'EXPECTED_VERSION_REQUIRED';

    elsif v_expected_version
          <> v_current.version
    then

      v_outcome :=
        'CONTROL_VERSION_CONFLICT';

    elsif
      v_current.master_execution_enabled
        is distinct from true
      or
      v_current.emergency_stop
        is distinct from true
    then

      v_outcome :=
        'INVALID_TRANSITION';

    else

      v_target_master := true;
      v_target_stop := false;

    end if;


  elsif v_action in (
    'SAFE_LOCK',
    'EMERGENCY_STOP'
  ) then

    -- Fail-closed actions intentionally ignore stale expected_version.
    v_target_master := false;
    v_target_stop := true;

  end if;


  -- --------------------------------------------------------------------------
  -- MUTATE CONTROL ONLY WHEN STATE MACHINE ALLOWS IT
  -- --------------------------------------------------------------------------

  if v_outcome is null then

    v_changed :=
      v_current.master_execution_enabled
        is distinct from v_target_master
      or
      v_current.emergency_stop
        is distinct from v_target_stop;


    if v_changed then

      update public.ops_execution_controls as c
      set
        master_execution_enabled =
          v_target_master,

        emergency_stop =
          v_target_stop,

        reason =
          v_reason,

        updated_by =
          p_actor_user_id,

        updated_at =
          now(),

        version =
          c.version + 1

      where c.singleton_id = true

      returning c.*
      into v_current;


      insert into public.ops_execution_control_events (
        event_type,
        actor_user_id,

        previous_master_execution_enabled,
        previous_emergency_stop,

        new_master_execution_enabled,
        new_emergency_stop,

        reason,

        control_request_id,
        idempotency_key
      )
      values (
        'UPDATED',
        p_actor_user_id,

        v_previous_master,
        v_previous_stop,

        v_current.master_execution_enabled,
        v_current.emergency_stop,

        v_reason,

        v_inserted_request_id,
        v_key
      );


      v_outcome :=
        'APPLIED';

    else

      v_outcome :=
        'NO_CHANGE';

    end if;

  end if;


  -- --------------------------------------------------------------------------
  -- DURABLY STORE THE RESULT BEFORE RETURNING IT
  -- --------------------------------------------------------------------------

  update public.ops_execution_control_requests as r
  set
    outcome_code =
      v_outcome,

    result_changed =
      v_changed,

    result_master_execution_enabled =
      v_current.master_execution_enabled,

    result_emergency_stop =
      v_current.emergency_stop,

    result_gate_open =
      (
        v_current.master_execution_enabled
        and not v_current.emergency_stop
      ),

    result_reason =
      v_current.reason,

    result_updated_by =
      v_current.updated_by,

    result_updated_at =
      v_current.updated_at,

    result_version =
      v_current.version,

    completed_at =
      now()

  where r.id =
    v_inserted_request_id

  returning r.*
  into v_request;


  if not found then
    raise exception
      'Execution control idempotency result persistence failed';
  end if;


  return query
  select
    v_request.id,
    v_request.outcome_code,
    false,
    coalesce(
      v_request.result_changed,
      false
    ),

    v_request.result_master_execution_enabled,
    v_request.result_emergency_stop,
    v_request.result_gate_open,

    v_request.result_reason,
    v_request.result_updated_by,
    v_request.result_updated_at,
    v_request.result_version,

    v_request.idempotency_key;

end;
$$;



-- ============================================================================
-- RPC PRIVILEGES
-- ============================================================================

revoke all
on function public.ops_apply_execution_control_action(
  text,
  bigint,
  text,
  uuid,
  text
)
from public, anon, authenticated;


grant execute
on function public.ops_apply_execution_control_action(
  text,
  bigint,
  text,
  uuid,
  text
)
to service_role;


-- IMPORTANT:
-- Do NOT retire ops_set_execution_control() yet.
-- The production API still uses it until V1D-0B cut-over succeeds.


commit;



-- ============================================================================
-- READ-ONLY POST-MIGRATION VERIFICATION
-- ============================================================================

select
  'ops_execution_control_requests' as object_name,
  to_regclass(
    'public.ops_execution_control_requests'
  ) is not null as exists;


select
  'ops_apply_execution_control_action' as object_name,
  to_regprocedure(
    'public.ops_apply_execution_control_action(text,bigint,text,uuid,text)'
  ) is not null as exists;


select
  c.master_execution_enabled,
  c.emergency_stop,
  (
    c.master_execution_enabled
    and not c.emergency_stop
  ) as gate_open,
  c.version,
  c.reason
from public.ops_execution_controls as c
where c.singleton_id = true;


select
  count(*) as durable_control_request_count
from public.ops_execution_control_requests;


select
  has_function_privilege(
    'service_role',
    'public.ops_apply_execution_control_action(text,bigint,text,uuid,text)',
    'EXECUTE'
  ) as new_atomic_rpc_service_role_execute;


select
  has_function_privilege(
    'service_role',
    'public.ops_set_execution_control(boolean,boolean,text,uuid)',
    'EXECUTE'
  ) as legacy_rpc_temporarily_available;
