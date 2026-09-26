-- ============================================================================
-- AFUZA OPS EXECUTION GATE V1A
-- Database / Control-Plane Foundation
--
-- SAFETY PRINCIPLES
-- - APPROVED != EXECUTED
-- - No external executor is called by this migration.
-- - Default state: master execution OFF, emergency stop ON.
-- - One approval can produce at most one execution record.
-- - Blocked gate attempts are auditable but do not consume the approval.
-- - PREPARED is only an execution authorization record, not execution.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.ops_approval_requests') is null then
    raise exception 'Execution Gate V1A preflight failed: ops_approval_requests is missing';
  end if;
  if to_regtype('public.ops_approval_status') is null then
    raise exception 'Execution Gate V1A preflight failed: ops_approval_status is missing';
  end if;
  if to_regtype('public.ops_approval_risk') is null then
    raise exception 'Execution Gate V1A preflight failed: ops_approval_risk is missing';
  end if;
  if to_regprocedure('public.ops_user_has_permission(uuid,text)') is null then
    raise exception 'Execution Gate V1A preflight failed: ops_user_has_permission(uuid,text) is missing';
  end if;
  if to_regclass('public.ops_execution_controls') is not null
     or to_regclass('public.ops_executions') is not null
     or to_regclass('public.ops_execution_events') is not null
     or to_regclass('public.ops_execution_control_events') is not null
     or to_regtype('public.ops_execution_status') is not null
     or to_regtype('public.ops_execution_event_type') is not null then
    raise exception 'Execution Gate V1A preflight failed: execution objects already exist and require review';
  end if;
end
$$;

