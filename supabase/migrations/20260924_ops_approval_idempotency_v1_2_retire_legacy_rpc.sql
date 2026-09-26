-- AFUZA OPS Approval Idempotency V1.2
--
-- Retires the legacy create-approval RPC which allowed
-- approval creation without an idempotency key.
--
-- The idempotent overload remains active.
-- No approval data is modified.
-- No execution capability is enabled.

begin;

drop function if exists public.ops_create_approval(
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz,
  uuid
);

commit;
