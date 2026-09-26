<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AFUZA.ID — Agent Instructions

This repository is **AFUZA.ID**, not a generic Next.js starter.

Read before changing product behavior:

1. `docs/AFUZA_MASTER_BLUEPRINT.md`
2. `docs/ROADMAP.md`
3. `docs/releases/AFUZA_V1_BASELINE.md`
4. `docs/STALE_DOCUMENTS.md`

## Source of truth

1. Current production code + tests on production HEAD
2. V1 baseline document (compare SHA with actual production HEAD)
3. Executable contracts (`docs/site-content-v1.md`, site-content schema/validation, worker, publish, review, renderer, RPCs)
4. Architecture / database docs (may be stale)
5. `../schema/afuza_id_v1_1_multi_payment_schema.sql` is a **future domain map**, not proof of implementation
6. These agent files

If documentation contradicts production code and tests, report DOCUMENTATION DRIFT and follow verified behavior.

## Locations

- Production: `/home/afuzaid/web/afuza.id/private/app`
- Staging: `/home/afuzaid/web/afuza.id/private/staging-lifecycle`
- Schema history: `/home/afuzaid/web/afuza.id/private/schema`
- Public app: https://afuza.id

Implement features in staging. Do not edit production first.

## Locked V1

Do not change locked Generation/Review/Publish V1 components without audit, explicit reason, regression tests, full gates, and a production verification plan. See the baseline document.

## Generation V1

`RENDERING` is the review-ready terminal boundary. Do not auto-advance `VALIDATING`, `DEPLOYING`, `VERIFYING`, or generation-job `LIVE`.

Review-ready requires job `RENDERING`, `current_content_version > 0`, matching `site_versions` row, and `schemaVersion === site_content_v1`.

Public online requires `sites.status === LIVE` and `sites.published_version === selectedVersion`. Never auto-publish.

Worker: systemd timer → oneshot → `npm run generation:worker -- --once`. Empty queue is success. Failures go through `fail_generation_job`. No automatic requeue. No direct lifecycle UPDATEs.

## Safety

Never destructive SQL, secret printing, credential commits, fabricated business facts, or weakening validators to pass generation.

Stop for migrations, DB/storage mutations, systemd/DNS/billing changes, and operator publish actions unless explicitly approved.

## Quality gates

Before calling a change ready:

```text
npm run lint
npm run build
npx tsc --noEmit --pretty false
npm run test -- --run
git diff --check
```

Do not delete tests to make gates green. Do not `git add .` when unrelated files exist.

## UI language

User UI uses human Indonesian labels, not internal statuses such as `QUEUED` or `RENDERING`.
