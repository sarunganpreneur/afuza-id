-- ============================================================================
-- AFUZA OPS ACCESS / TEAM MANAGEMENT V1
--
-- Adds:
--   - one active Ops role per user
--   - immutable access audit log
--   - safe role assignment RPC
--   - safe role revocation RPC
--   - team / matrix / audit read RPCs
--   - last OWNER protection
--
-- Does NOT:
--   - create auth users
--   - change passwords
--   - delete users
--   - modify profiles.role
--   - enable execution
-- ============================================================================

begin;


-- ============================================================================
-- PRE-FLIGHT SAFETY
-- ============================================================================

do $$
begin
  if exists (
    select 1
    from public.ops_user_roles
    where revoked_at is null
    group by user_id
    having count(*) > 1
  ) then
    raise exception
      'OPS RBAC preflight failed: user with multiple active roles exists';
  end if;

  if exists (
    select 1
    from public.ops_user_roles ur
    join public.profiles p
      on p.id = ur.user_id
    where ur.revoked_at is null
      and p.account_status::text = 'DISABLED'
  ) then
    raise exception
      'OPS RBAC preflight failed: disabled user has active Ops access';
  end if;

  if not exists (
    select 1
    from public.ops_user_roles
    where role_code = 'OWNER'
      and revoked_at is null
  ) then
    raise exception
      'OPS RBAC preflight failed: no active OWNER exists';
  end if;
end
$$;


-- ============================================================================
-- ONE ACTIVE ROLE PER USER
-- ============================================================================

create unique index if not exists
  ops_user_roles_one_active_role_per_user_idx
on public.ops_user_roles(user_id)
where revoked_at is null;


-- ============================================================================
-- IMMUTABLE ACCESS AUDIT LOG
-- ============================================================================

create table if not exists public.ops_access_events (
  id bigint
    generated always as identity
    primary key,

  event_type text not null,

  target_user_id uuid not null
    references auth.users(id)
    on delete restrict,

  actor_user_id uuid
    references auth.users(id)
    on delete set null,

  previous_role text,

  new_role text,

  reason text,

  metadata jsonb
    not null
    default '{}'::jsonb,

  created_at timestamptz
    not null
    default now(),

  constraint ops_access_events_type_check
    check (
      event_type in (
        'ASSIGNED',
        'ROLE_CHANGED',
        'REVOKED'
      )
    ),

  constraint ops_access_events_reason_length
    check (
      reason is null
      or length(reason) <= 500
    ),

  constraint ops_access_events_metadata_object
    check (
      jsonb_typeof(metadata) = 'object'
    )
);


alter table public.ops_access_events
  enable row level security;


revoke all
on table public.ops_access_events
from public, anon, authenticated;


grant select, insert
on table public.ops_access_events
to service_role;


-- ============================================================================
-- IMMUTABILITY TRIGGER
-- ============================================================================

create or replace function public.ops_prevent_access_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception
    'Ops access events are immutable';
end;
$$;


revoke all
on function public.ops_prevent_access_event_mutation()
from public, anon, authenticated;

grant execute
on function public.ops_prevent_access_event_mutation()
to service_role;


do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname =
      'ops_access_events_immutable_trigger'
      and tgrelid =
        'public.ops_access_events'::regclass
      and not tgisinternal
  ) then
    create trigger
      ops_access_events_immutable_trigger
    before update or delete
    on public.ops_access_events
    for each row
    execute function
      public.ops_prevent_access_event_mutation();
  end if;
end
$$;


-- ============================================================================
-- TEAM SNAPSHOT
-- ============================================================================

