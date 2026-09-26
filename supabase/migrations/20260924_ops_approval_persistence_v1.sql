-- AFUZA OPS Approval Persistence V1.
-- Migration file only: review and apply through the approved database process.
-- This migration creates approval persistence + immutable audit trail.
-- It does NOT execute approved actions.
--
-- Rollback:
--   drop function if exists public.ops_decide_approval(uuid, text, text, uuid);
--   drop function if exists public.ops_create_approval(text, text, text, text, text, jsonb, jsonb, timestamptz, uuid);
--   drop table if exists public.ops_approval_events;
--   drop table if exists public.ops_approval_requests;
--   drop type if exists public.ops_approval_event_type;
--   drop type if exists public.ops_approval_status;
--   drop type if exists public.ops_approval_risk;

begin;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ops_approval_risk'
  ) then
    create type public.ops_approval_risk as enum (
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ops_approval_status'
  ) then
    create type public.ops_approval_status as enum (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'EXPIRED'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ops_approval_event_type'
  ) then
    create type public.ops_approval_event_type as enum (
      'CREATED',
      'APPROVED',
      'REJECTED',
      'EXPIRED'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- APPROVAL REQUESTS
-- ---------------------------------------------------------------------------

create table if not exists public.ops_approval_requests (
  id uuid primary key default gen_random_uuid(),

  action_type text not null
    check (length(trim(action_type)) between 1 and 120),

  title text not null
    check (length(trim(title)) between 1 and 240),

  requester text not null
    check (length(trim(requester)) between 1 and 240),

  requester_type text not null
    check (requester_type in ('USER', 'AGENT', 'SYSTEM')),

  requester_id text,

  risk public.ops_approval_risk not null,

  status public.ops_approval_status not null
    default 'PENDING',

  payload_summary jsonb not null
    default '{}'::jsonb
    check (jsonb_typeof(payload_summary) = 'object'),

  execution_reference jsonb
    check (
      execution_reference is null
      or jsonb_typeof(execution_reference) = 'object'
    ),

  created_by uuid references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  expires_at timestamptz,

  decided_at timestamptz,

  decided_by uuid references auth.users(id)
    on delete set null,

  decision_reason text,

  execution_enabled boolean not null default false,

  constraint ops_approval_decision_consistency
    check (
      (
        status = 'PENDING'
        and decided_at is null
        and decided_by is null
      )
      or
      (
        status in ('APPROVED', 'REJECTED')
        and decided_at is not null
        and decided_by is not null
      )
      or
      (
        status = 'EXPIRED'
        and decided_at is not null
      )
    ),

  constraint ops_approval_expiry_after_creation
    check (
      expires_at is null
      or expires_at > created_at
    )
);

comment on table public.ops_approval_requests is
  'AFUZA OPS approval requests. Approval alone never executes an external action.';

comment on column public.ops_approval_requests.execution_enabled is
  'Safety lock. V1 always false; approval state must not directly trigger execution.';

create index if not exists ops_approval_requests_status_created_idx
  on public.ops_approval_requests(status, created_at desc);

create index if not exists ops_approval_requests_risk_status_idx
  on public.ops_approval_requests(risk, status);

create index if not exists ops_approval_requests_action_type_idx
  on public.ops_approval_requests(action_type);

create index if not exists ops_approval_requests_requester_idx
  on public.ops_approval_requests(requester_type, requester_id);

-- ---------------------------------------------------------------------------
-- IMMUTABLE APPROVAL AUDIT EVENTS
-- ---------------------------------------------------------------------------

create table if not exists public.ops_approval_events (
  id uuid primary key default gen_random_uuid(),

  approval_id uuid not null
    references public.ops_approval_requests(id)
    on delete restrict,

  event_type public.ops_approval_event_type not null,

  actor_type text not null
    check (actor_type in ('USER', 'AGENT', 'SYSTEM')),

  actor_id text,

  actor_user_id uuid references auth.users(id)
    on delete set null,

  previous_status public.ops_approval_status,

  new_status public.ops_approval_status not null,

  reason text,

  metadata jsonb not null
    default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),

  created_at timestamptz not null default now()
);

comment on table public.ops_approval_events is
  'Append-only audit trail for AFUZA OPS approval lifecycle.';

create index if not exists ops_approval_events_approval_created_idx
  on public.ops_approval_events(approval_id, created_at asc);

