-- Read-only preflight for Generation Content V1.
-- Run in Supabase SQL Editor as an authorized database operator.
-- No user rows or payload values are selected.

begin;
set transaction read only;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode,
  p.proconfig as function_config,
  r.rolname as owner
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
  and p.proname in ('complete_generation_analysis', 'commit_generated_site_version')
order by p.proname;

select
  p.proname as function_name,
  has_function_privilege('postgres', p.oid, 'EXECUTE') as postgres_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid in (
    'public.complete_generation_analysis(uuid, uuid, text, jsonb)'::regprocedure,
    'public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure
  )
order by p.proname;

select status, count(*) as job_count
from public.generation_jobs
group by status
order by status;

select
  count(*) filter (where output_summary ? 'version_number') as jobs_with_version_marker,
  count(*) filter (
    where output_summary ? 'version_number'
      and jsonb_typeof(output_summary->'version_number') = 'number'
      and (output_summary->>'version_number') ~ '^[1-9][0-9]*$'
  ) as numeric_version_markers,
  count(*) filter (
    where output_summary ? 'version_number'
      and not (
        jsonb_typeof(output_summary->'version_number') = 'number'
        and (output_summary->>'version_number') ~ '^[1-9][0-9]*$'
      )
  ) as nonnumeric_version_markers,
  count(*) filter (where status = 'ANALYZING'::public.generation_status) as analyzing_jobs,
  count(*) filter (where status = 'GENERATING_CONTENT'::public.generation_status) as generating_content_jobs
from public.generation_jobs;

rollback;