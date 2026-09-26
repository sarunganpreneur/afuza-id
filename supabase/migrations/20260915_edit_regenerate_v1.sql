-- AFUZA.ID Edit & Regenerate V1.
-- Migration file only: review and apply through the approved database process.
-- It does not delete, update, requeue, publish, or normalize existing rows.

begin;

do $$
begin
  if exists (
    select 1
    from public.generation_jobs gj
    where gj.status not in (
      'RENDERING'::public.generation_status,
      'LIVE'::public.generation_status,
      'ERROR'::public.generation_status,
      'CANCELLED'::public.generation_status
    )
    group by gj.site_id
    having count(*) > 1
  ) then
    raise exception 'Migration preflight failed: multiple active generation jobs exist for a site';
  end if;
end;
$$;

do $$
declare
  v_index regclass := to_regclass('public.generation_jobs_one_active_per_site');
  v_index_count integer;
  v_predicate text;
  v_predicate_normalized text;
  v_predicate_core text;
  v_terminal_statuses text[];
  v_indrelid oid;
  v_indisunique boolean;
  v_indnkeyatts integer;
  v_indnatts integer;
  v_indpred pg_node_tree;
  v_indkey text;
begin
  select count(*)
    into v_index_count
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'generation_jobs_one_active_per_site';

  if v_index is null or v_index_count <> 1 then
    raise exception 'Migration preflight failed: active generation-job index is missing';
  end if;

  select i.indrelid, i.indisunique, i.indnkeyatts, i.indnatts, i.indpred,
         i.indkey::text, pg_catalog.pg_get_expr(i.indpred, i.indrelid)
    into v_indrelid, v_indisunique, v_indnkeyatts, v_indnatts, v_indpred,
         v_indkey, v_predicate
    from pg_catalog.pg_index i
   where i.indexrelid = v_index::oid;

  v_predicate_normalized := replace(
    regexp_replace(lower(v_predicate), '\s+', '', 'g'),
    'public.',
    ''
  );
  v_predicate_core := v_predicate_normalized;
  while left(v_predicate_core, 1) = '('
    and right(v_predicate_core, 1) = ')'
    and char_length(v_predicate_core) > 1 loop
    v_predicate_core := substring(v_predicate_core from 2 for char_length(v_predicate_core) - 2);
  end loop;

  select coalesce(
    array_agg(distinct upper(status_match[1]) order by upper(status_match[1])),
    ARRAY[]::text[]
  )
    into v_terminal_statuses
    from regexp_matches(
      v_predicate,
      $predicate$'([^']+)'::(?:public\.)?generation_status$predicate$,
      'g'
    ) as status_match;

  if v_indrelid <> 'public.generation_jobs'::regclass
     or not v_indisunique
     or v_indnkeyatts <> 1
     or v_indnatts <> 1
     or v_indpred is null
     or v_indkey <> (
       select a.attnum::text
       from pg_catalog.pg_attribute a
       where a.attrelid = 'public.generation_jobs'::regclass
         and a.attname = 'site_id'
     )
     or v_predicate_core !~ '^status<>all\(array\[''[^'']+''::generation_status(,''[^'']+''::generation_status){2}\]\)$'
     or v_terminal_statuses <> ARRAY['CANCELLED', 'ERROR', 'LIVE']::text[] then
    raise exception 'Migration preflight failed: active generation-job index shape is unexpected';
  end if;
end;
$$;

drop index if exists public.generation_jobs_one_active_per_site;

create unique index generation_jobs_one_active_per_site
  on public.generation_jobs(site_id)
  where status not in (
    'RENDERING'::public.generation_status,
    'LIVE'::public.generation_status,
    'ERROR'::public.generation_status,
    'CANCELLED'::public.generation_status
  );

