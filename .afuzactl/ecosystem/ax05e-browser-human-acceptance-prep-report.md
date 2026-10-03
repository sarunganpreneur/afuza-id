# AX-05-E Browser Human Acceptance Preparation

Verified on `afuza-core-01`, 2026-10-04. This report records preparation and machine-verifiable checks only; it does not promote readiness.

## Live State And Safety

- Public roots for CHALWA, KlodHost, and Marketing Agency return HTTP 200 and render the tester console/login screen. All six public `/health` and `/ready` checks return HTTP 200.
- Staging services are active with `NRestarts=0`. Direct app listeners remain loopback-only: `127.0.0.1:4511`, `127.0.0.1:4512`, `127.0.0.1:4513`.
- Production `afuza-id.service` remains active with no tester enablement or drop-in. No production service, file, or runtime was modified.
- Tester fixture files remain external with mode `0600`; raw secret file `/root/ax05-b0-tester-secrets.json` remains root-owned mode `0600`. No fixture or raw secret is tracked in an app repository.
- Public root HTML was checked against all fixture secrets in memory; no secret was present. The three browser clients contain no `localStorage` or `sessionStorage` access and no credential logging reference.
- All 11 public fixture sessions returned the server-bound identity. Invalid secrets returned 401; valid login/session returned 200; cookies included `Secure`, `HttpOnly`, and `SameSite=Strict`; forged `x-staging-role`, `x-staging-tenant`, and `x-staging-principal` did not change identity; logout returned 200 and revoked the session (subsequent session returned 401).
- Shared browser tabs loaded the signed-out login screens and STAGING/TESTER banners. KlodHost showed FAKE PROVIDER and FAKE NODE AGENT; Marketing showed FAKE CAPABILITIES ONLY and NO OUTBOUND EXECUTION.

## Acceptance Matrix

| App | Fixtures | Machine-verifiable PASS | Human browser pass still needed |
| --- | --- | --- | --- |
| CHALWA | `tester-designer`, `tester-product_manager`, `tester-admin`, `tester-customer` | Auth/session identity for all four; forged-header resistance; logout/revocation; role rules present in served UI; lifecycle from draft through published; invalid transition; duplicate SKU; unauthorized customer denial; audit API; no secret persistence/leak | Sign in separately as each role; visually confirm designer write controls, product-manager review/approve/reject, admin publish/audit, and customer read-only restrictions; exercise reject/unpublish and inspect audit screen |
| KlodHost | `tester-tenant-a`, `tester-tenant-b`, `tester-worker` | Auth/session identity for all three; forged-header resistance; logout/revocation; tenant A job reaches ACTIVE through fake worker actions; tenant B receives 404 for tenant A job; fake-mode indicators and retry control in served UI | Sign in as both tenants and worker; visually verify tenant scoping, worker-only controls, idempotency feedback, retry/cancel affordances, and event history |
| Marketing Agency | `tester-operator`, `tester-owner-a`, `tester-owner-b`, `tester-member-a` | Auth/session identity for all four; forged-header resistance; logout/revocation; tenant-bound owner A/B sessions; owner A/B and member A own-portal 200 / cross-tenant 403; operator has no implicit tenant scope; operator tenant bootstrap; owner activation, client, entitlement, approved fake capability, denied approval, and scoped portal; role navigation rules present in served UI | Sign in as operator, each owner, and member; visually confirm role navigation/form restrictions and active-tenant clarity; exercise tenant B and member workflows, entitlement denial, and tenant portal/audit |

The browser tabs were intentionally left signed out. Fixture secrets were never entered into browser-tool source, terminal output, DOM, or storage. Therefore role-specific visibility is statically verified in served markup/security tests and application behavior is verified through public fixture-authenticated API requests; final visual confirmation after each browser login remains a human step.

## KlodHost Limitation

The current KlodHost HTTP API has no deterministic failure-creation operation. The tester console exposes retry for an already-failed job, but cannot safely produce that state through the existing API. No synthetic failure mechanism was added; doing so would require a separate architecture/product decision. Do not interpret this as a provider failure test.

## Verification

- App gates: CHALWA lint/typecheck/build/diff check PASS, 26/26 tests; KlodHost PASS, 23/23 tests; Marketing Agency PASS, 19/19 tests.
- App heads: CHALWA `224b0700b24e62021eadeeeb29b3afadd89d6c3e`; KlodHost `d6d315388ffdee62f70c875ba26f2688be905ea8`; Marketing Agency `6443121d1c6d5d9b3019834721ee520b28883e45`.
- Canonical control: `afuzactl doctor`, ecosystem readiness, portfolio readiness, and `afuzactl verify` PASS. Verify included control lint, typecheck, tests, build, and AFUZA.ID staging health smoke.
- Production remains untouched; KlodHost remains fake provider/fake node agent; Marketing Agency remains fake-stub; no live external action was invoked.

## Readiness

- CHALWA: `execution_state=STAGING_READY`
- KlodHost: `execution_state=STAGING_READY`
- Marketing Agency: `execution_state=STAGING_READY`
- `READY_FOR_HUMAN_TEST=NONE` pending the manual browser checks above and subsequent human acceptance decision.