create index if not exists ops_approval_events_created_idx
  on public.ops_approval_events(created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- No direct client reads/writes in V1.
-- Access occurs through trusted server-side service role only.
-- ---------------------------------------------------------------------------

alter table public.ops_approval_requests enable row level security;
alter table public.ops_approval_events enable row level security;

revoke all on table public.ops_approval_requests
  from public, anon, authenticated;

revoke all on table public.ops_approval_events
  from public, anon, authenticated;

grant select, insert, update on table public.ops_approval_requests
  to service_role;

grant select, insert on table public.ops_approval_events
  to service_role;

-- ---------------------------------------------------------------------------
-- CREATE APPROVAL RPC
-- Trusted server-side use only.
-- ---------------------------------------------------------------------------

create or replace function public.ops_create_approval(
  p_action_type text,
  p_title text,
  p_requester text,
  p_requester_type text,
  p_risk text,
  p_payload_summary jsonb default '{}'::jsonb,
  p_execution_reference jsonb default null,
  p_expires_at timestamptz default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_risk public.ops_approval_risk;
begin
  if nullif(trim(p_action_type), '') is null
     or nullif(trim(p_title), '') is null
     or nullif(trim(p_requester), '') is null then
    raise exception 'Approval request identity is required';
  end if;

  if p_requester_type not in ('USER', 'AGENT', 'SYSTEM') then
    raise exception 'Approval requester type is invalid';
  end if;

  begin
    v_risk := upper(trim(p_risk))::public.ops_approval_risk;
  exception when others then
    raise exception 'Approval risk is invalid';
  end;

  if p_payload_summary is null
     or jsonb_typeof(p_payload_summary) <> 'object' then
    raise exception 'Approval payload summary is invalid';
  end if;

  if p_execution_reference is not null
     and jsonb_typeof(p_execution_reference) <> 'object' then
    raise exception 'Approval execution reference is invalid';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Approval expiry must be in the future';
  end if;

  insert into public.ops_approval_requests (
    action_type,
    title,
    requester,
    requester_type,
    risk,
    payload_summary,
    execution_reference,
    expires_at,
    created_by,
    execution_enabled
  )
  values (
    trim(p_action_type),
    trim(p_title),
    trim(p_requester),
    p_requester_type,
    v_risk,
    p_payload_summary,
    p_execution_reference,
    p_expires_at,
    p_created_by,
    false
  )
  returning id into v_id;

  insert into public.ops_approval_events (
    approval_id,
    event_type,
    actor_type,
    actor_id,
    actor_user_id,
    previous_status,
    new_status,
    metadata
  )
  values (
    v_id,
    'CREATED'::public.ops_approval_event_type,
    p_requester_type,
    p_requester,
    p_created_by,
    null,
    'PENDING'::public.ops_approval_status,
    jsonb_build_object(
      'action_type', trim(p_action_type),
      'risk', v_risk::text
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- DECISION RPC
-- APPROVED / REJECTED only.
-- Still does NOT execute external action.
-- ---------------------------------------------------------------------------

create or replace function public.ops_decide_approval(
  p_approval_id uuid,
  p_decision text,
  p_reason text,
  p_decided_by uuid
)
returns table (
  approval_id uuid,
  status public.ops_approval_status,
  decided_at timestamptz,
  execution_enabled boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current public.ops_approval_requests%rowtype;
  v_new_status public.ops_approval_status;
  v_now timestamptz := now();
begin
  if p_approval_id is null or p_decided_by is null then
    raise exception 'Approval decision identity is required';
  end if;

  if upper(trim(p_decision)) = 'APPROVED' then
    v_new_status := 'APPROVED'::public.ops_approval_status;
  elsif upper(trim(p_decision)) = 'REJECTED' then
    v_new_status := 'REJECTED'::public.ops_approval_status;
  else
    raise exception 'Approval decision is invalid';
  end if;

  select *
    into v_current
    from public.ops_approval_requests
   where id = p_approval_id
   for update;

  if v_current.id is null then
    raise exception 'Approval request not found';
  end if;

  if v_current.status <> 'PENDING'::public.ops_approval_status then
    raise exception 'Approval request is not pending';
  end if;

  if v_current.expires_at is not null
     and v_current.expires_at <= v_now then

    update public.ops_approval_requests
       set status = 'EXPIRED'::public.ops_approval_status,
           decided_at = v_now,
           decision_reason = 'Expired before decision',
           execution_enabled = false
     where id = p_approval_id;

    insert into public.ops_approval_events (
      approval_id,
      event_type,
      actor_type,
      actor_user_id,
      previous_status,
      new_status,
      reason
    )
    values (
      p_approval_id,
      'EXPIRED'::public.ops_approval_event_type,
      'SYSTEM',
      p_decided_by,
      'PENDING'::public.ops_approval_status,
      'EXPIRED'::public.ops_approval_status,
      'Expired before decision'
    );

    raise exception 'Approval request has expired';
  end if;

  update public.ops_approval_requests
     set status = v_new_status,
         decided_at = v_now,
         decided_by = p_decided_by,
         decision_reason = nullif(trim(p_reason), ''),
         execution_enabled = false
   where id = p_approval_id;

  insert into public.ops_approval_events (
    approval_id,
    event_type,
    actor_type,
    actor_user_id,
    previous_status,
    new_status,
    reason
  )
  values (
    p_approval_id,
    case
      when v_new_status = 'APPROVED'::public.ops_approval_status
        then 'APPROVED'::public.ops_approval_event_type
      else 'REJECTED'::public.ops_approval_event_type
    end,
    'USER',
    p_decided_by,
    'PENDING'::public.ops_approval_status,
    v_new_status,
    nullif(trim(p_reason), '')
  );

  return query
    select
      r.id,
      r.status,
      r.decided_at,
      r.execution_enabled
    from public.ops_approval_requests r
    where r.id = p_approval_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC permissions
-- ---------------------------------------------------------------------------

revoke all on function public.ops_create_approval(
  text, text, text, text, text, jsonb, jsonb, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function public.ops_create_approval(
  text, text, text, text, text, jsonb, jsonb, timestamptz, uuid
) to service_role;

revoke all on function public.ops_decide_approval(
  uuid, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.ops_decide_approval(
  uuid, text, text, uuid
) to service_role;

commit;
