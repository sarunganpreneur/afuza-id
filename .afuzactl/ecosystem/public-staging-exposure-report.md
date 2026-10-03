# AX Public Staging Exposure Verification

- Verified at: `2026-10-03T18:45:05+07:00`
- Control baseline: `84d640cef46388fa09464304e141c7d7af19a4fe`
- Public address: `178.238.235.78`; DNS-only A records, TTL 300
- Authoritative DNS: both Cloudflare nameservers return the expected A for all three hostnames; recursive resolver also returns the same addresses
- Certificate: dedicated ECDSA SAN certificate `afuza-public-staging`, serial `05161CCF681389356911DD7AAB525AEE28CE`, valid until `2027-01-01 10:32:26 GMT`; SAN covers all three requested names
- Renewal: Certbot Nginx authenticator/installer; targeted `certbot renew --cert-name afuza-public-staging --dry-run` succeeded; Certbot timer active
- Nginx: isolated file `/etc/nginx/sites-available/afuza-public-staging`; HTTP redirects to HTTPS; HTTPS proxies only to loopback ports 4511/4512/4513; required forwarded headers preserved; `nginx -t` PASS and Nginx reloaded, not restarted
- Existing apex production vhost remains `afuza.id` / `www.afuza.id` -> `127.0.0.1:4100`; its service PID/state was unchanged across reload
- Systemd staging units use protected per-service `LoadCredential` smoke tokens; token values are not recorded here
- Security: app ports remain bound to `127.0.0.1`; no firewall rules expose 4511–4513; no debug route or environment disclosure; unauthenticated forwarded staging-role headers receive 403 on each protected app route; no production upstream or real provider/shared-service calls
- Nginx validation warning: existing Waha IPv6 listener reports protocol options redefined; configuration syntax/test succeeds
- Execution states remain `STAGING_READY`; `READY_FOR_HUMAN_TEST` remains NONE

## CHALWA.id

- DNS: `chalwa.afuza.id A 178.238.235.78`
- Certificate: SAN covered; hostname-verified HTTPS
- Route: `chalwa.afuza.id` -> `http://127.0.0.1:4511`
- HTTPS health/readiness: `200` / `200`
- Public smoke: design draft -> generated -> review required -> approved -> ready for product -> product created -> published; duplicate SKU rejected; 8 audit events verified; no-token admin spoof denied `403`
- Project commit: `ddde0dda7a8614d1ca14b5bc96deb03b29048d0f`

## KlodHost

- DNS: `klodhost.afuza.id A 178.238.235.78`
- Certificate: SAN covered; hostname-verified HTTPS
- Route: `klodhost.afuza.id` -> `http://127.0.0.1:4512`
- HTTPS health/readiness: `200` / `200`
- Public smoke: fake-only provisioning reached ACTIVE; idempotent replay passed; cross-tenant read denied; no-token worker spoof denied `403`; no real provider call
- Provider/node-agent: fake/fake
- Project commit: `9417e7946b884449de7d4e7299507c1c55073f7d`

## Marketing Agency

- DNS: `marketingagency.afuza.id A 178.238.235.78`
- Certificate: SAN covered; hostname-verified HTTPS
- Route: `marketingagency.afuza.id` -> `http://127.0.0.1:4513`
- HTTPS health/readiness: `200` / `200`
- Public smoke: tenant, owner membership, client, subscription, approved fake action, denied approval, tenant-scoped portal/audit; cross-tenant read denied; no-token operator spoof denied `403`
- Adapter mode: fake/stub; no live acquisition or other shared API call
- Project commit: `4748dd3954c50c9e8a3d7e87213b8c15c857e1ba`

Public HTTPS exposure is verified. This does not satisfy or claim the separate human acceptance gate.
