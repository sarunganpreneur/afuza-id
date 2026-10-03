# AX-05-B0 Tester Auth Activation Evidence

Verified: 2026-10-04 on `afuza-core-01`.

## Public Tester Auth

- All 11 configured fixture identities were tested over their public HTTPS staging origins.
- Invalid fixture secret returned HTTP 401 for every identity.
- Valid login returned HTTP 200 and the expected identity exactly matched the external, mode-0600 fixture record.
- Login response did not contain the raw tester secret. No secret or hash was printed to terminal output.
- Session cookie included `Secure`, `HttpOnly`, and `SameSite=Strict` for every identity.
- Session endpoint returned HTTP 200 with matching server-side fixture identity, even when forged `x-staging-role`, `x-staging-tenant`, and `x-staging-principal` headers were sent.
- Logout returned HTTP 200 and subsequent session access returned HTTP 401 for every identity.
- Fixture activation: PASS. Fixture files are external under `/etc/afuza/staging`, mode 0600. Raw tester secret file remains `/root/ax05-b0-tester-secrets.json`, mode 0600, root-owned. No fixture or raw-secret path is tracked by the app repos.

## Runtime Safety

- CHALWA, KlodHost, and Marketing Agency staging services active; each `NRestarts=0`.
- Public `/health` and `/ready` return HTTP 200 for all three staging domains.
- Direct app listeners are loopback-only: `127.0.0.1:4511`, `127.0.0.1:4512`, `127.0.0.1:4513`.
- KlodHost remains `PROVIDER_MODE=fake`, `NODE_AGENT_MODE=fake`.
- Marketing Agency remains `SHARED_ADAPTER_MODE=fake-stub`.
- Production `afuza-id.service` remains active and has no tester enablement/drop-in. No production files, service configuration, or runtime were modified.
- Smoke credentials remain separate and unchanged.

## Project Gates

- CHALWA: lint PASS; typecheck PASS; tests PASS (25/25); build PASS; `git diff --check` PASS. App commits: `232c92f34eff178a9ca769edf7918b526221da14`, `c200911534d1c0f535c66b2584b3bd2d0d9d4f7e`.
- KlodHost: lint PASS; typecheck PASS; tests PASS (22/22); build PASS; `git diff --check` PASS. App commits: `f7db4ddbbec7179b081bf4962c76633c8d2923e0`, `007a48d4ff21d7106cc78e7e0ef2aa2a7dee69fe`.
- Marketing Agency: lint PASS; typecheck PASS; tests PASS (18/18); build PASS; `git diff --check` PASS. App commits: `122c6beaca7dea8fb2c3e1292be933152deafbcf`, `b4c95e6d6f31ba959d5e5501f956bb42ab6bb859`.
- Canonical control: `afuzactl doctor`, ecosystem readiness/report, portfolio status/readiness/plan/inventory, inbox status, and `afuzactl verify` all PASS.

## Readiness

- CHALWA, KlodHost, and Marketing Agency remain `execution_state=STAGING_READY`.
- `READY_FOR_HUMAN_TEST=NONE`; this evidence does not promote readiness.
- Terminal evidence: `STAGING_TESTER_AUTH_READY` confirmed for all three services.