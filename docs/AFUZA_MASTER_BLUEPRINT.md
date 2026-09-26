# AFUZA.ID Master Blueprint

Status: source of truth for product, architecture, and operating rules
Verified at: 2026-09-16
Production HEAD (operational truth): `d55edeb31ac4beb02920829946b76e8e525a5eb8`
Staging HEAD at this documentation commit: see `git rev-parse HEAD` in this worktree

If this document conflicts with older architecture notes, use current production code and tests first.

---

## 1. Product Vision

AFUZA.ID enables business owners to create, review, publish, and manage websites using AI with minimal technical knowledge.

The current production product is Generation V1 plus Review/Publish V1:

1. Authenticated owner creates a site and saves a business brief.
2. Owner requests generation.
3. A systemd-driven worker analyzes the business, writes `site_content_v1`, generates images into Supabase Storage, and commits a site version.
4. Owner reviews the version.
5. Owner explicitly publishes.
6. The public renderer serves only the published version at `/p/[slug]`.

---

## 2. Primary Users

Evidence from the live product and copy supports these audiences:

- UMKM
- local businesses
- service businesses
- institutions
- new entrepreneurs

Do not invent persona details, market sizes, or unstated jobs-to-be-done beyond this.

---

## 3. Product Architecture

Live implementation (production code + tests):

| Area | Location / runtime |
| --- | --- |
| Web app | Next.js App Router in this repository |
| Auth | Supabase Auth; email verification; optional WhatsApp OTP behind `PHONE_VERIFICATION_REQUIRED` |
| Dashboard | `/dashboard`, `/dashboard/sites/new` |
| Site Brief | `/dashboard/sites/[siteId]/brief` + `src/app/actions/brief.ts` |
| AI Analysis | worker + `src/lib/server/website-analysis.ts` + `complete_generation_analysis` RPC |
| AI Content | worker + `SiteContentV1` + `commit_generated_site_version` |
| Image generation | `src/lib/generation/images/*` into bucket `site-assets` |
| Worker | `npm run generation:worker -- --once` via systemd oneshot + timer |
| Storage | Supabase Storage bucket `site-assets` |
| Site versions | `site_versions` rows; numeric `sites.current_content_version` |
| Review | `/dashboard/sites/[siteId]/review` |
| Publish | authenticated RPCs `publish_site_version` / `unpublish_site` |
| Public renderer | `/p/[slug]` via `get_published_site` |

Internal worker HTTP routes still exist under `/api/internal/generation/*`. The live V1 worker uses RPCs and the image pipeline directly; those HTTP routes are not the systemd worker entrypoint.

---

## 4. Lifecycle Contracts

### 4.1 Generation V1 flow

```text
Create Site
→ Save Brief
→ Request Generation
→ QUEUED
→ ANALYZING
→ GENERATING_CONTENT
→ GENERATING_IMAGES
→ RENDERING
→ USER REVIEW
→ USER PUBLISH
→ PUBLIC SITE
```

For Generation V1, `RENDERING` is the review-ready terminal boundary.

### 4.2 LIVE IMPLEMENTATION vs RESERVED CONTRACT vs FUTURE BACKLOG

LIVE IMPLEMENTATION

- Job statuses used by the worker success path: `QUEUED`, `ANALYZING`, `GENERATING_CONTENT`, `GENERATING_IMAGES`, `RENDERING`
- Failure: `ERROR` through `fail_generation_job`
- Site publication: `sites.status = LIVE` and `sites.published_version = selectedVersion`
- Public route: `/p/[slug]`

RESERVED CONTRACT (exist in enums / docs; not auto-advanced by Generation V1)

- `VALIDATING`
- `DEPLOYING`
- `VERIFYING`
- generation job `LIVE`

Do not force a generation job to `LIVE`. Generation job `LIVE` and public site `LIVE` are different concepts.

FUTURE BACKLOG (schema / comments only unless a later approved phase implements them)