create type public.ops_execution_status as enum (
  'BLOCKED',
  'PREPARED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

create type public.ops_execution_event_type as enum (
  'BLOCKED',
  'PREPARED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

create table public.ops_execution_controls (
  singleton_id boolean primary key default true
    check (singleton_id = true),
  master_execution_enabled boolean not null default false,
  emergency_stop boolean not null default true,
  reason text not null
    default 'Execution Gate V1A safety default: execution disabled and emergency stop active.'
    check (length(reason) between 1 and 500),
  updated_by uuid
    references auth.users(id)
    on delete set null,
  updated_at timestamptz not null default now(),
  version bigint not null default 1
    check (version >= 1)
);

comment on table public.ops_execution_controls is
  'Singleton safety control for AFUZA execution authorization. Default: master OFF, emergency stop ON.';

insert into public.ops_execution_controls (
  singleton_id,
  master_execution_enabled,
  emergency_stop,
  reason
)
values (
  true,
  false,
  true,
  'Execution Gate V1A safety default: execution disabled and emergency stop active.'
);

create table public.ops_executions (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null
    references public.ops_approval_requests(id)
    on delete restrict,
  idempotency_key text not null
    check (length(trim(idempotency_key)) between 8 and 200),
  action_type text not null
    check (length(trim(action_type)) between 1 and 120),
  risk public.ops_approval_risk not null,
  status public.ops_execution_status not null
    default 'PREPARED'::public.ops_execution_status,
  approval_snapshot jsonb not null
    check (jsonb_typeof(approval_snapshot) = 'object'),
  execution_input jsonb not null
    default '{}'::jsonb
    check (jsonb_typeof(execution_input) = 'object'),
  prepared_by uuid not null
    references auth.users(id)
    on delete restrict,
  prepared_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  executor_type text,
  executor_reference jsonb
    check (
      executor_reference is null
      or jsonb_typeof(executor_reference) = 'object'
    ),
  result_summary jsonb
    check (
      result_summary is null
      or jsonb_typeof(result_summary) = 'object'
    ),
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_executions_one_execution_per_approval unique (approval_id),
  constraint ops_executions_idempotency_key_unique unique (idempotency_key)
);

comment on table public.ops_executions is
  'AFUZA execution authorization ledger. V1A creates PREPARED only; no external action is executed.';

comment on column public.ops_executions.status is
  'V1A only creates PREPARED. Later lifecycle transitions are introduced by a separate migration.';

create index ops_executions_status_prepared_idx
  on public.ops_executions(status, prepared_at desc);
create index ops_executions_action_type_idx
  on public.ops_executions(action_type);
create index ops_executions_prepared_by_idx
  on public.ops_executions(prepared_by, prepared_at desc);

create table public.ops_execution_events (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid
    references public.ops_executions(id)
    on delete restrict,
  approval_id uuid not null
    references public.ops_approval_requests(id)
    on delete restrict,
  idempotency_key text
    check (
      idempotency_key is null
      or length(trim(idempotency_key)) between 8 and 200
    ),
  event_type public.ops_execution_event_type not null,
  actor_user_id uuid
    references auth.users(id)
    on delete set null,
  previous_status public.ops_execution_status,
  new_status public.ops_execution_status,
  reason text
    check (reason is null or length(reason) <= 500),
  metadata jsonb not null
    default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint ops_execution_event_shape
    check (
      (
        event_type = 'BLOCKED'::public.ops_execution_event_type
        and execution_id is null
        and new_status = 'BLOCKED'::public.ops_execution_status
      )
      or
      (
        event_type <> 'BLOCKED'::public.ops_execution_event_type
        and execution_id is not null
      )
    )
);

comment on table public.ops_execution_events is
  'Append-only audit trail for execution gate attempts and execution lifecycle.';

create unique index ops_execution_events_idempotency_key_unique
  on public.ops_execution_events(idempotency_key)
  where idempotency_key is not null;
create index ops_execution_events_execution_created_idx
  on public.ops_execution_events(execution_id, created_at asc);
create index ops_execution_events_approval_created_idx
  on public.ops_execution_events(approval_id, created_at asc);
create index ops_execution_events_created_idx
  on public.ops_execution_events(created_at desc);

create table public.ops_execution_control_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in ('INITIALIZED', 'UPDATED')),
  actor_user_id uuid
    references auth.users(id)
    on delete set null,
  previous_master_execution_enabled boolean,
  previous_emergency_stop boolean,
  new_master_execution_enabled boolean not null,
  new_emergency_stop boolean not null,
  reason text not null
    check (length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

comment on table public.ops_execution_control_events is
  'Append-only audit trail for AFUZA execution master-control and emergency-stop changes.';

create index ops_execution_control_events_created_idx
  on public.ops_execution_control_events(created_at desc);

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
  'INITIALIZED',
  null,
  null,
  null,
  false,
  true,
  'Execution Gate V1A initialized with execution disabled and emergency stop active.'
);

create or replace function public.ops_prevent_execution_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Execution audit events are immutable';
end;
$$;

revoke all
on function public.ops_prevent_execution_audit_mutation()
from public, anon, authenticated, service_role;

create trigger ops_execution_events_immutable_trigger
before update or delete
on public.ops_execution_events
for each row
execute function public.ops_prevent_execution_audit_mutation();

create trigger ops_execution_control_events_immutable_trigger
before update or delete
on public.ops_execution_control_events
for each row
execute function public.ops_prevent_execution_audit_mutation();

alter table public.ops_execution_controls enable row level security;
alter table public.ops_executions enable row level security;
alter table public.ops_execution_events enable row level security;
alter table public.ops_execution_control_events enable row level security;

revoke all on table public.ops_execution_controls from public, anon, authenticated;
revoke all on table public.ops_executions from public, anon, authenticated;
revoke all on table public.ops_execution_events from public, anon, authenticated;
revoke all on table public.ops_execution_control_events from public, anon, authenticated;

grant select on table public.ops_execution_controls to service_role;
grant select on table public.ops_executions to service_role;
grant select on table public.ops_execution_events to service_role;
grant select on table public.ops_execution_control_events to service_role;

create or replace function public.ops_get_execution_control()
returns table (
  master_execution_enabled boolean,
  emergency_stop boolean,
  gate_open boolean,
  reason text,
  updated_by uuid,
  updated_at timestamptz,
  version bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    c.master_execution_enabled,
    c.emergency_stop,
    (c.master_execution_enabled and not c.emergency_stop) as gate_open,
    c.reason,
    c.updated_by,
    c.updated_at,
    c.version
  from public.ops_execution_controls c
  where c.singleton_id = true;
$$;

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
  if not public.ops_user_has_permission(p_actor_user_id, 'OPS_ADMIN') then
    raise exception 'OPS_ADMIN permission required';
  end if;
  if p_master_execution_enabled is null or p_emergency_stop is null then
    raise exception 'Execution control state is required';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Execution control reason is required';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Execution control reason is too long';
  end if;

  select * into v_current
  from public.ops_execution_controls
  where singleton_id = true
  for update;

  if not found then
    raise exception 'Execution control singleton is missing';
  end if;

  v_changed :=
    v_current.master_execution_enabled is distinct from p_master_execution_enabled
    or v_current.emergency_stop is distinct from p_emergency_stop;

  if v_changed then
    update public.ops_execution_controls
    set
      master_execution_enabled = p_master_execution_enabled,
      emergency_stop = p_emergency_stop,
      reason = v_reason,
      updated_by = p_actor_user_id,
      updated_at = now(),
      version = version + 1
    where singleton_id = true;

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
    (c.master_execution_enabled and not c.emergency_stop) as gate_open,
    c.reason,
    c.updated_by,
    c.updated_at,
    c.version,
    v_changed
  from public.ops_execution_controls c
  where c.singleton_id = true;
end;
$$;

create or replace function public.ops_prepare_execution(
  p_approval_id uuid,
  p_idempotency_key text,
  p_actor_user_id uuid,
  p_execution_input jsonb default '{}'::jsonb
)
returns table (
  execution_id uuid,
  approval_id uuid,
  status text,
  created_new boolean,
  replayed boolean,
  gate_open boolean,
  blocked_reason text,
  idempotency_key text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_input jsonb;
  v_approval public.ops_approval_requests%rowtype;
  v_control public.ops_execution_controls%rowtype;
  v_existing public.ops_executions%rowtype;
  v_existing_event public.ops_execution_events%rowtype;
  v_existing_by_approval public.ops_executions%rowtype;
  v_execution_id uuid;
  v_snapshot jsonb;
  v_blocked_reason text;
begin
  if p_actor_user_id is null then
    raise exception 'OPS_CONTROL identity required';
  end if;
  if not public.ops_user_has_permission(p_actor_user_id, 'OPS_CONTROL') then
    raise exception 'OPS_CONTROL permission required';
  end if;
  if p_approval_id is null then
    raise exception 'Approval id is required';
  end if;

  v_key := trim(coalesce(p_idempotency_key, ''));
  if length(v_key) < 8 or length(v_key) > 200 then
    raise exception 'Execution idempotency key is invalid';
  end if;

  v_input := coalesce(p_execution_input, '{}'::jsonb);
  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'Execution input must be a JSON object';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('afuza_execution_key:' || v_key, 0)
  );

  select * into v_existing
  from public.ops_executions e
  where e.idempotency_key = v_key;

  if found then
    if v_existing.approval_id <> p_approval_id
       or v_existing.execution_input <> v_input then
      raise exception 'EXECUTION_IDEMPOTENCY_CONFLICT';
    end if;

    return query
    select
      v_existing.id,
      v_existing.approval_id,
      v_existing.status::text,
      false,
      true,
      true,
      null::text,
      v_existing.idempotency_key;
    return;
  end if;

  select * into v_existing_event
  from public.ops_execution_events ev
  where ev.idempotency_key = v_key;

  if found then
    if v_existing_event.approval_id <> p_approval_id
       or coalesce(v_existing_event.metadata->'execution_input', '{}'::jsonb) <> v_input then
      raise exception 'EXECUTION_IDEMPOTENCY_CONFLICT';
    end if;

    if v_existing_event.event_type <> 'BLOCKED'::public.ops_execution_event_type then
      raise exception 'EXECUTION_IDEMPOTENCY_STATE_INCONSISTENT';
    end if;

    return query
    select
      null::uuid,
      v_existing_event.approval_id,
      'BLOCKED'::text,
      false,
      true,
      false,
      v_existing_event.metadata->>'blocked_reason',
      v_existing_event.idempotency_key;
    return;
  end if;

  select * into v_approval
  from public.ops_approval_requests a
  where a.id = p_approval_id
  for update;

  if not found then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;

  select * into v_existing_by_approval
  from public.ops_executions e
  where e.approval_id = p_approval_id;

  if found then
    raise exception 'APPROVAL_ALREADY_HAS_EXECUTION';
  end if;

  select * into v_control
  from public.ops_execution_controls c
  where c.singleton_id = true
  for update;

  if not found then
    raise exception 'EXECUTION_CONTROL_UNAVAILABLE';
  end if;

  if v_approval.status <> 'APPROVED'::public.ops_approval_status then
    v_blocked_reason := 'APPROVAL_NOT_APPROVED';
  elsif v_approval.expires_at is not null and v_approval.expires_at <= now() then
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
      null,
      p_approval_id,
      v_key,
      'BLOCKED'::public.ops_execution_event_type,
      p_actor_user_id,
      null,
      'BLOCKED'::public.ops_execution_status,
      v_blocked_reason,
      jsonb_build_object(
        'blocked_reason', v_blocked_reason,
        'execution_input', v_input,
        'approval_status', v_approval.status::text,
        'approval_execution_enabled', v_approval.execution_enabled,
        'master_execution_enabled', v_control.master_execution_enabled,
        'emergency_stop', v_control.emergency_stop,
        'control_version', v_control.version
      )
    );

    return query
    select
      null::uuid,
      p_approval_id,
      'BLOCKED'::text,
      true,
      false,
      false,
      v_blocked_reason,
      v_key;
    return;
  end if;

  v_snapshot := jsonb_build_object(
    'approval_id', v_approval.id,
    'action_type', v_approval.action_type,
    'title', v_approval.title,
    'requester', v_approval.requester,
    'requester_type', v_approval.requester_type,
    'requester_id', v_approval.requester_id,
    'risk', v_approval.risk::text,
    'status', v_approval.status::text,
    'payload_summary', v_approval.payload_summary,
    'execution_reference', v_approval.execution_reference,
    'created_at', v_approval.created_at,
    'expires_at', v_approval.expires_at,
    'decided_at', v_approval.decided_at,
    'decided_by', v_approval.decided_by,
    'decision_reason', v_approval.decision_reason,
    'approval_execution_enabled', v_approval.execution_enabled
  );

  insert into public.ops_executions (
    approval_id,
    idempotency_key,
    action_type,
    risk,
    status,
    approval_snapshot,
    execution_input,
    prepared_by
  )
  values (
    p_approval_id,
    v_key,
    v_approval.action_type,
    v_approval.risk,
    'PREPARED'::public.ops_execution_status,
    v_snapshot,
    v_input,
    p_actor_user_id
  )
  returning id into v_execution_id;

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
    v_execution_id,
    p_approval_id,
    v_key,
    'PREPARED'::public.ops_execution_event_type,
    p_actor_user_id,
    null,
    'PREPARED'::public.ops_execution_status,
    'Execution authorization prepared. No external action executed.',
    jsonb_build_object(
      'execution_input', v_input,
      'master_execution_enabled', v_control.master_execution_enabled,
      'emergency_stop', v_control.emergency_stop,
      'control_version', v_control.version,
      'safety', 'APPROVED != EXECUTED'
    )
  );

  return query
  select
    v_execution_id,
    p_approval_id,
    'PREPARED'::text,
    true,
    false,
    true,
    null::text,
    v_key;
