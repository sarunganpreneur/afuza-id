-- AFUZA OPS Approval Persistence V1.1 corrective migration.
-- Fixes:
-- 1. Persist stable requester_id.
-- 2. Expired decision persists EXPIRED state and audit event without rollback.
-- No external execution is enabled.

begin;

drop function if exists public.ops_create_approval(
  text, text, text, text, text, jsonb, jsonb, timestamptz, uuid
);

create or replace function public.ops_create_approval(
  p_action_type text,
  p_title text,
  p_requester text,
  p_requester_type text,
  p_requester_id text,
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
    requester_id,
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
    nullif(trim(p_requester_id), ''),
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
    nullif(trim(p_requester_id), ''),
    p_created_by,
    null,
    'PENDING'::public.ops_approval_status,
    jsonb_build_object(
      'action_type', trim(p_action_type),
      'risk', v_risk::text,
      'requester', trim(p_requester)
    )
  );

  return v_id;
end;
$$;

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

    return query
      select
        r.id,
        r.status,
        r.decided_at,
        r.execution_enabled
      from public.ops_approval_requests r
      where r.id = p_approval_id;

    return;
  end if;

  if upper(trim(p_decision)) = 'APPROVED' then
    v_new_status := 'APPROVED'::public.ops_approval_status;
  elsif upper(trim(p_decision)) = 'REJECTED' then
    v_new_status := 'REJECTED'::public.ops_approval_status;
  else
    raise exception 'Approval decision is invalid';
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

revoke all on function public.ops_create_approval(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function public.ops_create_approval(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz, uuid
) to service_role;

revoke all on function public.ops_decide_approval(
  uuid, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.ops_decide_approval(
  uuid, text, text, uuid
) to service_role;

commit;