- `../schema/afuza_id_v1_1_multi_payment_schema.sql` domain map (billing, affiliate, partner, custom domain, n8n as backend)
- OTP providers `waha` / `n8n` (commented, not implemented)
- Admin console, analytics, omni integrations

### 4.3 Review-ready invariant

A website is review-ready only when all are true:

- `generation_jobs.status === RENDERING`
- `site.current_content_version > 0`
- matching `site_versions` row exists
- `content_snapshot.schemaVersion === site_content_v1`

Never infer review readiness from status alone. Code: `isGenerationReviewReady` and `getDashboardSiteState`.

### 4.4 Publication invariant

Selected version is publicly online only when:

- `sites.status === LIVE`
- `sites.published_version === selectedVersion`

Publishing is an explicit authenticated user action. Generation never auto-publishes.

### 4.5 Edit & Regenerate V1 lock

Edit & Regenerate V1 is locked and production-verified:

- editing an existing site returns the owner to the brief;
- saving the latest brief happens before requesting generation;
- generation creates a new `site_versions` row and updates `sites.current_content_version`;
- the existing `sites.published_version` remains public while generation runs;
- a successful generation stops at `RENDERING` for review;
- generation never publishes or changes `sites.published_version`;
- review defaults to the newest unpublished version when one exists;
- an explicit valid `?version=N` selects that version; invalid or missing versions fall back safely.

The verified E2E site reached `current_content_version = 2` with `published_version = 2` after an explicit manual publish, while version 1 remained preserved.

### 4.6 Manual Publish V1 lock

Manual Publish V1 is locked and remains separate from generation:

- only an explicit authenticated owner action may publish;
- the official RPC is `publish_site_version(uuid, integer)`;
- the public renderer reads the version selected by `published_version` through `get_published_site(text)`;
- publishing changes `published_version`, not the generation job status;
- previous `site_versions` rows remain preserved;
- while a newer version is unpublished, the dashboard remains `Website sudah online` and shows `Ada versi baru yang belum dipublish` with `Review Versi Baru`.

### 4.7 Automatic worker contract

Runtime:

```text
systemd timer
→ oneshot worker
→ npm run generation:worker -- --once
```

Units (installed on the production host):

- `afuza-id.service` — Next.js `next start` on `127.0.0.1:4100`
- `afuza-generation-worker.service`
- `afuza-generation-worker.timer` — `OnBootSec=30s`, `OnUnitInactiveSec=20s`

Worker rules:

- claims at most one queued generation
- processes one job and exits
- empty queue is a normal success (`no_work`)
- failure must end `ERROR` through the official failure RPC
- no automatic requeue
- no infinite retry
- no direct `generation_jobs` UPDATE from application code
- do not replace systemd with n8n because the historical schema mentions n8n

---

## 5. Locked V1 Components

Treat as locked until audit + explicit reason + regression tests + full gates + production verification plan:

- Authentication V1
- Site Brief V1
- Visual V1
- SiteContentV1 contract
- AI Analysis V1
- Analysis Normalization V1
- AI Content Generation V1
- CTA Normalization V1
- Image Pipeline V1
- Automatic Worker V1
- Failure Handling V1
- Generation Success Path V1
- Versioning V1
- Edit & Regenerate V1
- Generation Progress UX V1
- Review UX V1
- Review → Publish UX V1
- Publish Flow V1
- Manual Publish V1
- Public Renderer V1
- Dashboard Sites UX V1
- First Website Onboarding V1

---

## 6. Current Infrastructure