create or replace function public.request_site_generation(p_site_id uuid)
returns table (job_id uuid, status public.generation_status, created_new boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_site_id uuid;
  v_site_name text;
  v_site_slug text;
  v_business_id uuid;
  v_business_name text;
  v_business_type text;
  v_target_market text;
  v_products_services text;
  v_usp text;
  v_whatsapp text;
  v_address text;
  v_halal_status public.halal_status;
  v_website_goal text;
  v_primary_cta text;
  v_style_preference text;
  v_color_preference text;
  v_reference_urls text;
  v_notes text;
  v_image_mode text;
  v_existing_job_id uuid;
  v_existing_status public.generation_status;
  v_new_job_id uuid;
  v_constraint_name text;
  v_insert_conflict boolean := false;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select s.id, s.name, s.slug, s.business_id
    into v_site_id, v_site_name, v_site_slug, v_business_id
    from public.sites s
   where s.id = p_site_id and s.owner_id = v_user_id
   for update;
  if v_site_id is null then raise exception 'Generation request is not available'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.email_verified_at is not null and p.account_status = 'VERIFIED'
  ) then raise exception 'Generation request is not available'; end if;

  select gj.id, gj.status into v_existing_job_id, v_existing_status
    from public.generation_jobs gj
   where gj.site_id = v_site_id
     and gj.status not in (
       'RENDERING'::public.generation_status,
       'LIVE'::public.generation_status,
       'ERROR'::public.generation_status,
       'CANCELLED'::public.generation_status
     )
   order by gj.created_at desc limit 1;
  if v_existing_job_id is not null then
    return query select v_existing_job_id, v_existing_status, false;
    return;
  end if;

  select b.name, b.business_type, b.target_market, b.products_services, b.usp, b.whatsapp, b.address, b.halal_status
    into v_business_name, v_business_type, v_target_market, v_products_services, v_usp, v_whatsapp, v_address, v_halal_status
    from public.businesses b where b.id = v_business_id and b.owner_id = v_user_id;
  if v_business_name is null then raise exception 'Generation request is not available'; end if;

  select sb.website_goal, sb.primary_cta, sb.style_preference, sb.color_preference, sb.reference_urls, sb.notes, sb.image_mode
    into v_website_goal, v_primary_cta, v_style_preference, v_color_preference, v_reference_urls, v_notes, v_image_mode
    from public.site_briefs sb where sb.site_id = v_site_id;
  if not found
     or nullif(trim(v_business_name), '') is null
     or nullif(trim(v_business_type), '') is null
     or nullif(trim(v_target_market), '') is null
     or nullif(trim(v_products_services), '') is null
     or nullif(trim(v_primary_cta), '') is null
     or v_halal_status is null then
    raise exception 'Generation brief is incomplete';
  end if;
  if v_image_mode is null then v_image_mode := 'AI'; end if;
  if v_image_mode not in ('AI', 'UPLOAD', 'MIXED') then raise exception 'Generation brief is incomplete'; end if;
  if v_halal_status::text not in ('CERTIFIED', 'IN_PROCESS', 'NOT_CERTIFIED', 'UNSURE', 'NOT_RELEVANT') then raise exception 'Generation brief is incomplete'; end if;

  begin
    insert into public.generation_jobs (site_id, requested_by, input_snapshot)
    values (
      v_site_id, v_user_id,
      jsonb_build_object(
        'schema_version', 1,
        'site', jsonb_build_object('id', v_site_id, 'name', v_site_name, 'slug', v_site_slug),
        'business', jsonb_build_object('name', v_business_name, 'business_type', v_business_type, 'target_market', v_target_market, 'products_services', v_products_services, 'usp', v_usp, 'whatsapp', v_whatsapp, 'address', v_address),
        'brief', jsonb_build_object('website_goal', v_website_goal, 'primary_cta', v_primary_cta, 'style_preference', v_style_preference, 'color_preference', v_color_preference, 'reference_urls', v_reference_urls, 'notes', v_notes, 'image_mode', v_image_mode, 'halal_status', v_halal_status::text)
      )
    ) returning id into v_new_job_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = 'generation_jobs_one_active_per_site' then v_insert_conflict := true; else raise; end if;
  end;

  if v_insert_conflict then
    select gj.id, gj.status into v_existing_job_id, v_existing_status
      from public.generation_jobs gj
     where gj.site_id = v_site_id
       and gj.status not in ('RENDERING'::public.generation_status, 'LIVE'::public.generation_status, 'ERROR'::public.generation_status, 'CANCELLED'::public.generation_status)
     order by gj.created_at desc limit 1;
    if v_existing_job_id is null then raise exception 'Generation request is not available'; end if;
    return query select v_existing_job_id, v_existing_status, false;
    return;
  end if;

  return query select v_new_job_id, 'QUEUED'::public.generation_status, true;
end;
$$;

revoke all on function public.request_site_generation(uuid) from public, anon, service_role;
grant execute on function public.request_site_generation(uuid) to authenticated;

commit;