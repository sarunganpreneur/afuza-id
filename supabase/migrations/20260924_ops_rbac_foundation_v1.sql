-- ============================================================================
-- AFUZA OPS RBAC FOUNDATION V1
--
-- Separate fine-grained Ops authorization layer.
--
-- Does NOT modify:
--   - profiles.role
--   - public.is_admin()
--   - existing application authorization
--   - OPS_ALLOWED_EMAILS
--   - approval execution state
--
-- Application integration will be performed only after this foundation
-- has been applied, verified, and an initial OWNER has been explicitly assigned.
-- ============================================================================

begin;


-- ============================================================================
-- ROLES
-- ============================================================================

create table if not exists public.ops_roles (
  code text primary key,

  name text not null,

  description text,

  is_system boolean not null default true,

  created_at timestamptz not null default now(),

  constraint ops_roles_code_format
    check (
      code ~ '^[A-Z][A-Z0-9_]{1,63}$'
    )
);


-- ============================================================================
-- PERMISSIONS
-- ============================================================================

create table if not exists public.ops_permissions (
  code text primary key,

  name text not null,

  description text,

  created_at timestamptz not null default now(),

  constraint ops_permissions_code_format
    check (
      code ~ '^OPS_[A-Z0-9_]{1,59}$'
    )
);


-- ============================================================================
-- ROLE → PERMISSION
-- ============================================================================

create table if not exists public.ops_role_permissions (
  role_code text not null
    references public.ops_roles(code)
    on update cascade
    on delete cascade,

  permission_code text not null
    references public.ops_permissions(code)
    on update cascade
    on delete cascade,

  created_at timestamptz not null default now(),

  primary key (
    role_code,
    permission_code
  )
);


-- ============================================================================
-- USER → ROLE
--
-- A revoked assignment remains auditable.
-- Re-assignment may reactivate the same row later.
-- ============================================================================

create table if not exists public.ops_user_roles (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  role_code text not null
    references public.ops_roles(code)
    on update cascade
    on delete restrict,

  assigned_by uuid
    references auth.users(id)
    on delete set null,

  assigned_at timestamptz not null default now(),

  revoked_at timestamptz,

  revoked_by uuid
    references auth.users(id)
    on delete set null,

  primary key (
    user_id,
    role_code
  ),

  constraint ops_user_roles_revocation_consistency
    check (
      (
        revoked_at is null
        and revoked_by is null
      )
      or revoked_at is not null
    )
);


create index if not exists
  ops_user_roles_active_user_idx
on public.ops_user_roles(user_id)
where revoked_at is null;


create index if not exists
  ops_role_permissions_permission_idx
on public.ops_role_permissions(permission_code);


-- ============================================================================
-- SYSTEM PERMISSIONS
-- ============================================================================

insert into public.ops_permissions (
  code,
  name,
  description
)
values
  (
    'OPS_ACCESS',
    'Ops Access',
    'Access the Afuza Ops command center and read authorized operational data.'
  ),
  (
    'OPS_APPROVE',
    'Ops Approval',
    'Approve or reject protected Ops approval requests.'
  ),
  (
    'OPS_CONTROL',
    'Ops Control',
    'Use authorized operational control actions after all required safety gates.'
  ),
  (
    'OPS_ADMIN',
    'Ops Administration',
    'Manage Ops roles, permissions, membership, and authorization policy.'
  )
on conflict (code)
do update set
  name = excluded.name,
  description = excluded.description;


-- ============================================================================
-- SYSTEM ROLES
-- ============================================================================

insert into public.ops_roles (
  code,
  name,
  description,
  is_system
)
values
  (
    'OWNER',
    'Owner',
    'Full Afuza Ops authority.',
    true
  ),
  (
    'APPROVER',
    'Approver',
    'May access Ops and make approval decisions.',
    true
  ),
  (
    'OPERATOR',
    'Operator',
    'May access Ops and use authorized operational controls.',
    true
  ),
  (
    'OBSERVER',
    'Observer',
    'Read-only access to Afuza Ops.',
    true
  )
