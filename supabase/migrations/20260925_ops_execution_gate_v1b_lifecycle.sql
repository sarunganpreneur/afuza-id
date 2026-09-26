-- ============================================================================
-- AFUZA OPS EXECUTION GATE V1B
-- Execution Lifecycle / Lease Foundation
--
-- SAFETY PRINCIPLES
-- - APPROVED != EXECUTED
-- - PREPARED != EXECUTING
-- - START requires OPS_CONTROL and an OPEN execution gate.
-- - Lease renewal requires OPS_CONTROL, a valid lease token, and an OPEN gate.
-- - COMPLETE / FAILED are terminal state recording only; they do not call an
--   external executor.
-- - CANCEL is allowed even when the gate is closed / emergency stop is active.
-- - No n8n, OpenAI, webhook, publish, deploy, WhatsApp, or other external action
--   is invoked by this migration.
-- ============================================================================

begin;

do $$
declare
  v_master boolean;
  v_stop boolean;
begin
  if to_regclass('public.ops_execution_controls') is null
     or to_regclass('public.ops_executions') is null
     or to_regclass('public.ops_execution_events') is null then
    raise exception 'Execution Gate V1B preflight failed: V1A objects are missing';
  end if;

  if to_regprocedure('public.ops_user_has_permission(uuid,text)') is null then
    raise exception 'Execution Gate V1B preflight failed: ops_user_has_permission(uuid,text) is missing';
  end if;

  if to_regtype('public.ops_execution_status') is null
     or to_regtype('public.ops_execution_event_type') is null then
    raise exception 'Execution Gate V1B preflight failed: execution enum types are missing';
  end if;

  select c.master_execution_enabled, c.emergency_stop
  into v_master, v_stop
  from public.ops_execution_controls c
  where c.singleton_id = true;

  if not found then
    raise exception 'Execution Gate V1B preflight failed: control singleton is missing';
  end if;

  if v_master or not v_stop then
    raise exception 'Execution Gate V1B preflight failed: gate must be in safe baseline (master OFF, emergency stop ON)';
  end if;

  if exists (
    select 1
    from public.ops_executions e
    where e.status <> 'PREPARED'::public.ops_execution_status
       or e.started_at is not null
       or e.finished_at is not null
       or e.executor_type is not null
       or e.executor_reference is not null
  ) then
    raise exception 'Execution Gate V1B preflight failed: unexpected non-PREPARED execution state exists';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'ops_executions'
      and c.column_name in (
        'lease_token',
        'lease_expires_at',
        'last_heartbeat_at',
        'state_version'
      )
  ) then
    raise exception 'Execution Gate V1B preflight failed: V1B columns already exist and require review';
  end if;
end
$$;

alter table public.ops_executions
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column last_heartbeat_at timestamptz,
  add column state_version bigint not null default 1
    check (state_version >= 1);

create unique index ops_executions_lease_token_unique
  on public.ops_executions(lease_token)
  where lease_token is not null;

create index ops_executions_active_lease_idx
  on public.ops_executions(status, lease_expires_at)
  where status = 'EXECUTING'::public.ops_execution_status;

alter table public.ops_executions
  drop constraint if exists ops_executions_v1a_prepared_only;

alter table public.ops_executions
  add constraint ops_executions_state_consistency
  check (
    (
      status = 'PREPARED'::public.ops_execution_status
      and started_at is null
      and finished_at is null
      and executor_type is null
      and executor_reference is null
      and result_summary is null
      and failure_code is null
      and failure_message is null
      and lease_token is null
      and lease_expires_at is null
      and last_heartbeat_at is null
    )
    or
    (
      status = 'EXECUTING'::public.ops_execution_status
      and started_at is not null
      and finished_at is null
      and nullif(trim(executor_type), '') is not null
      and result_summary is null
      and failure_code is null
      and failure_message is null
      and lease_token is not null
      and lease_expires_at is not null
      and last_heartbeat_at is not null
    )
    or
    (
      status = 'COMPLETED'::public.ops_execution_status
      and started_at is not null
      and finished_at is not null
      and nullif(trim(executor_type), '') is not null
      and failure_code is null
      and failure_message is null
      and lease_token is not null
    )
    or
    (
      status = 'FAILED'::public.ops_execution_status
      and started_at is not null
      and finished_at is not null
      and nullif(trim(executor_type), '') is not null
      and nullif(trim(failure_code), '') is not null
      and lease_token is not null
    )
    or
    (
      status = 'CANCELLED'::public.ops_execution_status
      and finished_at is not null
      and failure_code is null
      and failure_message is null
    )
  );

