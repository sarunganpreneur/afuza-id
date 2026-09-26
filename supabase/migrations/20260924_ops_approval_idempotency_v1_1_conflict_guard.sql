-- AFUZA OPS Approval Idempotency V1.1.
-- Adds semantic conflict detection:
-- same key + same request     => safe replay
-- same key + different request => reject
-- Does NOT enable execution.

begin;

create or replace function public.ops_create_approval(
  p_action_type text,
  p_title text,
  p_requester text,
  p_requester_type text,
  p_requester_id text,
  p_risk text,
  p_idempotency_key text,
  p_payload_summary jsonb default '{}'::jsonb,
  p_execution_reference jsonb default null,
  p_expires_at timestamptz default null,
  p_created_by uuid default null
)
returns table (
  approval_id uuid,
  created_new boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_risk public.ops_approval_risk;
  v_key text;
  v_requester_id text;
  v_existing public.ops_approval_requests%rowtype;
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

  v_key := nullif(trim(p_idempotency_key), '');
  v_requester_id := nullif(trim(p_requester_id), '');

  if v_key is null
     or length(v_key) < 8
     or length(v_key) > 200 then
    raise exception 'Approval idempotency key is invalid';
  end if;

  if p_payload_summary is null
     or jsonb_typeof(p_payload_summary) <> 'object' then
    raise exception 'Approval payload summary is invalid';
  end if;

  if p_execution_reference is not null
     and jsonb_typeof(p_execution_reference) <> 'object' then
    raise exception 'Approval execution reference is invalid';
  end if;

  if p_expires_at is not null
     and p_expires_at <= now() then
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
    execution_enabled,
    idempotency_key
  )
  values (
    trim(p_action_type),
    trim(p_title),
    trim(p_requester),
    p_requester_type,
    v_requester_id,
    v_risk,
    p_payload_summary,
    p_execution_reference,
    p_expires_at,
    p_created_by,
    false,
    v_key
  )
  on conflict (idempotency_key)
  do nothing
  returning id into v_id;

  if v_id is null then
    select *
      into v_existing
      from public.ops_approval_requests r
     where r.idempotency_key = v_key;

    if v_existing.id is null then
      raise exception 'Approval idempotency resolution failed';
    end if;

    if v_existing.action_type is distinct from trim(p_action_type)
       or v_existing.title is distinct from trim(p_title)
       or v_existing.requester is distinct from trim(p_requester)
       or v_existing.requester_type is distinct from p_requester_type
       or v_existing.requester_id is distinct from v_requester_id
       or v_existing.risk is distinct from v_risk
       or v_existing.payload_summary is distinct from p_payload_summary
       or v_existing.execution_reference is distinct from p_execution_reference
       or v_existing.expires_at is distinct from p_expires_at
       or v_existing.created_by is distinct from p_created_by then
      raise exception 'Approval idempotency key conflict';
    end if;

    return query
      select v_existing.id, false;

    return;
  end if;

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
    v_requester_id,
    p_created_by,
    null,
    'PENDING'::public.ops_approval_status,
    jsonb_build_object(
      'action_type', trim(p_action_type),
      'risk', v_risk::text,
      'requester', trim(p_requester),
      'idempotency_key', v_key
    )
  );

  return query
    select v_id, true;
end;
$$;

revoke all on function public.ops_create_approval(
  text, text, text, text, text, text, text,
  jsonb, jsonb, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function public.ops_create_approval(
  text, text, text, text, text, text, text,
  jsonb, jsonb, timestamptz, uuid
) to service_role;

commit;
