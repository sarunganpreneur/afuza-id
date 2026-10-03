# AX Staging Runtime Verification

- Verified at: `2026-10-03T07:08:23+07:00`
- Services: dedicated systemd units, enabled, running as `afuzaid`; all bind only to loopback
- Systemd units: `systemd-analyze verify` PASS
- Nginx: unchanged; `nginx -t` PASS with pre-existing Waha IPv6 protocol-options warning
- Public routing: not configured. All three target domains return no DNS records, and `/etc/letsencrypt/live/afuza.id/fullchain.pem` SANs are only `afuza.id` and `www.afuza.id`. No HTTPS response claimed; adding vhosts without DNS/TLS coverage was intentionally avoided.
- Smoke identity: explicit `STAGING_AUTH_MODE=loopback-smoke`; app checks loopback peer and rejects forwarded requests. No credentials/secrets are configured.
- Persistence: in-memory. One restart per service succeeded, readiness returned 200, and disposable records reset as expected.
- Production: not modified. No provider, customer, outbound messaging, billing, or shared acquisition API calls.

## CHALWA.id

- Service: `chalwa-staging.service` (enabled, active, `User=afuzaid`)
- Port: `127.0.0.1:4511`
- Domain: `chalwa.afuza.id` pending DNS and matching TLS certificate; localhost-only for this verification
- Configuration: `APP_ENV=staging`; in-memory repositories; `STAGING_AUTH_MODE=loopback-smoke`
- Health/readiness: HTTP 200 / HTTP 200 before and after restart
- Smoke: design created, generated, reviewed, approved, made ready for product; product created and published; duplicate SKU rejected; eight audit events persisted; forwarded auth rejected
- Restart: PASS; design/product state reset as expected
- Logs: clean after corrected entrypoint path; current restart counter 0
- Project commit: `42dd8cef4b757c61891ae332a7b57fe9022bda52`
- Terminal evidence: `CHALWA_APPLICATION_INTEGRATION_READY`

## KlodHost

- Service: `klodhost-staging.service` (enabled, active, `User=afuzaid`)
- Port: `127.0.0.1:4512`
- Domain: `klodhost.afuza.id` pending DNS and matching TLS certificate; localhost-only for this verification
- Configuration: `APP_ENV=staging`; `PROVIDER_MODE=fake`; `NODE_AGENT_MODE=fake`; `STAGING_AUTH_MODE=loopback-smoke`
- Health/readiness: HTTP 200 / HTTP 200 before and after restart
- Smoke: fake-only job reached ACTIVE through VALIDATED, QUEUED, PROVISIONING, CONFIGURING, VERIFYING; duplicate request/advance idempotency passed; cancellation and tenant isolation passed; seven audit events persisted; forwarded worker auth rejected
- Restart: PASS; job state reset as expected
- Logs: clean after corrected entrypoint path; current restart counter 0; no real provider calls
- Project commit: `b48a87f6a72f011f80d3f43b28f69764c30a6f66`
- Terminal evidence: `PROVISIONING_APPLICATION_INTEGRATION_READY`

## Marketing Agency

- Service: `marketing-agency-staging.service` (enabled, active, `User=afuzaid`)
- Port: `127.0.0.1:4513`
- Domain: `marketingagency.afuza.id` pending DNS and matching TLS certificate; localhost-only for this verification
- Configuration: `APP_ENV=staging`; `SHARED_ADAPTER_MODE=fake-stub`; `STAGING_AUTH_MODE=loopback-smoke`
- Health/readiness: HTTP 200 / HTTP 200 before and after restart
- Smoke: tenant and initial membership bootstrap, client, assignment, subscription, approved fake lead-discovery contract action, denied approval, tenant-isolated portal/audit read, and forwarded auth rejection passed; no local Campaign/Lead models or live shared-service calls
- Restart: PASS; tenant state reset as expected
- Logs: clean after corrected entrypoint path; current restart counter 0
- Project commit: `3d9e9bbc5d34ba2daac5584118a1347a8953ec2a`
- Terminal evidence: `TENANT_APPLICATION_INTEGRATION_READY`

All projects remain `EXECUTION_SPEC_READY` and `AUTONOMOUS_BUILD_READY`. Runtime gate passed locally; public HTTPS routing remains pending DNS and certificate provisioning. `READY_FOR_HUMAN_TEST` is not asserted.