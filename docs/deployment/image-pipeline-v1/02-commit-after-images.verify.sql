-- Read-only verification for Image Pipeline V1 commit RPC.
-- This packet never calls the function and never reads user rows/payloads.

begin;
set transaction read only;

-- Exactly one installed signature, unchanged return/security/search_path metadata.
select
  count(*) as matching_signature_count,
  bool_and(pg_get_function_identity_arguments(p.oid) = 'p_job_id uuid, p_content jsonb, p_theme jsonb, p_seo jsonb, p_editor_state jsonb') as signature_matches,
  bool_and(pg_get_function_result(p.oid) = 'TABLE(version_number integer, site_content_id uuid, site_version_id uuid)') as return_type_matches,
  bool_and(not p.prosecdef) as security_invoker,
  bool_and(p.proconfig @> array['search_path=pg_catalog, public']) as search_path_matches
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'commit_generated_site_version';

-- Full installed definition and explicit status-guard assertions.
select
  pg_catalog.pg_get_functiondef(p.oid) as function_definition,
  position('GENERATING_CONTENT' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as contains_generating_content,
  position('GENERATING_IMAGES' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as contains_generating_images
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure;

-- Privileges: service_role remains executable; public roles remain denied.
select
  has_function_privilege('service_role', 'public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure, 'EXECUTE') as service_role_execute,
  has_function_privilege('public', 'public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure, 'EXECUTE') as public_execute,
  has_function_privilege('anon', 'public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', 'public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure, 'EXECUTE') as authenticated_execute;

rollback;