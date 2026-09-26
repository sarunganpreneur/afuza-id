# Live Database Contract Snapshot

> DOCUMENTATION DRIFT / HISTORICAL SNAPSHOT (marked 2026-09-15)
>
> This file is a 2026-09-12 SQL Editor metadata snapshot. The closing note that
> "the deployment packet remains unexecuted" is **not** a current apply-status
> for Generation V1 or Publish V1. Production application code depends on the
> generation and publish RPCs. Do not re-apply packets from this snapshot
> without a fresh preflight. See `docs/STALE_DOCUMENTS.md`.

Snapshot metadata ini dicatat pada 2026-09-12 setelah verifikasi melalui Supabase SQL Editor. Dokumen ini berisi metadata schema/function saja; tidak memuat row pengguna, payload analysis, token, API key, atau credential.

## Target Tables

| Table | Lifecycle columns | Relevant relations and constraints |
| --- | --- | --- |
| `public.profiles` | `account_status`, `email_verified_at` | PK `id` references `auth.users(id)` |
| `public.sites` | `status`, `current_content_version`, `published_version`, `published_at`, `last_error` | PK `id`; `owner_id` references `auth.users(id)`; `business_id` references `businesses(id)`; unique case-insensitive slug |
| `public.site_briefs` | `submitted_at`, `image_mode` | PK `id`; unique `site_id` references `sites(id)`; unique non-null `submission_id` |
| `public.site_content` | `schema_version`, `updated_at` | PK `id`; unique `site_id` references `sites(id)`; JSONB `content`, `theme`, `seo`, `editor_state` |
| `public.site_versions` | `version_number`, `created_at` | PK `id`; unique `(site_id, version_number)`; `site_id` references `sites(id)` |
| `public.generation_jobs` | `status`, `retry_count`, `queued_at`, `started_at`, `content_completed_at`, `images_completed_at`, `rendered_at`, `deployed_at`, `completed_at`, `failed_at` | PK `id`; `site_id` references `sites(id)`; `requested_by` references `auth.users(id)`; indexes on site/status/execution |

Important JSONB fields:

- `generation_jobs.input_snapshot`
- `generation_jobs.output_summary`
- `site_content.content`
- `site_content.theme`
- `site_content.seo`
- `site_content.editor_state`
- `site_versions.content_snapshot`
- `site_versions.theme_snapshot`
- `site_versions.seo_snapshot`

## RLS and Policies

RLS is enabled for `sites`, `site_briefs`, `site_content`, `site_versions`, and `generation_jobs`. Relevant authenticated policies are select-only owner/admin policies:

- `sites_select_own_or_admin`
- `site_briefs_select_own_or_admin`
- `site_content_select_own_or_admin`
- `site_versions_select_own_or_admin`
- `generation_jobs_select_own_or_admin`

Generation mutation is performed by service-role-only RPCs, not browser table writes. The generation security contract revokes table mutation privileges from `public`, `anon`, and `authenticated`.

## RPC Signatures and Privileges

| RPC | Signature | Security | Execute privilege |
| --- | --- | --- | --- |
| `request_site_generation` | `(uuid)` returns `job_id uuid, status generation_status, created_new boolean` | `SECURITY DEFINER` | `authenticated` only |
| `claim_next_generation_job` | `()` returns job identity, type, status, retry count, input snapshot | `SECURITY INVOKER` | `service_role` only |
| `advance_generation_job` | `(uuid, generation_status, generation_status)` | `SECURITY INVOKER` | `service_role` only |
| `fail_generation_job` | `(uuid, generation_status, text, text)` | `SECURITY INVOKER` | `service_role` only |
| `requeue_failed_generation_job` | `(uuid)` | `SECURITY INVOKER` | `service_role` only |
| `complete_generation_analysis` | `(uuid, uuid, text, jsonb)` returns job/site/status/output summary | `SECURITY DEFINER` | `service_role` only |
| `commit_generated_site_version` | `(uuid, jsonb, jsonb, jsonb, jsonb)` returns version/content/version IDs | `SECURITY INVOKER` | `service_role` only |

The reviewed functions use `search_path = pg_catalog, public`. `public`, `anon`, and `authenticated` do not receive execute on worker mutation RPCs.

## Status Transition

The lifecycle is:

```text
QUEUED -> ANALYZING -> GENERATING_CONTENT -> GENERATING_IMAGES/RENDERING
         -> RENDERING -> VALIDATING -> DEPLOYING -> VERIFYING -> LIVE
```

Failure transitions use `ERROR`; retry requeues only an uncommitted failed job. `CANCELLED`, `ERROR`, and `LIVE` are terminal for first content commit.

## Commit Atomicity and Idempotency

`commit_generated_site_version` derives `site_id` from the locked job and does not accept owner/site identity from the worker. It locks the job first, then the site, allocates the next version server-side, writes current content, version history, site pointer, and the numeric `output_summary.version_number` marker in one transaction. A retry with a valid numeric marker returns the existing content/version IDs without creating a duplicate version.

## Analysis Marker Bug

The live contract verification found that the previous `complete_generation_analysis` behavior stored `website_analysis_v1` in `output_summary.version_number`. That field is reserved for the numeric content commit marker. The hardening migration changes the analysis fields to `analysis_version`, `analysis`, and `status`, preserves other output summary keys, transitions to `GENERATING_CONTENT`, and does not set `completed_at`.

## Publish/Public Read Gap

The verified generation contract persists content and version history but does not itself publish a public route or establish a public read policy. Renderer/public-read and publish/deploy contracts require a separate review. This adapter therefore stops at validated content persistence.

## Scope Note

This is a metadata snapshot dated 2026-09-12. It intentionally excludes user rows and all secrets. The deployment packet remains unexecuted and must be applied only by an authorized database operator after preflight review.