end;
$$;

create or replace function public.ops_list_executions(p_limit integer default 100)
returns table (
  execution_id uuid,
  approval_id uuid,
  approval_title text,
  action_type text,
  risk text,
  status text,
  idempotency_key text,
  prepared_by uuid,
  prepared_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  executor_type text,
  failure_code text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    e.id,
    e.approval_id,
    a.title,
    e.action_type,
    e.risk::text,
    e.status::text,
    e.idempotency_key,
    e.prepared_by,
    e.prepared_at,
    e.started_at,
    e.finished_at,
    e.executor_type,
    e.failure_code
  from public.ops_executions e
  join public.ops_approval_requests a on a.id = e.approval_id
  order by e.prepared_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.ops_list_execution_events(p_limit integer default 200)
returns table (
  event_id uuid,
  execution_id uuid,
  approval_id uuid,
  idempotency_key text,
  event_type text,
  actor_user_id uuid,
  previous_status text,
  new_status text,
  reason text,
  metadata jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    ev.id,
    ev.execution_id,
    ev.approval_id,
    ev.idempotency_key,
    ev.event_type::text,
    ev.actor_user_id,
    ev.previous_status::text,
    ev.new_status::text,
    ev.reason,
    ev.metadata,
    ev.created_at
  from public.ops_execution_events ev
  order by ev.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.ops_get_execution_control() from public, anon, authenticated;
grant execute on function public.ops_get_execution_control() to service_role;

revoke all on function public.ops_set_execution_control(boolean, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.ops_set_execution_control(boolean, boolean, text, uuid) to service_role;

revoke all on function public.ops_prepare_execution(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ops_prepare_execution(uuid, text, uuid, jsonb) to service_role;

revoke all on function public.ops_list_executions(integer) from public, anon, authenticated;
grant execute on function public.ops_list_executions(integer) to service_role;

revoke all on function public.ops_list_execution_events(integer) from public, anon, authenticated;
grant execute on function public.ops_list_execution_events(integer) to service_role;

do $$
declare
  v_control public.ops_execution_controls%rowtype;
begin
  select * into v_control
  from public.ops_execution_controls
  where singleton_id = true;

  if not found then
    raise exception 'Execution Gate V1A safety assertion failed: control singleton missing';
  end if;
  if v_control.master_execution_enabled then
    raise exception 'Execution Gate V1A safety assertion failed: master execution unexpectedly enabled';
  end if;
  if not v_control.emergency_stop then
    raise exception 'Execution Gate V1A safety assertion failed: emergency stop unexpectedly disabled';
  end if;
  if exists (select 1 from public.ops_executions) then
    raise exception 'Execution Gate V1A safety assertion failed: migration created execution rows';
  end if;
end
$$;

commit;
