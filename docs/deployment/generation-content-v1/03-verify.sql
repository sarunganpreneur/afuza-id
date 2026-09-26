-- Read-only verification for Generation Content V1 after manual apply.
-- No user rows or payload values are selected.

begin;
set transaction read only;

with functions as (
  select
    p.oid,
    p.proname,
    pg_get_functiondef(p.oid) as definition,
    p.prosecdef,
    p.proconfig,
    r.rolname as owner
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid in (
    'public.complete_generation_analysis(uuid, uuid, text, jsonb)'::regprocedure,
    'public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure
  )
)
select
  proname,
  owner,
  case when prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode,
  proconfig,
  case when proname = 'complete_generation_analysis' then position('analysis_version' in definition) > 0 else null end as analysis_has_analysis_version,
  case when proname = 'complete_generation_analysis' then position('version_number' in definition) = 0 else null end as analysis_does_not_use_version_number,
  case when proname = 'complete_generation_analysis' then position('completed_at' in definition) = 0 else null end as analysis_does_not_touch_completed_at,
  case when proname = 'commit_generated_site_version' then position('GENERATING_CONTENT' in definition) > 0 else null end as commit_requires_generating_content,
  case when proname = 'commit_generated_site_version' then position('schemaVersion' in definition) > 0 else null end as commit_validates_site_content_version
from functions
order by proname;

select
  p.proname as function_name,
  has_function_privilege('postgres', p.oid, 'EXECUTE') as postgres_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  (p.proconfig @> ARRAY['search_path=pg_catalog, public']) as safe_search_path
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid in (
    'public.complete_generation_analysis(uuid, uuid, text, jsonb)'::regprocedure,
    'public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure
  )
order by p.proname;

rollback;