alter table public.ops_execution_events
  drop constraint if exists ops_execution_event_shape;

alter table public.ops_execution_events
  add constraint ops_execution_event_shape
  check (
    (
      event_type = 'BLOCKED'::public.ops_execution_event_type
      and
      (
        (
          execution_id is null
          and previous_status is null
          and new_status = 'BLOCKED'::public.ops_execution_status
        )
        or
        (
          execution_id is not null
          and previous_status is not null
          and new_status = previous_status
        )
      )
    )
    or
    (
      event_type <> 'BLOCKED'::public.ops_execution_event_type
      and execution_id is not null
    )
  );

create or replace function public.ops_start_execution(
  p_execution_id uuid,
  p_idempotency_key text,
  p_actor_user_id uuid,
  p_executor_type text,
  p_executor_reference jsonb default null,
  p_lease_minutes integer default 15
)
returns table (
  execution_id uuid,
  status text,
  started_new boolean,
  replayed boolean,
  blocked_reason text,
  lease_token uuid,
  lease_expires_at timestamptz,
  state_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_executor_type text;
  v_executor_reference jsonb;
  v_execution public.ops_executions%rowtype;
  v_approval public.ops_approval_requests%rowtype;
  v_control public.ops_execution_controls%rowtype;
  v_event public.ops_execution_events%rowtype;
  v_blocked_reason text;
  v_lease_token uuid;
  v_lease_expires_at timestamptz;
begin
  if p_actor_user_id is null then
    raise exception 'OPS_CONTROL identity required';
  end if;

  if not public.ops_user_has_permission(p_actor_user_id, 'OPS_CONTROL') then
    raise exception 'OPS_CONTROL permission required';
  end if;

  if p_execution_id is null then
    raise exception 'Execution id is required';
  end if;

  v_key := trim(coalesce(p_idempotency_key, ''));
  if length(v_key) < 8 or length(v_key) > 200 then
    raise exception 'Execution idempotency key is invalid';
  end if;

  v_executor_type := nullif(trim(coalesce(p_executor_type, '')), '');
  if v_executor_type is null or length(v_executor_type) > 120 then
    raise exception 'Executor type is invalid';
  end if;

  v_executor_reference := p_executor_reference;
  if v_executor_reference is not null
     and jsonb_typeof(v_executor_reference) <> 'object' then
    raise exception 'Executor reference must be a JSON object';
  end if;

  if p_lease_minutes is null
     or p_lease_minutes < 1
     or p_lease_minutes > 60 then
    raise exception 'Execution lease minutes must be between 1 and 60';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('afuza_execution_transition:' || v_key, 0)
  );

  select *
  into v_event
  from public.ops_execution_events ev
  where ev.idempotency_key = v_key;

  if found then
    if v_event.execution_id is distinct from p_execution_id
       or coalesce(v_event.metadata->>'operation', '') <> 'START' then
      raise exception 'EXECUTION_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_execution
    from public.ops_executions e
    where e.id = p_execution_id;

    if not found then
      raise exception 'EXECUTION_IDEMPOTENCY_STATE_INCONSISTENT';
    end if;

    return query
    select
      v_execution.id,
      v_execution.status::text,
      false,
      true,
      v_event.metadata->>'blocked_reason',
      v_execution.lease_token,
      v_execution.lease_expires_at,
      v_execution.state_version;

    return;
  end if;

  select *
  into v_execution
  from public.ops_executions e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception 'EXECUTION_NOT_FOUND';
  end if;

  if v_execution.status <> 'PREPARED'::public.ops_execution_status then
    raise exception 'EXECUTION_NOT_PREPARED';
  end if;

  select *
  into v_approval
  from public.ops_approval_requests a
  where a.id = v_execution.approval_id
  for update;

  if not found then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;

  if v_execution.action_type <> v_approval.action_type
     or v_execution.risk <> v_approval.risk then
    raise exception 'EXECUTION_APPROVAL_SNAPSHOT_MISMATCH';
  end if;

  select *
  into v_control
  from public.ops_execution_controls c
  where c.singleton_id = true
  for update;

  if not found then
    raise exception 'EXECUTION_CONTROL_UNAVAILABLE';
  end if;

  if v_approval.status <> 'APPROVED'::public.ops_approval_status then
    v_blocked_reason := 'APPROVAL_NOT_APPROVED';
  elsif v_approval.expires_at is not null
        and v_approval.expires_at <= now() then
    v_blocked_reason := 'APPROVAL_EXPIRED';
  elsif not v_control.master_execution_enabled then
    v_blocked_reason := 'MASTER_EXECUTION_DISABLED';
  elsif v_control.emergency_stop then
    v_blocked_reason := 'EMERGENCY_STOP_ACTIVE';
  end if;

  if v_blocked_reason is not null then
    insert into public.ops_execution_events (
      execution_id,
      approval_id,
      idempotency_key,
      event_type,
      actor_user_id,
      previous_status,
      new_status,
      reason,
      metadata
    )
    values (
      v_execution.id,
      v_execution.approval_id,
      v_key,
      'BLOCKED'::public.ops_execution_event_type,
      p_actor_user_id,
      v_execution.status,
      v_execution.status,
      v_blocked_reason,
      jsonb_build_object(
        'operation', 'START',
        'blocked_reason', v_blocked_reason,
        'executor_type', v_executor_type,
        'executor_reference', v_executor_reference,
        'master_execution_enabled', v_control.master_execution_enabled,
        'emergency_stop', v_control.emergency_stop,
        'control_version', v_control.version
      )
    );

    return query
    select
      v_execution.id,
      v_execution.status::text,
      false,
      false,
      v_blocked_reason,
      null::uuid,
      null::timestamptz,
      v_execution.state_version;

    return;
  end if;

  v_lease_token := gen_random_uuid();
  v_lease_expires_at := now() + make_interval(mins => p_lease_minutes);

  update public.ops_executions as e
  set
    status = 'EXECUTING'::public.ops_execution_status,
    started_at = now(),
    executor_type = v_executor_type,
    executor_reference = v_executor_reference,
    lease_token = v_lease_token,
    lease_expires_at = v_lease_expires_at,
    last_heartbeat_at = now(),
    state_version = e.state_version + 1,
    updated_at = now()
  where e.id = p_execution_id;

  insert into public.ops_execution_events (
    execution_id,
    approval_id,
    idempotency_key,
    event_type,
    actor_user_id,
    previous_status,
    new_status,
    reason,
    metadata
  )
  values (
    v_execution.id,
    v_execution.approval_id,
    v_key,
    'EXECUTING'::public.ops_execution_event_type,
    p_actor_user_id,
    'PREPARED'::public.ops_execution_status,
    'EXECUTING'::public.ops_execution_status,
    'Execution claimed. No external action was invoked by the control plane.',
    jsonb_build_object(
      'operation', 'START',
      'executor_type', v_executor_type,
      'executor_reference', v_executor_reference,
      'lease_minutes', p_lease_minutes,
      'lease_expires_at', v_lease_expires_at,
      'control_version', v_control.version,
      'safety', 'State transition only; external executor handoff is not part of V1B.'
    )
  );

  select *
  into v_execution
  from public.ops_executions e
  where e.id = p_execution_id;

  return query
  select
    v_execution.id,
    v_execution.status::text,
    true,
    false,
    null::text,
    v_execution.lease_token,
    v_execution.lease_expires_at,
    v_execution.state_version;
