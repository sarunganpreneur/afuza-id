begin;

do $preflight$
begin
  if to_regclass('public.ops_approval_requests') is null then
    raise exception 'EA03B1 requires public.ops_approval_requests';
  end if;

  if to_regclass('public.ops_executions') is null then
    raise exception 'EA03B1 requires public.ops_executions';
  end if;

  if to_regclass('public.ops_engineering_projects') is not null
     or to_regclass('public.ops_engineering_tasks') is not null
     or to_regclass('public.ops_engineering_task_events') is not null
     or to_regclass('public.ops_engineering_worktrees') is not null
     or to_regclass('public.ops_engineering_artifacts') is not null
     or to_regclass('public.ops_engineering_runs') is not null then
    raise exception 'EA03B1 engineering domain already exists or is partially present';
  end if;
end
$preflight$;

create table public.ops_engineering_projects (
  id uuid primary key default gen_random_uuid(),
  project_key text not null unique,
  name text not null,
  description text not null default '',
  repo_path text not null,
  default_branch text not null default 'main',
  staging_branch text,
  staging_service text,
  staging_health_url text,
  production_service text,
  production_health_url text,
  control_plane_project_key text,
  risk_profile text not null default 'MEDIUM'
    check (risk_profile in ('LOW','MEDIUM','HIGH','CRITICAL')),
  automation_enabled boolean not null default true,
  visual_qa_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_engineering_projects_key_format
    check (project_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  constraint ops_engineering_projects_repo_path
    check (
      repo_path like '/home/afuzaid/%'
      and position('..' in repo_path) = 0
    )
);

create table public.ops_engineering_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.ops_engineering_projects(id)
    on delete restrict,
  parent_task_id uuid
    references public.ops_engineering_tasks(id)
    on delete set null,
  external_key text not null unique,
  request_hash text not null,
  title text not null,
  objective text not null,
  task_type text not null,
  risk text not null,
  status text not null default 'CREATED',
  priority text not null default 'P2',
  requested_by uuid references auth.users(id) on delete set null,
  assigned_agent_key text,
  assigned_agent_version text,
  worktree_id uuid,
  approval_id uuid references public.ops_approval_requests(id) on delete set null,
  execution_id uuid references public.ops_executions(id) on delete set null,
  max_attempts integer not null default 3,
  attempt_count integer not null default 0,
  requires_human_review boolean not null default true,
  requires_production_approval boolean not null default true,
  constraints jsonb not null default '{}'::jsonb,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  result_summary jsonb,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint ops_engineering_tasks_external_key_format
    check (external_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  constraint ops_engineering_tasks_request_hash
    check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint ops_engineering_tasks_type
    check (task_type in (
      'UI_UX_REDESIGN','BUG_FIX','FEATURE_IMPLEMENTATION','REFACTOR',
      'CONFIGURATION','INTEGRATION','TESTING','DOCUMENTATION',
      'SECURITY_REVIEW','PERFORMANCE_OPTIMIZATION','DEVOPS_CHANGE'
    )),
  constraint ops_engineering_tasks_risk
    check (risk in ('LOW','MEDIUM','HIGH','CRITICAL')),
  constraint ops_engineering_tasks_status
    check (status in (
      'CREATED','PLANNING','READY','WORKTREE_CREATED','EXECUTING',
      'VALIDATING','READY_FOR_REVIEW','APPROVED','READY_FOR_DEPLOYMENT',
      'DEPLOYING','COMPLETED','BLOCKED','FAILED','CANCELLED','REJECTED'
    )),
  constraint ops_engineering_tasks_priority
    check (priority in ('P0','P1','P2','P3')),
  constraint ops_engineering_tasks_attempts
    check (
      max_attempts between 1 and 10
      and attempt_count between 0 and max_attempts
    ),
  constraint ops_engineering_tasks_acceptance_array
    check (jsonb_typeof(acceptance_criteria) = 'array'),
  constraint ops_engineering_tasks_constraints_object
    check (jsonb_typeof(constraints) = 'object')
);

create table public.ops_engineering_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null
    references public.ops_engineering_tasks(id)
    on delete restrict,
  event_type text not null,
  actor_type text not null,
  actor_reference text,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  constraint ops_engineering_task_events_payload_object
    check (jsonb_typeof(payload) = 'object'),
  constraint ops_engineering_task_events_idempotency_format
    check (
      idempotency_key is null
      or idempotency_key ~ '^[A-Za-z0-9._:-]{8,194}$'
    )
);

