# AFUZA V1 Production Baseline

Status: locked
Release tag: `afuza-v1-e2e-baseline` (annotated tag; peeled commit `9ad9c6bd069562e82a61814863ea30612de31433`)

This file records the locked Generation/Review/Publish V1 behavior, including Edit & Regenerate V1 and Manual Publish V1. SHA values below were verified on 2026-09-16. Prefer actual production `HEAD` over any older SHA copied into documents.

## Production

- Production worktree: `/home/afuzaid/web/afuza.id/private/app`
- Production branch: `feature/afuza-homepage-20260912`
- Production HEAD (2026-09-16): `d55edeb31ac4beb02920829946b76e8e525a5eb8` — `fix: harden source-grounded usp summary generation`
- Previous baseline SHA recorded in the original baseline commit: `753e88fcfe211894e486abcd6dcadbd1bb4edeeb` (superseded; later production commits added dashboard sites UX, title readability, and first-website onboarding)
- Health endpoint: `https://afuza.id/api/health` (observed `status=ok`, `database=reachable` on 2026-09-15)
- Public route format: `https://afuza.id/p/<slug>`
- Application unit: `afuza-id.service` (observed `active`)
- Worker units: `afuza-generation-worker.service` and `afuza-generation-worker.timer` (timer observed `active`)
- Worker runtime: systemd oneshot service, timer-driven, one job per run

## End-to-end flow

```text
Create Site -> Generate -> QUEUED -> ANALYZING -> GENERATING_CONTENT
-> GENERATING_IMAGES -> RENDERING -> Review -> Publish -> Public Site
```

Generation V1 terminal state is `RENDERING`. Post-render lifecycle labels
`VALIDATING`, `DEPLOYING`, `VERIFYING`, and `LIVE` remain reserved for future
explicit automation and are not advanced automatically by Generation V1.

## Review and publish invariants

Review-ready requires all of:

- generation job status is `RENDERING`;
- `sites.current_content_version > 0`;
- a matching `site_versions` row exists; and
- `content_snapshot.schemaVersion = site_content_v1`.

Online state requires both:

- `sites.status = LIVE`; and
- `sites.published_version` equals the selected version.

Publishing is an explicit authenticated user action. Generation never
auto-publishes.

## Edit & Regenerate V1 and Manual Publish V1 lock

The following behavior is locked after production E2E verification on
`Bakso Marem Auto Worker Test 4` (`site_id`
`5621138d-8900-4d15-a470-f95984bbfa6e`, slug
`bakso-marem-auto-worker-test-4`):

- save the edited brief before requesting a new generation;
- keep the currently published version live while the new version generates;
- stop successful generation at `RENDERING` for review;
- write a separate `site_versions` row and update `current_content_version`;
- leave `published_version` unchanged until explicit authenticated publish;
- default review to the newest unpublished version, with valid `?version=N`
  taking precedence and invalid versions falling back safely;
- publish through `publish_site_version(uuid, integer)` only;
- serve the public site through `get_published_site(text)` and
  `published_version`;
- preserve prior version rows.

Verified successful job: `0f02a15e-5cac-42f8-8535-de5dd148c5b7` (`RENDERING`,
`retry_count = 0`). Final verified state was `LIVE`,
`current_content_version = 2`, `published_version = 2`, with versions 1 and 2
both preserved. Four generated Supabase Storage images were served as
`image/webp` over HTTP 200.

## Storage

- Bucket: `site-assets`
- Generated object path: `sites/<site_id>/generation-jobs/<job_id>/attempt-<retry_count>/`
- Public asset URL base: `/storage/v1/object/public/site-assets/`

Operational note: the image-pipeline packet still labels site-assets bucket
provisioning as not applied. Production code implements the canonical path.
Treat bucket existence as a P1 operational verification item, not as a reason
to change Image Pipeline V1.

## Locked V1 components

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
- Review -> Publish UX V1
- Publish Flow V1
- Manual Publish V1
- Public Renderer V1
- Dashboard Sites UX V1
- First Website Onboarding V1

Future changes to these components require focused regression testing and a
new release review.

## Git caution

- `main` remains the Create Next App initial commit. Do not merge it into production.
- Production and staging worktrees share one repository with parallel commit histories.
- `.git` object ownership is mixed (`nobody` / `root`). Do not recursively `chown` or auto-repair refs.