end;
$$;

create or replace function public.ops_renew_execution_lease(
  p_execution_id uuid,
  p_idempotency_key text,
  p_actor_user_id uuid,
  p_lease_token uuid,
  p_lease_minutes integer default 15
)
returns table (
  execution_id uuid,
  status text,
  renewed boolean,
  replayed boolean,
  blocked_reason text,
  lease_expires_at timestamptz,
  state_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_execution public.ops_executions%rowtype;
  v_control public.ops_execution_controls%rowtype;
  v_event public.ops_execution_events%rowtype;
  v_blocked_reason text;
  v_new_expiry timestamptz;
begin
  if p_actor_user_id is null then
    raise exception 'OPS_CONTROL identity required';
  end if;

  if not public.ops_user_has_permission(p_actor_user_id, 'OPS_CONTROL') then
    raise exception 'OPS_CONTROL permission required';
  end if;

  if p_execution_id is null or p_lease_token is null then
    raise exception 'Execution id and lease token are required';
  end if;

  v_key := trim(coalesce(p_idempotency_key, ''));
  if length(v_key) < 8 or length(v_key) > 200 then
    raise exception 'Execution idempotency key is invalid';
  end if;

  if p_lease_minutes is null
     or p_lease_minutes < 1
     or p_lease_minutes > 60 then
    raise exception 'Execution lease minutes must be between 1 and 60';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('afuza_execution_transition:' || v_key, 0)
  );

  select *
  into v_event
  from public.ops_execution_events ev
  where ev.idempotency_key = v_key;

  if found then
    if v_event.execution_id is distinct from p_execution_id
       or coalesce(v_event.metadata->>'operation', '') <> 'LEASE_RENEW' then
      raise exception 'EXECUTION_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_execution
    from public.ops_executions e
    where e.id = p_execution_id;

    if not found then
      raise exception 'EXECUTION_IDEMPOTENCY_STATE_INCONSISTENT';
    end if;

    return query
    select
      v_execution.id,
      v_execution.status::text,
      v_event.event_type = 'EXECUTING'::public.ops_execution_event_type,
      true,
      v_event.metadata->>'blocked_reason',
      v_execution.lease_expires_at,
      v_execution.state_version;

    return;
  end if;

  select *
  into v_execution
  from public.ops_executions e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception 'EXECUTION_NOT_FOUND';
  end if;

  if v_execution.status <> 'EXECUTING'::public.ops_execution_status then
    raise exception 'EXECUTION_NOT_EXECUTING';
  end if;

  if v_execution.lease_token is distinct from p_lease_token then
    raise exception 'EXECUTION_LEASE_TOKEN_MISMATCH';
  end if;

  select *
  into v_control
  from public.ops_execution_controls c
  where c.singleton_id = true
  for update;

  if not found then
    raise exception 'EXECUTION_CONTROL_UNAVAILABLE';
  end if;

  if v_execution.lease_expires_at is null
     or v_execution.lease_expires_at <= now() then
    v_blocked_reason := 'EXECUTION_LEASE_EXPIRED';
  elsif not v_control.master_execution_enabled then
    v_blocked_reason := 'MASTER_EXECUTION_DISABLED';
  elsif v_control.emergency_stop then
    v_blocked_reason := 'EMERGENCY_STOP_ACTIVE';
  end if;

  if v_blocked_reason is not null then
    insert into public.ops_execution_events (
      execution_id,
      approval_id,
      idempotency_key,
      event_type,
      actor_user_id,
      previous_status,
      new_status,
      reason,
      metadata
    )
    values (
      v_execution.id,
      v_execution.approval_id,
      v_key,
      'BLOCKED'::public.ops_execution_event_type,
      p_actor_user_id,
      v_execution.status,
      v_execution.status,
      v_blocked_reason,
      jsonb_build_object(
        'operation', 'LEASE_RENEW',
        'blocked_reason', v_blocked_reason,
        'master_execution_enabled', v_control.master_execution_enabled,
        'emergency_stop', v_control.emergency_stop,
        'control_version', v_control.version,
        'current_lease_expires_at', v_execution.lease_expires_at
      )
    );

    return query
    select
      v_execution.id,
      v_execution.status::text,
      false,
      false,
      v_blocked_reason,
      v_execution.lease_expires_at,
      v_execution.state_version;

    return;
  end if;

  v_new_expiry := now() + make_interval(mins => p_lease_minutes);

  update public.ops_executions as e
  set
    lease_expires_at = v_new_expiry,
    last_heartbeat_at = now(),
    state_version = e.state_version + 1,
    updated_at = now()
  where e.id = p_execution_id;

  insert into public.ops_execution_events (
    execution_id,
    approval_id,
    idempotency_key,
    event_type,
    actor_user_id,
    previous_status,
    new_status,
    reason,
    metadata
  )
  values (
    v_execution.id,
    v_execution.approval_id,
    v_key,
    'EXECUTING'::public.ops_execution_event_type,
    p_actor_user_id,
    'EXECUTING'::public.ops_execution_status,
    'EXECUTING'::public.ops_execution_status,
    'Execution lease renewed.',
    jsonb_build_object(
      'operation', 'LEASE_RENEW',
      'lease_minutes', p_lease_minutes,
      'lease_expires_at', v_new_expiry,
      'control_version', v_control.version
    )
  );

  select *
  into v_execution
  from public.ops_executions e
  where e.id = p_execution_id;

  return query
  select
    v_execution.id,
    v_execution.status::text,
    true,
    false,
    null::text,
    v_execution.lease_expires_at,
    v_execution.state_version;