create table public.ops_engineering_worktrees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique
    references public.ops_engineering_tasks(id)
    on delete restrict,
  repo_path text not null,
  worktree_path text not null unique,
  branch_name text not null unique,
  base_commit text not null,
  current_commit text,
  status text not null default 'CREATING',
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint ops_engineering_worktrees_status
    check (status in (
      'CREATING','READY','DIRTY','VALIDATING',
      'READY_FOR_REVIEW','ARCHIVED','REMOVED','FAILED'
    )),
  constraint ops_engineering_worktrees_path
    check (
      worktree_path like '/var/lib/afuza-engineering/worktrees/%'
      and position('..' in worktree_path) = 0
    )
);

alter table public.ops_engineering_tasks
  add constraint ops_engineering_tasks_worktree_fk
  foreign key (worktree_id)
  references public.ops_engineering_worktrees(id)
  on delete set null;

create table public.ops_engineering_artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null
    references public.ops_engineering_tasks(id)
    on delete restrict,
  artifact_type text not null,
  name text not null,
  path text,
  sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ops_engineering_artifacts_type
    check (artifact_type in (
      'PLAN','DIFF','LINT_REPORT','TYPECHECK_REPORT','TEST_REPORT',
      'BUILD_REPORT','SCREENSHOT','VISUAL_QA_REPORT','SECURITY_REPORT',
      'PREVIEW_REFERENCE','CHANGELOG','DEPLOYMENT_ARTIFACT'
    )),
  constraint ops_engineering_artifacts_sha
    check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint ops_engineering_artifacts_metadata
    check (jsonb_typeof(metadata) = 'object')
);

create table public.ops_engineering_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null
    references public.ops_engineering_tasks(id)
    on delete restrict,
  attempt integer not null,
  agent_key text not null,
  agent_version text not null,
  runner_profile text not null,
  status text not null,
  trace_id text not null unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  failure_code text,
  failure_message text,
  constraint ops_engineering_runs_attempt
    check (attempt between 1 and 10),
  constraint ops_engineering_runs_status
    check (status in (
      'PREPARED','RUNNING','EVALUATING','COMPLETED','FAILED','CANCELLED'
    ))
);

create index ops_engineering_tasks_project_created_idx
  on public.ops_engineering_tasks(project_id, created_at desc);

create index ops_engineering_tasks_status_created_idx
  on public.ops_engineering_tasks(status, created_at desc);

create index ops_engineering_tasks_risk_status_idx
  on public.ops_engineering_tasks(risk, status);

create index ops_engineering_task_events_task_created_idx
  on public.ops_engineering_task_events(task_id, created_at asc);

create index ops_engineering_artifacts_task_created_idx
  on public.ops_engineering_artifacts(task_id, created_at asc);

create index ops_engineering_runs_task_started_idx
  on public.ops_engineering_runs(task_id, started_at desc);

create or replace function public.ops_engineering_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger ops_engineering_projects_touch_updated_at
before update on public.ops_engineering_projects
for each row execute function public.ops_engineering_touch_updated_at();

create trigger ops_engineering_tasks_touch_updated_at
before update on public.ops_engineering_tasks
for each row execute function public.ops_engineering_touch_updated_at();

create trigger ops_engineering_worktrees_touch_updated_at
before update on public.ops_engineering_worktrees
for each row execute function public.ops_engineering_touch_updated_at();

