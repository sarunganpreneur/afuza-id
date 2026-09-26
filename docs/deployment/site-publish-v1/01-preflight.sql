-- Read-only Site Publish V1 preflight. No IDs or user rows are selected.
begin;
set transaction read only;
select enumlabel as site_status from pg_catalog.pg_enum e join pg_catalog.pg_type t on t.oid = e.enumtypid join pg_catalog.pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'site_status' order by e.enumsortorder;
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments, has_function_privilege('postgres', p.oid, 'EXECUTE') as postgres_execute, has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('publish_site_version','unpublish_site','get_published_site');
select status, count(*) as site_count from public.sites group by status order by status;
select count(*) as published_site_count from public.sites where published_version is not null;
select count(*) as published_version_without_pair from public.sites s where s.published_version is not null and not exists (select 1 from public.site_versions sv where sv.site_id = s.id and sv.version_number = s.published_version);
select count(*) as non_v1_versions from public.site_versions where content_snapshot->>'schemaVersion' is distinct from 'site_content_v1';
rollback;