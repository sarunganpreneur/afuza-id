-- Rollback only if these functions did not exist before apply.
-- Does not alter tables or rows.
begin;
drop function if exists public.publish_site_version(uuid, integer);
drop function if exists public.unpublish_site(uuid);
drop function if exists public.get_published_site(text);
commit;