on conflict (code)
do update set
  name = excluded.name,
  description = excluded.description,
  is_system = true;


-- ============================================================================
-- SYSTEM ROLE MAPPING
-- ============================================================================

insert into public.ops_role_permissions (
  role_code,
  permission_code
)
values

  -- OWNER
  ('OWNER', 'OPS_ACCESS'),
  ('OWNER', 'OPS_APPROVE'),
  ('OWNER', 'OPS_CONTROL'),
  ('OWNER', 'OPS_ADMIN'),

  -- APPROVER
  ('APPROVER', 'OPS_ACCESS'),
  ('APPROVER', 'OPS_APPROVE'),

  -- OPERATOR
  ('OPERATOR', 'OPS_ACCESS'),
  ('OPERATOR', 'OPS_CONTROL'),

  -- OBSERVER
  ('OBSERVER', 'OPS_ACCESS')

on conflict (
  role_code,
  permission_code
)
do nothing;


-- ============================================================================
-- RLS
--
-- No direct browser access.
-- Trusted server-side operations use service_role.
-- Authenticated users receive permission answers only through the
-- security-definer helper below.
-- ============================================================================

alter table public.ops_roles
  enable row level security;

alter table public.ops_permissions
  enable row level security;

alter table public.ops_role_permissions
  enable row level security;

alter table public.ops_user_roles
  enable row level security;


revoke all
on table public.ops_roles
from public, anon, authenticated;

revoke all
on table public.ops_permissions
from public, anon, authenticated;

revoke all
on table public.ops_role_permissions
from public, anon, authenticated;

revoke all
on table public.ops_user_roles
from public, anon, authenticated;


grant select, insert, update, delete
on table public.ops_roles
to service_role;

grant select, insert, update, delete
on table public.ops_permissions
to service_role;

grant select, insert, update, delete
on table public.ops_role_permissions
to service_role;

grant select, insert, update, delete
on table public.ops_user_roles
to service_role;


-- ============================================================================
-- INTERNAL USER PERMISSION CHECK
--
-- Service-role callable.
-- Explicit user ID makes this suitable for trusted server-side authorization.
--
-- This function deliberately does NOT use profiles.role = ADMIN.
-- Ops permission remains independent from the application's coarse global role.
-- ============================================================================

create or replace function public.ops_user_has_permission(
  p_user_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p_user_id is not null

    and exists (
      select 1

      from public.ops_user_roles ur

      join public.ops_role_permissions rp
        on rp.role_code = ur.role_code

      join public.profiles p
        on p.id = ur.user_id

      where ur.user_id = p_user_id

        and ur.revoked_at is null

        and p.account_status <> 'DISABLED'

        and rp.permission_code =
          upper(trim(p_permission))
    );
$$;


revoke all
on function public.ops_user_has_permission(
  uuid,
  text
)
from public, anon, authenticated;

grant execute
on function public.ops_user_has_permission(
  uuid,
  text
)
to service_role;


-- ============================================================================
-- CURRENT AUTHENTICATED USER PERMISSION CHECK
--
-- Used later by authenticated server/browser-session authorization.
-- Does not disclose role tables.
-- ============================================================================

create or replace function public.has_ops_permission(
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    auth.uid() is not null

    and public.ops_user_has_permission(
      auth.uid(),
      p_permission
    );
$$;


revoke all
on function public.has_ops_permission(text)
from public, anon;

grant execute
on function public.has_ops_permission(text)
to authenticated, service_role;


comment on function public.has_ops_permission(text) is
  'Returns whether the currently authenticated user has an active Afuza Ops permission.';


comment on function public.ops_user_has_permission(uuid, text) is
  'Trusted server-side Afuza Ops permission check for an explicit user ID.';


commit;