| Item | Value |
| --- | --- |
| Public app | https://afuza.id |
| Health | https://afuza.id/api/health |
| Production tree | `/home/afuzaid/web/afuza.id/private/app` |
| Staging / development tree | `/home/afuzaid/web/afuza.id/private/staging-lifecycle` |
| Homepage staging tree | `/home/afuzaid/web/afuza.id/private/staging-homepage` |
| Schema / historical contracts | `/home/afuzaid/web/afuza.id/private/schema` |
| Production branch | `feature/afuza-homepage-20260912` (not `main`) |
| Staging branch | `feature/site-review-publish-v1-20260912` |
| `main` | Create Next App initial commit `e8741b3` — do not merge blindly |
| Production SHA at Phase 0 audit | `ec0d57e7c9b0d714bb0321fc5897a5ede3df6910` (`feat: add first website onboarding ux`) |
| Baseline git tag | `afuza-v1-e2e-baseline` → annotated object; peeled commit `9ad9c6bd069562e82a61814863ea30612de31433` |
| App unit | `afuza-id.service` (verified `active` on 2026-09-15) |
| Worker timer | `afuza-generation-worker.timer` (verified `active` on 2026-09-15) |
| Health on 2026-09-15 | `{"status":"ok","app":"afuza-id","database":"reachable"}` |

Git worktrees share one `.git` directory. Production and staging histories are parallel (similar commit messages, different SHAs). Do not assume they are the same commit graph.

### Generated assets

- Bucket: `site-assets`
- Path: `sites/<siteId>/generation-jobs/<jobId>/attempt-<retryCount>/<file>`
- Persistent public Supabase refs only
- No generated binaries, temporary OpenAI URLs, base64 payloads, or fake local image URLs in committed content

---

## 7. Security and Safety Rules

Never:

- run destructive SQL without explicit approval
- direct-UPDATE lifecycle rows to "fix" state
- force a job `LIVE`
- auto-publish a site
- silently requeue failed jobs
- reveal secrets or print `.env` values
- commit credentials
- weaken validators just to make generation pass
- fabricate contact details, testimonials, metrics, halal/regulated claims, or business facts
- rewrite production architecture without evidence

Stop at the deployment gate unless explicitly authorized for:

- migrations / database mutation
- storage destructive mutation
- systemd modification
- production worker modification
- publish/unpublish as an operator action
- domain/DNS changes
- billing/payment actions

AI content must be source-backed. Preferred pattern: AI output → deterministic normalization → strict validation → clean `ERROR` if unrecoverable.

Normal user UI must use human language, not internal statuses (`QUEUED`, `RPC`, `retry_count`, etc.).

---

## 8. Future Product Modules

Approved sequence after P0/P1, unless evidence supports a better dependency order:

- Phase A — Custom Domain V1 (audit existing schema/domain model first)
- Phase B — Usage / Credit / Billing V1 (audit plans/orders/payments already in schema)
- Phase C — Admin V1 (`ADMIN` / `SUPPORT` roles exist in future schema)
- Phase D — Analytics V1
- Phase E — Omni / external integrations

Principles:

- A published site stays publicly stable while a new version is generated.
- Keep product lifecycle separate from payment lifecycle.
- Do not block working V1 until billing is ready.

---

## 9. Definition of Done

A change is done only when:

- implementation is complete (or documentation-only scope is complete)
- focused tests pass
- full tests pass
- lint, build, typecheck, and `git diff --check` pass
- production verification is completed if deployed
- documentation is updated
- locked V1 has no unexplained regression
- no unexplained dirty files
- no unresolved safety issue

---

## 10. Technical Roadmap

See `docs/ROADMAP.md`.

Source-of-truth hierarchy:

1. Current production behavior (code + tests on production HEAD)
2. `docs/releases/AFUZA_V1_BASELINE.md`
3. Executable contracts (`docs/site-content-v1.md`, schema/validation, worker/publish/review/renderer, RPCs)
4. Architecture / database documents (may be stale; see `docs/STALE_DOCUMENTS.md`)
5. Future domain model `../schema/afuza_id_v1_1_multi_payment_schema.sql`
6. Agent instructions in `AGENTS.md`, `CLAUDE.md`, `README.md`

Development workflow: audit → design → implement in staging → focused tests → full gates → focused commit → production preflight → deploy only an approved commit → verify → document.

Never edit production first for feature development.
