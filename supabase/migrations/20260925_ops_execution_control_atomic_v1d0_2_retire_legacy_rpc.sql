-- ============================================================================
-- AFUZA EXECUTION GATE V1D-0C
-- Retire legacy non-atomic control mutation RPC.
--
-- The function is intentionally retained for migration/history compatibility,
-- but all runtime execution privileges are removed.
--
-- Production mutation path:
--   ops_apply_execution_control_action(...)
--
-- SAFETY:
-- - No execution-control state mutation.
-- - No execution lifecycle mutation.
-- - No external executor.
-- ============================================================================

begin;


-- ---------------------------------------------------------------------------
-- RETIRE LEGACY MUTATION PATH
-- ---------------------------------------------------------------------------

revoke all
on function public.ops_set_execution_control(
  boolean,
  boolean,
  text,
  uuid
)
from public, anon, authenticated, service_role;


comment on function public.ops_set_execution_control(
  boolean,
  boolean,
  text,
  uuid
) is
  'RETIRED by AFUZA Execution Gate V1D-0C. '
  'Runtime control mutations must use '
  'ops_apply_execution_control_action(text,bigint,text,uuid,text), '
  'which provides atomic expected-version validation and durable idempotency.';


-- ---------------------------------------------------------------------------
-- ASSERT ATOMIC RPC REMAINS AVAILABLE ONLY TO TRUSTED SERVICE ROLE
-- ---------------------------------------------------------------------------

revoke all
on function public.ops_apply_execution_control_action(
  text,
  bigint,
  text,
  uuid,
  text
)
from public, anon, authenticated;


grant execute
on function public.ops_apply_execution_control_action(
  text,
  bigint,
  text,
  uuid,
  text
)
to service_role;


commit;


-- ============================================================================
-- READ-ONLY VERIFICATION
-- ============================================================================

select
  has_function_privilege(
    'service_role',
    'public.ops_set_execution_control(boolean,boolean,text,uuid)',
    'EXECUTE'
  ) as legacy_rpc_service_role_execute,

  has_function_privilege(
    'anon',
    'public.ops_set_execution_control(boolean,boolean,text,uuid)',
    'EXECUTE'
  ) as legacy_rpc_anon_execute,

  has_function_privilege(
    'authenticated',
    'public.ops_set_execution_control(boolean,boolean,text,uuid)',
    'EXECUTE'
  ) as legacy_rpc_authenticated_execute,

  has_function_privilege(
    'service_role',
    'public.ops_apply_execution_control_action(text,bigint,text,uuid,text)',
    'EXECUTE'
  ) as atomic_rpc_service_role_execute,

  has_function_privilege(
    'anon',
    'public.ops_apply_execution_control_action(text,bigint,text,uuid,text)',
    'EXECUTE'
  ) as atomic_rpc_anon_execute,

  has_function_privilege(
    'authenticated',
    'public.ops_apply_execution_control_action(text,bigint,text,uuid,text)',
    'EXECUTE'
  ) as atomic_rpc_authenticated_execute,

  c.master_execution_enabled,

  c.emergency_stop,

  (
    c.master_execution_enabled
    and not c.emergency_stop
  ) as gate_open,

  c.version as control_version,

  (
    select count(*)
    from public.ops_execution_control_requests
  ) as durable_request_count,

  (
    select count(*)
    from public.ops_executions
  ) as execution_count

from public.ops_execution_controls as c
where c.singleton_id = true;
