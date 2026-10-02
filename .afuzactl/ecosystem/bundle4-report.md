# AX-04 Bundle 4 Staging Integration Foundation

- Control branch: `canonical/ax-control-plane-20261003`
- Execution mode: three isolated project repositories; no write-set collisions
- Production, real providers, SSH/root execution, customer messaging, billing, and external campaign actions: none
- Staging deployment or `STAGING_READY` claim: none

## CHALWA.id

- Commit: `da24609dc1a1fa718e93af5b3589ffcc03858fd8`
- Terminal evidence: `CHALWA_APPLICATION_INTEGRATION_READY`
- Integration: in-memory Design/Product/AuditEvent repositories; application use cases delegate lifecycle rules to Bundle 3 services; Node HTTP API; injected fail-closed local AuthContext
- Gates: lint PASS; typecheck PASS; tests 17/17 PASS (2 integration); build PASS

## KlodHost

- Commit: `0adec56f4f937039c18e751924102c68683ec953`
- Terminal evidence: `PROVISIONING_APPLICATION_INTEGRATION_READY`
- Integration: repository-backed jobs/idempotency/events/resources; application orchestration through Bundle 3 state rules; fake-only provider registry; fake node-agent; Node HTTP API with tenant/worker contexts
- Gates: lint PASS; typecheck PASS; tests 15/15 PASS (2 integration); build PASS
- Provider mode: `fake`; node-agent mode: `fake`

## Marketing Agency

- Commit: `3ef8cadc46e4576bd9b20be6ac31aca57de3cc1f`
- Terminal evidence: `TENANT_APPLICATION_INTEGRATION_READY`
- Integration: in-memory repositories for all local agency entities and audit events; tenant-scoped application/portal service; fake contract adapters for authentication, lead discovery/scoring, qualification, approval, outreach, WhatsApp, acquisition analytics, landing-page generation, and AI generation
- Gates: lint PASS; typecheck PASS; tests 13/13 PASS (2 integration); build PASS
- Approval-required action requests fake approval before invoking the shared capability contract; no Campaign/Lead models or live adapter calls

All three projects remain at `EXECUTION_SPEC_READY` and `AUTONOMOUS_BUILD_READY`; their execution state is `BUNDLE_4_READY`. `STAGING_READY` and `READY_FOR_HUMAN_TEST` remain unclaimed pending their separate gates.