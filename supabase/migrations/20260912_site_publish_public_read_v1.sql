-- Site publish/public-read V1.
-- Additive RPC contract only. Do not execute from the application.
-- Rollback: drop only these functions if they did not exist before this migration.

begin;

create or replace function public.publish_site_version(p_site_id uuid, p_version_number integer)
returns table (site_id uuid, slug text, status public.site_status, published_version integer, published_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_site public.sites%rowtype;
  v_published_at timestamptz;
begin
  if v_user_id is null or p_site_id is null or p_version_number < 1 then
    raise exception 'Publish request is invalid';
  end if;
  select s.* into v_site from public.sites s where s.id = p_site_id for update;
  if v_site.id is null or (v_site.owner_id <> v_user_id and not public.is_admin()) then
    raise exception 'Site is not available';
  end if;
  if not exists (
    select 1 from public.site_versions sv
    where sv.site_id = p_site_id and sv.version_number = p_version_number
      and sv.content_snapshot->>'schemaVersion' = 'site_content_v1'
  ) then
    raise exception 'Site version is not available';
  end if;
  v_published_at := case when v_site.published_version = p_version_number then v_site.published_at else now() end;
  update public.sites set published_version = p_version_number, published_at = v_published_at, status = 'LIVE'::public.site_status where id = p_site_id;
  return query select p_site_id, v_site.slug, 'LIVE'::public.site_status, p_version_number, v_published_at;
end;
$$;

create or replace function public.unpublish_site(p_site_id uuid)
returns table (site_id uuid, slug text, status public.site_status, published_version integer, published_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_site_id is null then raise exception 'Unpublish request is invalid'; end if;
  if not exists (select 1 from public.sites s where s.id = p_site_id and (s.owner_id = v_user_id or public.is_admin()) for update) then
    raise exception 'Site is not available';
  end if;
  update public.sites set status = 'DRAFT'::public.site_status, published_version = null, published_at = null where id = p_site_id;
  return query select s.id, s.slug, s.status, s.published_version, s.published_at from public.sites s where s.id = p_site_id;
end;
$$;

create or replace function public.get_published_site(p_slug text)
returns table (name text, slug text, published_version integer, published_at timestamptz, content_snapshot jsonb, theme_snapshot jsonb, seo_snapshot jsonb)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select s.name, s.slug, s.published_version, s.published_at, sv.content_snapshot, sv.theme_snapshot, sv.seo_snapshot
  from public.sites s
  join public.site_versions sv on sv.site_id = s.id and sv.version_number = s.published_version
  where lower(trim(s.slug)) = lower(trim(p_slug))
    and s.status = 'LIVE'::public.site_status
    and s.published_version is not null
    and sv.content_snapshot->>'schemaVersion' = 'site_content_v1';
$$;

revoke all on function public.publish_site_version(uuid, integer) from public, anon;
grant execute on function public.publish_site_version(uuid, integer) to authenticated, service_role;
revoke all on function public.unpublish_site(uuid) from public, anon;
grant execute on function public.unpublish_site(uuid) to authenticated, service_role;
revoke all on function public.get_published_site(text) from public;
grant execute on function public.get_published_site(text) to anon, authenticated, service_role;

comment on function public.publish_site_version(uuid, integer) is 'Publishes an owned site_content_v1 version as LIVE.';
comment on function public.unpublish_site(uuid) is 'Unpublishes an owned site and preserves content/version history.';
comment on function public.get_published_site(text) is 'Anonymous-safe read of the currently published site version only.';

commit;