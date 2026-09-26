# AFUZA.ID Roadmap

Status: derived from current code, docs, schema, TODOs, and approved product order
Verified at: 2026-09-16
Production HEAD: `d55edeb31ac4beb02920829946b76e8e525a5eb8`

Do not invent features. Classify work from evidence.

---

## P0 — Source of Truth / operational correctness

| Item | Evidence | Status after Phase 0 |
| --- | --- | --- |
| Stale `AGENTS.md` / `CLAUDE.md` / `README.md` | Create Next App / Next.js agent stubs | Replaced with AFUZA instructions in this staging tree |
| Stale baseline SHA | `docs/releases/AFUZA_V1_BASELINE.md` listed `753e88f`; tag `afuza-v1-e2e-baseline` peels to `9ad9c6b`; production HEAD is `ec0d57e` | Baseline metadata updated to record actual production HEAD |
| Stale migration/packet status | Packet READMEs still say "unexecuted" while production code calls the RPCs | Marked as documentation drift; live vs packet status recorded, not silently re-applied |
| Site-assets provisioning docs | Image packet says bucket `NOT APPLIED` while Image Pipeline V1 is locked in production | Documented as operational verification gap (P1) |
| Broken git ref / mixed `.git` ownership | `.git/objects` mixed `nobody`/`root`; `nobody` sees `detected dubious ownership`; `git fsck --full` as a privileged reader reported no missing objects | Documented only. Do not `chown -R`, reset, or merge `main` |
| Staging vs production worktrees | Three worktrees, parallel histories, `main` still starter | Documented in blueprint and this file |
| Edit & Regenerate V1 | E2E verified on site `5621138d-8900-4d15-a470-f95984bbfa6e`; new generation preserves published version and reaches review at `RENDERING` | **LOCKED** |
| Manual Publish V1 | E2E verified with `publish_site_version`; V2 published while V1 remained preserved | **LOCKED** |

Phase 0 does not repair git permissions or refs.

---

## P1 — Existing contract gaps / bugs

Audit before implementing. Do not implement if already solved on current HEAD.

| Candidate | Evidence | Notes |
| --- | --- | --- |
| OTP delivery failure compensation | `src/app/actions/otp.ts` TODO Phase 5E.2B; `src/lib/otp/delivery.ts` | Challenge can exist after delivery failure. Default provider is `disabled`. |
| Phone/email eligibility edge case | `getIneligiblePath` returns `/verify-whatsapp` when email is verified but account is not dashboard-eligible, even if phone verification is not required | Confirm intended routing vs `account_status !== VERIFIED` |
| Image storage operational verification | Packet: site-assets provisioning `NOT APPLIED`; code stores to `sites/<siteId>/generation-jobs/...` | Needs read-only storage/RPC verification, not a silent bucket create |
| Documentation/runtime drift | Packet READMEs vs live publish/generation RPCs | Continue updating stale banners when behavior is re-verified |

---

## P2 — Core product expansion

Order unless evidence supports a better dependency:

1. **Custom Domain V1** — only after auditing existing domain types in schema and real DNS/infra

---

## P3 — Monetization

Usage / credit / billing V1 after auditing live `plans` (health check selects `plans.code`) plus schema tables for orders, payments, subscriptions, entitlements.

Do not block working Generation V1 until billing is ready. Keep payment lifecycle separate from generation lifecycle.

---

## P4 — Growth / integrations

Admin V1, analytics V1, then omni/external integrations. Do not restore n8n as generation runtime unless explicitly approved.

---

## FUTURE — reserved or speculative

Present in `../schema/afuza_id_v1_1_multi_payment_schema.sql` or comments, not proven live product:

- affiliate / partner L2 / opportunities
- generation job auto-advance through `VALIDATING` → `DEPLOYING` → `VERIFYING` → job `LIVE`
- n8n worker runtime
- WAHA / n8n OTP providers
- export/build pipeline
- notification fan-out beyond current auth email/OTP

---

## Worktree map

| Tree | Branch | Role |
| --- | --- | --- |
| `/home/afuzaid/web/afuza.id/private/app` | `feature/afuza-homepage-20260912` | Production |
| `/home/afuzaid/web/afuza.id/private/staging-lifecycle` | `feature/site-review-publish-v1-20260912` | Staging / development |
| `/home/afuzaid/web/afuza.id/private/staging-homepage` | `feature/afuza-homepage-ui-20260912` | Older homepage staging; not the default feature worktree |

Do not merge `main` into production. Do not reset production to `main`.