create or replace function public.ops_engineering_prevent_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Engineering task events are append-only';
end;
$$;

create trigger ops_engineering_task_events_immutable
before update or delete on public.ops_engineering_task_events
for each row execute function public.ops_engineering_prevent_event_mutation();

create or replace function public.ops_engineering_register_project(
  p_project_key text,
  p_name text,
  p_description text,
  p_repo_path text,
  p_default_branch text,
  p_staging_branch text,
  p_staging_service text,
  p_staging_health_url text,
  p_production_service text,
  p_production_health_url text,
  p_control_plane_project_key text,
  p_risk_profile text,
  p_automation_enabled boolean,
  p_visual_qa_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current public.ops_engineering_projects%rowtype;
  v_id uuid;
begin
  if p_project_key is null or p_project_key !~ '^[a-z0-9][a-z0-9-]{1,63}$' then
    raise exception 'Invalid engineering project key';
  end if;

  if p_repo_path is null
     or p_repo_path not like '/home/afuzaid/%'
     or position('..' in p_repo_path) > 0 then
    raise exception 'Invalid engineering repository path';
  end if;

  select *
  into v_current
  from public.ops_engineering_projects
  where project_key = p_project_key;

  if found then
    if v_current.name is distinct from p_name
       or v_current.description is distinct from coalesce(p_description, '')
       or v_current.repo_path is distinct from p_repo_path
       or v_current.default_branch is distinct from coalesce(p_default_branch, 'main')
       or v_current.staging_branch is distinct from p_staging_branch
       or v_current.staging_service is distinct from p_staging_service
       or v_current.staging_health_url is distinct from p_staging_health_url
       or v_current.production_service is distinct from p_production_service
       or v_current.production_health_url is distinct from p_production_health_url
       or v_current.control_plane_project_key is distinct from p_control_plane_project_key
       or v_current.risk_profile is distinct from p_risk_profile
       or v_current.automation_enabled is distinct from p_automation_enabled
       or v_current.visual_qa_enabled is distinct from p_visual_qa_enabled then
      raise exception 'ENGINEERING_PROJECT_CONFLICT';
    end if;

    return v_current.id;
  end if;

  insert into public.ops_engineering_projects (
    project_key,
    name,
    description,
    repo_path,
    default_branch,
    staging_branch,
    staging_service,
    staging_health_url,
    production_service,
    production_health_url,
    control_plane_project_key,
    risk_profile,
    automation_enabled,
    visual_qa_enabled
  )
  values (
    p_project_key,
    p_name,
    coalesce(p_description, ''),
    p_repo_path,
    coalesce(nullif(trim(p_default_branch), ''), 'main'),
    p_staging_branch,
    p_staging_service,
    p_staging_health_url,
    p_production_service,
    p_production_health_url,
    p_control_plane_project_key,
    p_risk_profile,
    p_automation_enabled,
    p_visual_qa_enabled
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.ops_engineering_create_task(
  p_project_id uuid,
  p_external_key text,
  p_request_hash text,
  p_title text,
  p_objective text,
  p_task_type text,
  p_risk text,
  p_priority text,
  p_requested_by uuid,
  p_max_attempts integer,
  p_requires_human_review boolean,
  p_requires_production_approval boolean,
  p_constraints jsonb,
  p_acceptance_criteria jsonb
)
returns table (
  task_id uuid,
  created_new boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.ops_engineering_tasks%rowtype;
  v_task_id uuid;
begin
  if not exists (
    select 1
    from public.ops_engineering_projects
    where id = p_project_id
  ) then
    raise exception 'ENGINEERING_PROJECT_NOT_FOUND';
  end if;

  select *
  into v_existing
  from public.ops_engineering_tasks
  where external_key = p_external_key;

  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception 'ENGINEERING_TASK_IDEMPOTENCY_CONFLICT';
    end if;

    return query
    select v_existing.id, false;
    return;
  end if;

  insert into public.ops_engineering_tasks (
    project_id,
    external_key,
    request_hash,
    title,
    objective,
    task_type,
    risk,
    priority,
    requested_by,
    max_attempts,
    requires_human_review,
    requires_production_approval,
    constraints,
    acceptance_criteria
  )
  values (
    p_project_id,
    p_external_key,
    p_request_hash,
    p_title,
    p_objective,
    p_task_type,
    p_risk,
    p_priority,
    p_requested_by,
    p_max_attempts,
    p_requires_human_review,
    p_requires_production_approval,
    coalesce(p_constraints, '{}'::jsonb),
    coalesce(p_acceptance_criteria, '[]'::jsonb)
  )
  returning id into v_task_id;

  insert into public.ops_engineering_task_events (
    task_id,
    event_type,
    actor_type,
    actor_reference,
    to_status,
    payload,
    idempotency_key
  )
  values (
    v_task_id,
    'TASK_CREATED',
    case when p_requested_by is null then 'SYSTEM' else 'USER' end,
    p_requested_by::text,
    'CREATED',
    jsonb_build_object(
      'external_key', p_external_key,
      'task_type', p_task_type,
      'risk', p_risk,
      'priority', p_priority
    ),
    'eng:task:create:' || p_external_key
  );

  return query
  select v_task_id, true;
end;
$$;

alter table public.ops_engineering_projects enable row level security;
alter table public.ops_engineering_tasks enable row level security;
alter table public.ops_engineering_task_events enable row level security;
alter table public.ops_engineering_worktrees enable row level security;
alter table public.ops_engineering_artifacts enable row level security;
alter table public.ops_engineering_runs enable row level security;

revoke all on table public.ops_engineering_projects from public, anon, authenticated;
revoke all on table public.ops_engineering_tasks from public, anon, authenticated;
revoke all on table public.ops_engineering_task_events from public, anon, authenticated;
revoke all on table public.ops_engineering_worktrees from public, anon, authenticated;
revoke all on table public.ops_engineering_artifacts from public, anon, authenticated;
revoke all on table public.ops_engineering_runs from public, anon, authenticated;

grant select on table public.ops_engineering_projects to service_role;
grant select on table public.ops_engineering_tasks to service_role;
grant select on table public.ops_engineering_task_events to service_role;
grant select on table public.ops_engineering_worktrees to service_role;
grant select on table public.ops_engineering_artifacts to service_role;
grant select on table public.ops_engineering_runs to service_role;

revoke all on function public.ops_engineering_touch_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.ops_engineering_prevent_event_mutation() from public, anon, authenticated, service_role;

revoke all on function public.ops_engineering_register_project(
  text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean
) from public, anon, authenticated;

revoke all on function public.ops_engineering_create_task(
  uuid,text,text,text,text,text,text,text,uuid,integer,boolean,boolean,jsonb,jsonb
) from public, anon, authenticated;

grant execute on function public.ops_engineering_register_project(
  text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean
) to service_role;

grant execute on function public.ops_engineering_create_task(
  uuid,text,text,text,text,text,text,text,uuid,integer,boolean,boolean,jsonb,jsonb
) to service_role;

comment on table public.ops_engineering_projects is
  'AFUZA Engineering Automation project registry.';

comment on table public.ops_engineering_tasks is
  'AFUZA Engineering Automation canonical engineering task ledger.';

comment on table public.ops_engineering_task_events is
  'Append-only audit trail for engineering task lifecycle events.';

comment on table public.ops_engineering_worktrees is
  'Isolated worktree registry. EA-03B1 defines storage only; runner execution is not enabled.';

comment on table public.ops_engineering_artifacts is
  'Engineering evidence/artifact registry.';

comment on table public.ops_engineering_runs is
  'Engineering agent/runner attempt registry.';

notify pgrst, 'reload schema';

commit;