end;
$$;

create or replace function public.ops_finish_execution(
  p_execution_id uuid,
  p_outcome text,
  p_idempotency_key text,
  p_actor_user_id uuid,
  p_lease_token uuid,
  p_result_summary jsonb default null,
  p_failure_code text default null,
  p_failure_message text default null
)
returns table (
  execution_id uuid,
  status text,
  finished_new boolean,
  replayed boolean,
  finished_at timestamptz,
  state_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_outcome text;
  v_result jsonb;
  v_failure_code text;
  v_failure_message text;
  v_execution public.ops_executions%rowtype;
  v_event public.ops_execution_events%rowtype;
  v_target_status public.ops_execution_status;
  v_target_event public.ops_execution_event_type;
begin
  if p_actor_user_id is null then
    raise exception 'OPS_CONTROL identity required';
  end if;

  if not public.ops_user_has_permission(p_actor_user_id, 'OPS_CONTROL') then
    raise exception 'OPS_CONTROL permission required';
  end if;

  if p_execution_id is null or p_lease_token is null then
    raise exception 'Execution id and lease token are required';
  end if;

  v_key := trim(coalesce(p_idempotency_key, ''));
  if length(v_key) < 8 or length(v_key) > 200 then
    raise exception 'Execution idempotency key is invalid';
  end if;

  v_outcome := upper(trim(coalesce(p_outcome, '')));

  if v_outcome = 'COMPLETED' then
    v_target_status := 'COMPLETED'::public.ops_execution_status;
    v_target_event := 'COMPLETED'::public.ops_execution_event_type;
  elsif v_outcome = 'FAILED' then
    v_target_status := 'FAILED'::public.ops_execution_status;
    v_target_event := 'FAILED'::public.ops_execution_event_type;
  else
    raise exception 'Execution outcome must be COMPLETED or FAILED';
  end if;

  v_result := p_result_summary;
  if v_result is not null and jsonb_typeof(v_result) <> 'object' then
    raise exception 'Execution result summary must be a JSON object';
  end if;

  v_failure_code := nullif(trim(coalesce(p_failure_code, '')), '');
  v_failure_message := nullif(trim(coalesce(p_failure_message, '')), '');

  if v_target_status = 'COMPLETED'::public.ops_execution_status
     and (v_failure_code is not null or v_failure_message is not null) then
    raise exception 'Completed execution cannot contain failure details';
  end if;

  if v_target_status = 'FAILED'::public.ops_execution_status
     and v_failure_code is null then
    raise exception 'Failed execution requires failure code';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('afuza_execution_transition:' || v_key, 0)
  );

  select *
  into v_event
  from public.ops_execution_events ev
  where ev.idempotency_key = v_key;

  if found then
    if v_event.execution_id is distinct from p_execution_id
       or coalesce(v_event.metadata->>'operation', '') <> 'FINISH'
       or coalesce(v_event.metadata->>'requested_outcome', '') <> v_outcome then
      raise exception 'EXECUTION_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_execution
    from public.ops_executions e
    where e.id = p_execution_id;

    if not found then
      raise exception 'EXECUTION_IDEMPOTENCY_STATE_INCONSISTENT';
    end if;

    return query
    select
      v_execution.id,
      v_execution.status::text,
      false,
      true,
      v_execution.finished_at,
      v_execution.state_version;

    return;
  end if;

  select *
  into v_execution
  from public.ops_executions e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception 'EXECUTION_NOT_FOUND';
  end if;

  if v_execution.status <> 'EXECUTING'::public.ops_execution_status then
    raise exception 'EXECUTION_NOT_EXECUTING';
  end if;

  if v_execution.lease_token is distinct from p_lease_token then
    raise exception 'EXECUTION_LEASE_TOKEN_MISMATCH';
  end if;

  if v_execution.lease_expires_at is null
     or v_execution.lease_expires_at <= now() then
    raise exception 'EXECUTION_LEASE_EXPIRED';
  end if;

  update public.ops_executions as e
  set
    status = v_target_status,
    finished_at = now(),
    result_summary = v_result,
    failure_code = case
      when v_target_status = 'FAILED'::public.ops_execution_status
        then v_failure_code
      else null
    end,
    failure_message = case
      when v_target_status = 'FAILED'::public.ops_execution_status
        then v_failure_message
      else null
    end,
    state_version = e.state_version + 1,
    updated_at = now()
  where e.id = p_execution_id;

  insert into public.ops_execution_events (
    execution_id,
    approval_id,
    idempotency_key,
    event_type,
    actor_user_id,
    previous_status,
    new_status,
    reason,
    metadata
  )
  values (
    v_execution.id,
    v_execution.approval_id,
    v_key,
    v_target_event,
    p_actor_user_id,
    'EXECUTING'::public.ops_execution_status,
    v_target_status,
    case
      when v_target_status = 'COMPLETED'::public.ops_execution_status
        then 'Execution marked completed.'
      else 'Execution marked failed.'
    end,
    jsonb_build_object(
      'operation', 'FINISH',
      'requested_outcome', v_outcome,
      'result_summary', v_result,
      'failure_code', v_failure_code,
      'failure_message', v_failure_message
    )
  );

  select *
  into v_execution
  from public.ops_executions e
  where e.id = p_execution_id;

  return query
  select
    v_execution.id,
    v_execution.status::text,
    true,
    false,
    v_execution.finished_at,
    v_execution.state_version;
