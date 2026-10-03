# AX-05-A Staging Tester Auth Contract And Evidence

## Contract

- Tester routes exist only when `APP_ENV=staging` and `TESTER_UI_ENABLED=true`. All other environments fail closed; disabled `/tester/*` routes return 404.
- `TESTER_FIXTURES_FILE` points to an external JSON file, not tracked in Git. The file must be a regular file with mode `0600` or stricter, contain 1-32 fixture entries, and use version 1.
- Each fixture has an immutable `id`, `secretHash` encoded as `scrypt$<base64url-salt>$<base64url-digest>`, and a server-controlled `identity`. Login secrets must be at least 16 bytes. Fixture secrets and hashes must never be committed. Use unique, high-entropy tester secrets; do not reuse the protected systemd smoke credential.
- `POST /tester/login` accepts only a fixture ID and secret in JSON, rejects Authorization headers, validates same-origin Origin/Host, and returns a 30-minute opaque server-side session cookie. Login responses never return a secret or hash.
- Cookie: `__Host-afuza-staging-tester`; `Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`. Sessions are in-memory, limited to 256 active entries, and invalidated by logout, expiry, or process restart.
- `GET /tester/session` returns the allowlisted server identity; `POST /tester/logout` revokes the session and expires its cookie. Invalid sessions receive 401.
- Tester identities come only from the protected fixture file and server-side session map. Client role, tenant, subject, and worker headers are not used for tester auth. A present invalid tester cookie is rejected and cannot fall through to smoke auth.
- Login/logout and every tester-cookie-authenticated POST require matching Origin and Host; non-HTTPS origins are accepted only for local loopback tests. Forwarded requests require matching forwarded host and HTTPS forwarded protocol. Tester responses are `Cache-Control: no-store`. No CORS allowance is added.
- Existing `STAGING_AUTH_MODE=loopback-smoke` and its protected bearer-token path are unchanged and separate.
- CHALWA fixtures support `designer`, `product_manager`, `admin`, and `customer`. KlodHost fixtures support tenant or worker/operator identities; worker/operator claims are privileged only in this staging-only session and the application remains fake-provider/fake-node-agent only. Marketing Agency fixtures support `operator` and tenant-bound `owner`, `manager`, or `member` identities.
- Application config continues to reject production mode. `TESTER_UI_ENABLED=true` is rejected outside staging. Marketing Agency shared adapters remain fake-stub only.

## Runtime Provisioning Boundary

The three staging systemd units have not been enabled for tester auth and no tester fixture file or tester secret was created by AX-05-A. Before a human tester can log in, an operator must provision the external fixture file with owner-only permissions and explicitly set `TESTER_UI_ENABLED=true` plus `TESTER_FIXTURES_FILE` in the respective staging environment. Do not restart or enable these settings in production. No dashboard/UI was added.

## Verification Evidence

- CHALWA commits: `232c92f34eff178a9ca769edf7918b526221da14`, `c200911534d1c0f535c66b2584b3bd2d0d9d4f7e`; `STAGING_TESTER_AUTH_READY`; lint, typecheck, build, diff check PASS; 25/25 tests PASS, including tester security tests.
- KlodHost commits: `f7db4ddbbec7179b081bf4962c76633c8d2923e0`, `007a48d4ff21d7106cc78e7e0ef2aa2a7dee69fe`; `STAGING_TESTER_AUTH_READY`; lint, typecheck, build, diff check PASS; 22/22 tests PASS, including tester security and fake-provider/fake-node-agent guard tests.
- Marketing Agency commits: `122c6beaca7dea8fb2c3e1292be933152deafbcf`, `b4c95e6d6f31ba959d5e5501f956bb42ab6bb859`; `STAGING_TESTER_AUTH_READY`; lint, typecheck, build, diff check PASS; 18/18 tests PASS, including tenant binding and cross-tenant denial tests.
- Security coverage includes disabled-by-default and outside-staging guards, trusted fixture identity, forged identity-header resistance, invalid/expired sessions, logout revocation, smoke-bearer separation, secret non-disclosure, secure cookie attributes, same-origin mutation validation, tenant isolation, and fake-only mode guards.
- No readiness promotion is asserted. CHALWA, KlodHost, and Marketing Agency remain `execution_state=STAGING_READY`; `READY_FOR_HUMAN_TEST=NONE` pending tester fixture provisioning and the separate browser UI work.