-- Afuza Site Content V1 generation hardening.
-- Additive function replacement only; do not execute this file from the application.
-- Rollback: restore the previously reviewed function definitions from the
-- 20260909_phase5g2_generation_rpc_foundation and 20260910/11 analysis migrations.

begin;

create or replace function public.complete_generation_analysis(
  p_job_id uuid,
  p_site_id uuid,
  p_analysis_version text,
  p_analysis_payload jsonb
)
returns table (
  job_id uuid,
  site_id uuid,
  status public.generation_status,
  output_summary jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_output_summary jsonb;
begin
  if p_analysis_version <> 'website_analysis_v1' then
    raise exception 'Unsupported analysis schema version';
  end if;

  if p_analysis_payload is null or jsonb_typeof(p_analysis_payload) <> 'object' then
    raise exception 'Analysis payload is required';
  end if;

  if p_job_id is null or p_site_id is null then
    raise exception 'Analysis job identity is required';
  end if;

  if not exists (
    select 1
    from public.generation_jobs gj
    where gj.id = p_job_id
      and gj.site_id = p_site_id
      and gj.status = 'ANALYZING'::public.generation_status
  ) then
    raise exception 'Generation job is not available for completion';
  end if;

  select coalesce(gj.output_summary, '{}'::jsonb)
    into v_output_summary
    from public.generation_jobs gj
   where gj.id = p_job_id
   for update;

  update public.generation_jobs as gj
     set status = 'GENERATING_CONTENT'::public.generation_status,
         output_summary = v_output_summary || jsonb_build_object(
           'analysis_version', p_analysis_version,
           'analysis', p_analysis_payload,
           'status', 'GENERATING_CONTENT'
         )
   where gj.id = p_job_id
     and gj.site_id = p_site_id
     and gj.status = 'ANALYZING'::public.generation_status
   returning gj.id, gj.site_id, gj.status, gj.output_summary
    into job_id, site_id, status, output_summary;

  if job_id is null then
    raise exception 'Generation job is not available for completion';
  end if;

  return next;
end;
$$;

create or replace function public.commit_generated_site_version(
  p_job_id uuid,
  p_content jsonb,
  p_theme jsonb,
  p_seo jsonb,
  p_editor_state jsonb
)
returns table (
  version_number integer,
  site_content_id uuid,
  site_version_id uuid
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_site_id uuid;
  v_requested_by uuid;
  v_job_status public.generation_status;
  v_output_summary jsonb;
  v_recorded_version numeric;
  v_current_content_version integer;
  v_next_version integer;
  v_content_id uuid;
  v_version_id uuid;
begin
  -- The job lock is deliberately acquired before the site lock for every path.
  select gj.site_id, gj.requested_by, gj.status, coalesce(gj.output_summary, '{}'::jsonb)
    into v_site_id, v_requested_by, v_job_status, v_output_summary
    from public.generation_jobs gj
   where gj.id = p_job_id
   for update;

  if v_site_id is null then
    raise exception 'Generation job is not available';
  end if;

  if v_output_summary ? 'version_number' then
    if jsonb_typeof(v_output_summary->'version_number') <> 'number'
       or (v_output_summary->>'version_number') !~ '^[1-9][0-9]*$' then
      raise exception 'Generation commit marker is invalid';
    end if;

    v_recorded_version := (v_output_summary->>'version_number')::numeric;
    if v_recorded_version > 2147483647 then
      raise exception 'Generation commit marker is invalid';
    end if;

    select s.current_content_version
      into v_current_content_version
      from public.sites s
     where s.id = v_site_id
     for update;

    if v_current_content_version is null then
      raise exception 'Generation commit marker is invalid';
    end if;

    select sv.id
      into v_version_id
      from public.site_versions sv
     where sv.site_id = v_site_id
       and sv.version_number = v_recorded_version::integer;

    select sc.id
      into v_content_id
      from public.site_content sc
     where sc.site_id = v_site_id;

    if v_version_id is null or v_content_id is null then
      raise exception 'Generation commit marker is invalid';
    end if;

    return query select v_recorded_version::integer, v_content_id, v_version_id;
    return;
  end if;

  if v_job_status <> 'GENERATING_CONTENT'::public.generation_status then
    raise exception 'Generation job is not available';
  end if;

  if p_content is null
     or jsonb_typeof(p_content) <> 'object'
     or p_content->>'schemaVersion' <> 'site_content_v1'
     or p_theme is null
     or p_seo is null
     or p_editor_state is null
     or jsonb_typeof(p_theme) <> 'object'
     or jsonb_typeof(p_seo) <> 'object'
     or jsonb_typeof(p_editor_state) <> 'object' then
    raise exception 'Generated site content is invalid';
  end if;

  select s.current_content_version
    into v_current_content_version
    from public.sites s
   where s.id = v_site_id
   for update;

  if v_current_content_version is null then
    raise exception 'Generation site is not available';
  end if;

  select greatest(
    v_current_content_version,
    coalesce(max(sv.version_number), 0)
  ) + 1
    into v_next_version
    from public.site_versions sv
   where sv.site_id = v_site_id;

  select sc.id
    into v_content_id
    from public.site_content sc
   where sc.site_id = v_site_id;

  if v_content_id is null then
    insert into public.site_content (
      site_id, content, theme, seo, editor_state, updated_by
    )
    values (
      v_site_id, p_content, p_theme, p_seo, p_editor_state, v_requested_by
    )
    returning id into v_content_id;
  else
    update public.site_content
       set content = p_content,
           theme = p_theme,
           seo = p_seo,
           editor_state = p_editor_state,
           updated_by = v_requested_by
     where id = v_content_id;
  end if;

  insert into public.site_versions (
    site_id, version_number, content_snapshot, theme_snapshot, seo_snapshot, created_by, source
  )
  values (
    v_site_id, v_next_version, p_content, p_theme, p_seo, v_requested_by, 'SYSTEM'
  )
  returning id into v_version_id;

  update public.sites
     set current_content_version = v_next_version
   where id = v_site_id;

  -- The commit marker is written only after all content/version writes succeed.
  update public.generation_jobs
     set output_summary = v_output_summary || jsonb_build_object(
       'version_number', v_next_version
     )
   where id = p_job_id;

  return query select v_next_version, v_content_id, v_version_id;
end;
$$;

revoke all on function public.complete_generation_analysis(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_generation_analysis(uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_generated_site_version(uuid, jsonb, jsonb, jsonb, jsonb)
  to service_role;

commit;