end;
$$;

create or replace function public.ops_cancel_execution(
  p_execution_id uuid,
  p_idempotency_key text,
  p_actor_user_id uuid,
  p_reason text
)
returns table (
  execution_id uuid,
  status text,
  cancelled_new boolean,
  replayed boolean,
  finished_at timestamptz,
  state_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_reason text;
  v_execution public.ops_executions%rowtype;
  v_event public.ops_execution_events%rowtype;
  v_previous_status public.ops_execution_status;
begin
  if p_actor_user_id is null then
    raise exception 'OPS_CONTROL identity required';
  end if;

  if not public.ops_user_has_permission(p_actor_user_id, 'OPS_CONTROL') then
    raise exception 'OPS_CONTROL permission required';
  end if;

  if p_execution_id is null then
    raise exception 'Execution id is required';
  end if;

  v_key := trim(coalesce(p_idempotency_key, ''));
  if length(v_key) < 8 or length(v_key) > 200 then
    raise exception 'Execution idempotency key is invalid';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Cancellation reason is required';
  end if;

  if length(v_reason) > 500 then
    raise exception 'Cancellation reason is too long';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('afuza_execution_transition:' || v_key, 0)
  );

  select *
  into v_event
  from public.ops_execution_events ev
  where ev.idempotency_key = v_key;

  if found then
    if v_event.execution_id is distinct from p_execution_id
       or coalesce(v_event.metadata->>'operation', '') <> 'CANCEL' then
      raise exception 'EXECUTION_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_execution
    from public.ops_executions e
    where e.id = p_execution_id;

    if not found then
      raise exception 'EXECUTION_IDEMPOTENCY_STATE_INCONSISTENT';
    end if;

    return query
    select
      v_execution.id,
      v_execution.status::text,
      false,
      true,
      v_execution.finished_at,
      v_execution.state_version;

    return;
  end if;

  select *
  into v_execution
  from public.ops_executions e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception 'EXECUTION_NOT_FOUND';
  end if;

  if v_execution.status not in (
    'PREPARED'::public.ops_execution_status,
    'EXECUTING'::public.ops_execution_status
  ) then
    raise exception 'EXECUTION_NOT_CANCELLABLE';
  end if;

  v_previous_status := v_execution.status;

  update public.ops_executions as e
  set
    status = 'CANCELLED'::public.ops_execution_status,
    finished_at = now(),
    lease_expires_at = case
      when e.status = 'EXECUTING'::public.ops_execution_status
        then now()
      else e.lease_expires_at
    end,
    state_version = e.state_version + 1,
    updated_at = now()
  where e.id = p_execution_id;

  insert into public.ops_execution_events (
    execution_id,
    approval_id,
    idempotency_key,
    event_type,
    actor_user_id,
    previous_status,
    new_status,
    reason,
    metadata
  )
  values (
    v_execution.id,
    v_execution.approval_id,
    v_key,
    'CANCELLED'::public.ops_execution_event_type,
    p_actor_user_id,
    v_previous_status,
    'CANCELLED'::public.ops_execution_status,
    v_reason,
    jsonb_build_object(
      'operation', 'CANCEL',
      'previous_status', v_previous_status::text,
      'external_executor_cancelled', false,
      'safety', 'Control-plane cancellation only in V1B.'
    )
  );

  select *
  into v_execution
  from public.ops_executions e
  where e.id = p_execution_id;

  return query
  select
    v_execution.id,
    v_execution.status::text,
    true,
    false,
    v_execution.finished_at,
    v_execution.state_version;
