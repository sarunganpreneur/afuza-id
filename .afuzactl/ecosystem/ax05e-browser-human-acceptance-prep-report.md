# AX-05-E Browser Human Acceptance Preparation

Verified on `afuza-core-01`, 2026-10-04. Project-owner human acceptance results were supplied on 2026-10-04 and recorded at `2026-10-04T05:12:23+07:00` server time; the owner did not specify a separate completion timestamp.

## Owner Human Acceptance

- CHALWA: `tester-designer` PASS; `tester-product_manager` PASS; `tester-admin` PASS; `tester-customer` PASS; logout PASS.
- KlodHost: `tester-tenant-a` PASS; `tester-tenant-b` PASS; `tester-worker` PASS; logout PASS.
- Marketing Agency: `tester-operator` PASS; `tester-owner-a` PASS; `tester-owner-b` PASS; `tester-member-a` PASS; logout PASS.
- The project owner supplied these results as the final manual browser acceptance. The browser tabs used for machine verification remained signed out; no fixture secrets were passed through browser automation.
- KlodHost deterministic failure creation remains unavailable through its current HTTP API. Retry is present, but failure-to-retry was not exercised. This is a documented limitation, not a PASS, and no synthetic failure mechanism was added.

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
| CHALWA | `tester-designer`, `tester-product_manager`, `tester-admin`, `tester-customer` | Machine checks PASS; owner reports PASS for all four roles and logout | None reported by owner |
| KlodHost | `tester-tenant-a`, `tester-tenant-b`, `tester-worker` | Machine checks PASS; owner reports PASS for all three roles and logout; fake-mode checks PASS | Deterministic failure-to-retry remains untested because no failure-creation API exists |
| Marketing Agency | `tester-operator`, `tester-owner-a`, `tester-owner-b`, `tester-member-a` | Machine checks PASS; owner reports PASS for all four roles and logout; own-tenant access PASS and cross-tenant denial PASS | None reported by owner |

The shared browser tabs were intentionally left signed out during machine verification. Fixture secrets were never entered into browser-tool source, terminal output, DOM, or storage. Role-specific UI rules are covered by served markup/security tests, and the project owner subsequently supplied the signed-in role and logout PASS results above.

## KlodHost Limitation

The current KlodHost HTTP API has no deterministic failure-creation operation. The tester console exposes retry for an already-failed job, but cannot safely produce that state through the existing API. No synthetic failure mechanism was added; doing so would require a separate architecture/product decision. Do not interpret this as a provider failure test.

## Verification

- App gates: CHALWA lint/typecheck/build/diff check PASS, 26/26 tests; KlodHost PASS, 23/23 tests; Marketing Agency PASS, 19/19 tests.
- App heads: CHALWA `dcaa36ea006f561412a76f6c24a95d68dbc7677e`; KlodHost `d6d315388ffdee62f70c875ba26f2688be905ea8`; Marketing Agency `6443121d1c6d5d9b3019834721ee520b28883e45`.
- Canonical control: `afuzactl doctor`, ecosystem readiness, portfolio readiness, and `afuzactl verify` PASS. Verify included control lint, typecheck, tests, build, and AFUZA.ID staging health smoke.
- Production remains untouched; KlodHost remains fake provider/fake node agent; Marketing Agency remains fake-stub; no live external action was invoked.

## Readiness

- CHALWA: readiness `READY_FOR_HUMAN_TEST`; `execution_state=STAGING_READY`.
- KlodHost: readiness `READY_FOR_HUMAN_TEST`; `execution_state=STAGING_READY`.
- Marketing Agency: readiness `READY_FOR_HUMAN_TEST`; `execution_state=STAGING_READY`.
- No other project is promoted. These states do not imply production readiness.