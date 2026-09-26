-- Read-only lifecycle metadata audit for Image Pipeline V1.
-- Run in Supabase SQL Editor only after review.
-- This packet never calls lifecycle functions and never reads user rows/payloads.

begin;
set transaction read only;

-- 1. Actual generation_status enum labels and ordering.
select
  n.nspname as enum_schema,
  t.typname as enum_name,
  e.enumsortorder,
  e.enumlabel
from pg_catalog.pg_type t
join pg_catalog.pg_namespace n on n.oid = t.typnamespace
join pg_catalog.pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public'
  and t.typname = 'generation_status'
order by e.enumsortorder;

-- 2. Installed lifecycle function signatures, security, owner, and full definitions.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as return_type,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode,
  r.rolname as owner,
  p.proconfig,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
  and p.proname in (
    'advance_generation_job',
    'commit_generated_site_version',
    'complete_generation_analysis',
    'fail_generation_job',
    'claim_next_generation_job',
    'requeue_failed_generation_job'
  )
order by p.proname, identity_arguments;

-- 3. Installed function privileges, metadata only.
select
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  has_function_privilege('postgres', p.oid, 'EXECUTE') as postgres_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'advance_generation_job',
    'commit_generated_site_version',
    'complete_generation_analysis',
    'fail_generation_job',
    'claim_next_generation_job',
    'requeue_failed_generation_job'
  )
order by p.proname, identity_arguments;

rollback;