end;
$$;

create or replace function public.ops_get_execution(
  p_execution_id uuid
)
returns table (
  execution_id uuid,
  approval_id uuid,
  action_type text,
  risk text,
  status text,
  prepared_by uuid,
  prepared_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  executor_type text,
  executor_reference jsonb,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  state_version bigint,
  result_summary jsonb,
  failure_code text,
  failure_message text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    e.id,
    e.approval_id,
    e.action_type,
    e.risk::text,
    e.status::text,
    e.prepared_by,
    e.prepared_at,
    e.started_at,
    e.finished_at,
    e.executor_type,
    e.executor_reference,
    e.lease_expires_at,
    e.last_heartbeat_at,
    e.state_version,
    e.result_summary,
    e.failure_code,
    e.failure_message,
    e.updated_at
  from public.ops_executions e
  where e.id = p_execution_id;
$$;

revoke all
on function public.ops_start_execution(uuid, text, uuid, text, jsonb, integer)
from public, anon, authenticated;
grant execute
on function public.ops_start_execution(uuid, text, uuid, text, jsonb, integer)
to service_role;

revoke all
on function public.ops_renew_execution_lease(uuid, text, uuid, uuid, integer)
from public, anon, authenticated;
grant execute
on function public.ops_renew_execution_lease(uuid, text, uuid, uuid, integer)
to service_role;

revoke all
on function public.ops_finish_execution(uuid, text, text, uuid, uuid, jsonb, text, text)
from public, anon, authenticated;
grant execute
on function public.ops_finish_execution(uuid, text, text, uuid, uuid, jsonb, text, text)
to service_role;

revoke all
on function public.ops_cancel_execution(uuid, text, uuid, text)
from public, anon, authenticated;
grant execute
on function public.ops_cancel_execution(uuid, text, uuid, text)
to service_role;

revoke all
on function public.ops_get_execution(uuid)
from public, anon, authenticated;
grant execute
on function public.ops_get_execution(uuid)
to service_role;

do $$
declare
  v_control public.ops_execution_controls%rowtype;
begin
  select *
  into v_control
  from public.ops_execution_controls c
  where c.singleton_id = true;

  if not found then
    raise exception 'Execution Gate V1B safety assertion failed: control singleton missing';
  end if;

  if v_control.master_execution_enabled then
    raise exception 'Execution Gate V1B safety assertion failed: master execution unexpectedly enabled';
  end if;

  if not v_control.emergency_stop then
    raise exception 'Execution Gate V1B safety assertion failed: emergency stop unexpectedly disabled';
  end if;

  if exists (
    select 1
    from public.ops_executions e
    where e.status <> 'PREPARED'::public.ops_execution_status
       or e.started_at is not null
       or e.finished_at is not null
       or e.executor_type is not null
  ) then
    raise exception 'Execution Gate V1B safety assertion failed: migration changed execution lifecycle state';
  end if;
end
$$;

commit;