create or replace function public.ops_list_team()
returns table (
  user_id uuid,
  email text,
  full_name text,
  account_status text,
  role_code text,
  assigned_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    ur.user_id,
    p.email,
    p.full_name,
    p.account_status::text,
    ur.role_code,
    ur.assigned_at

  from public.ops_user_roles ur

  join public.profiles p
    on p.id = ur.user_id

  where ur.revoked_at is null

  order by
    case ur.role_code
      when 'OWNER' then 1
      when 'APPROVER' then 2
      when 'OPERATOR' then 3
      when 'OBSERVER' then 4
      else 99
    end,
    p.email;
$$;


revoke all
on function public.ops_list_team()
from public, anon, authenticated;

grant execute
on function public.ops_list_team()
to service_role;


-- ============================================================================
-- ROLE MATRIX
-- ============================================================================

create or replace function public.ops_role_matrix()
returns table (
  role_code text,
  role_name text,
  permission_code text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    r.code,
    r.name,
    rp.permission_code

  from public.ops_roles r

  left join public.ops_role_permissions rp
    on rp.role_code = r.code

  order by
    r.code,
    rp.permission_code;
$$;


revoke all
on function public.ops_role_matrix()
from public, anon, authenticated;

grant execute
on function public.ops_role_matrix()
to service_role;


-- ============================================================================
-- ACCESS AUDIT HISTORY
-- ============================================================================

create or replace function public.ops_list_access_events(
  p_limit integer default 100
)
returns table (
  id bigint,
  event_type text,
  target_user_id uuid,
  target_email text,
  actor_user_id uuid,
  actor_email text,
  previous_role text,
  new_role text,
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
    e.id,
    e.event_type,
    e.target_user_id,
    tp.email,
    e.actor_user_id,
    ap.email,
    e.previous_role,
    e.new_role,
    e.reason,
    e.metadata,
    e.created_at

  from public.ops_access_events e

  left join public.profiles tp
    on tp.id = e.target_user_id

  left join public.profiles ap
    on ap.id = e.actor_user_id

  order by e.created_at desc

  limit greatest(
    1,
    least(
      coalesce(p_limit, 100),
      500
    )
  );
$$;


revoke all
on function public.ops_list_access_events(integer)
from public, anon, authenticated;

grant execute
on function public.ops_list_access_events(integer)
to service_role;


-- ============================================================================
-- ASSIGN / CHANGE ROLE
--
-- Input:
--   email of an EXISTING Afuza user
--   role code
--   authenticated Ops admin UUID
--
-- Defense in depth:
--   actor must have OPS_ADMIN in database.
-- ============================================================================

create or replace function public.ops_assign_role_by_email(
  p_email text,
  p_role_code text,
  p_actor_user_id uuid,
  p_reason text default null
)
returns table (
  target_user_id uuid,
  target_email text,
  previous_role text,
  new_role text,
  changed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_id uuid;
  v_target_email text;
  v_account_status text;
  v_role text;
  v_previous_role text;
  v_owner_count integer;
  v_reason text;
begin
  if not public.ops_user_has_permission(
    p_actor_user_id,
    'OPS_ADMIN'
  ) then
    raise exception
      'OPS_ADMIN permission required';
  end if;

  if nullif(trim(p_email), '') is null then
    raise exception
      'Target email is required';
  end if;

  v_role :=
    upper(
      trim(
        coalesce(
          p_role_code,
          ''
        )
      )
    );

  if not exists (
    select 1
    from public.ops_roles
    where code = v_role
  ) then
    raise exception
      'Unknown Ops role';
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

  if v_reason is not null
     and length(v_reason) > 500 then
    raise exception
      'Reason is too long';
  end if;

  select
    p.id,
    p.email,
    p.account_status::text
  into
    v_target_id,
    v_target_email,
    v_account_status
  from public.profiles p
  where lower(p.email) =
    lower(trim(p_email))
  for update;

  if v_target_id is null then
    raise exception
      'Afuza user not found';
  end if;

  if v_account_status = 'DISABLED' then
    raise exception
      'Disabled account cannot receive Ops access';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'afuza_ops_user:' ||
      v_target_id::text,
      0
    )
  );

  select ur.role_code
  into v_previous_role
  from public.ops_user_roles ur
  where ur.user_id = v_target_id
    and ur.revoked_at is null;

  if v_previous_role = v_role then
    return query
    select
      v_target_id,
      v_target_email,
      v_previous_role,
      v_role,
      false;

    return;
  end if;

  /*
   * Demoting an OWNER requires
   * another active OWNER.
   */
  if v_previous_role = 'OWNER'
     and v_role <> 'OWNER' then

    perform pg_advisory_xact_lock(
      hashtextextended(
        'afuza_ops_owner_guard',
        0
      )
    );

    select count(*)
    into v_owner_count
    from public.ops_user_roles
    where role_code = 'OWNER'
      and revoked_at is null;

    if v_owner_count <= 1 then
      raise exception
        'LAST_OWNER_PROTECTED';
    end if;
  end if;

  if v_previous_role is not null then
    update public.ops_user_roles
    set
      revoked_at = now(),
      revoked_by = p_actor_user_id
    where user_id = v_target_id
      and revoked_at is null;
  end if;

  insert into public.ops_user_roles (
    user_id,
    role_code,
    assigned_by,
    assigned_at,
    revoked_at,
    revoked_by
  )
  values (
    v_target_id,
    v_role,
    p_actor_user_id,
    now(),
    null,
    null
  )
  on conflict (
    user_id,
    role_code
  )
  do update set
    assigned_by =
      excluded.assigned_by,

    assigned_at =
      excluded.assigned_at,

    revoked_at =
      null,

    revoked_by =
      null;

  insert into public.ops_access_events (
    event_type,
    target_user_id,
    actor_user_id,
    previous_role,
    new_role,
    reason,
    metadata
  )
  values (
    case
      when v_previous_role is null
        then 'ASSIGNED'
      else 'ROLE_CHANGED'
    end,
    v_target_id,
    p_actor_user_id,
    v_previous_role,
    v_role,
    v_reason,
    jsonb_build_object(
      'source',
      'OPS_TEAM_MANAGEMENT_V1'
    )
  );

  return query
  select
    v_target_id,
    v_target_email,
    v_previous_role,
    v_role,
    true;
end;
$$;


revoke all
on function public.ops_assign_role_by_email(
  text,
  text,
  uuid,
  text
)
from public, anon, authenticated;

grant execute
on function public.ops_assign_role_by_email(
  text,
  text,
  uuid,
  text
)
to service_role;


-- ============================================================================
-- REVOKE ACTIVE ROLE
-- ============================================================================

create or replace function public.ops_revoke_role(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
)
returns table (
  target_user_id uuid,
  previous_role text,
  revoked boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous_role text;
  v_owner_count integer;
  v_reason text;
begin
  if not public.ops_user_has_permission(
    p_actor_user_id,
    'OPS_ADMIN'
  ) then
    raise exception
      'OPS_ADMIN permission required';
  end if;

  if p_target_user_id is null then
    raise exception
      'Target user is required';
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

  if v_reason is not null
     and length(v_reason) > 500 then
    raise exception
      'Reason is too long';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'afuza_ops_user:' ||
      p_target_user_id::text,
      0
    )
  );

  select ur.role_code
  into v_previous_role
  from public.ops_user_roles ur
  where ur.user_id =
    p_target_user_id
    and ur.revoked_at is null;

  if v_previous_role is null then
    return query
    select
      p_target_user_id,
      null::text,
      false;

    return;
  end if;

  if v_previous_role = 'OWNER' then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'afuza_ops_owner_guard',
        0
      )
    );

    select count(*)
    into v_owner_count
    from public.ops_user_roles
    where role_code = 'OWNER'
      and revoked_at is null;

    if v_owner_count <= 1 then
      raise exception
        'LAST_OWNER_PROTECTED';
    end if;
  end if;

  update public.ops_user_roles
  set
    revoked_at = now(),
    revoked_by =
      p_actor_user_id
  where user_id =
    p_target_user_id
    and revoked_at is null;

  insert into public.ops_access_events (
    event_type,
    target_user_id,
    actor_user_id,
    previous_role,
    new_role,
    reason,
    metadata
  )
  values (
    'REVOKED',
    p_target_user_id,
    p_actor_user_id,
    v_previous_role,
    null,
    v_reason,
    jsonb_build_object(
      'source',
      'OPS_TEAM_MANAGEMENT_V1'
    )
  );

  return query
  select
    p_target_user_id,
    v_previous_role,
    true;
end;
$$;


revoke all
on function public.ops_revoke_role(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;

grant execute
on function public.ops_revoke_role(
  uuid,
  uuid,
  text
)
to service_role;


commit;
