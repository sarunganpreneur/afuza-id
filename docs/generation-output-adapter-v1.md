# Generation Output Adapter V1

> DOCUMENTATION DRIFT (marked 2026-09-15)
>
> The Migration Handling section below records that the original commit did
> not execute SQL. That is not current production apply-status. Live
> Generation V1 depends on the hardened analysis/commit contract.
> See `docs/STALE_DOCUMENTS.md`.

The adapter is the server-side boundary between Worker/Hermes and the database. It accepts a strict worker envelope, validates `SiteContentV1`, derives the storage snapshots, and calls the reviewed database RPC. The renderer and Worker never receive database credentials.

## Endpoint

```text
POST /api/internal/generation/content/commit
```

Authentication uses the existing `Authorization: Bearer <worker-shared-secret>` header. The token value is configured outside this document and must never be placed in source, fixtures, logs, or payloads.

## Request Envelope

The envelope is strict and contains only:

```json
{
  "jobId": "03137715-b9f0-41eb-8072-9e0135de32a8",
  "content": {
    "schemaVersion": "site_content_v1",
    "site": {
      "name": "Dapur Rasa",
      "slug": "dapur-rasa"
    },
    "seo": {
      "title": "Dapur Rasa",
      "description": "Masakan rumahan untuk keluarga."
    },
    "theme": {
      "style": "organic",
      "primaryColor": "#123456",
      "accentColor": "#F59E0B",
      "fontStyle": "sans",
      "borderRadius": "md",
      "density": "comfortable"
    },
    "header": { "navigation": [] },
    "sections": [
      {
        "id": "hero",
        "type": "hero",
        "title": "Masakan rumahan untuk hari istimewa"
      }
    ],
    "footer": { "links": [] }
  }
}
```

`siteId` and `ownerId` are intentionally absent. The server passes only `jobId` to the RPC; the database derives `site_id` from the locked generation job and enforces the job/site relationship.

The server derives these RPC arguments:

```json
{
  "p_content": "the complete validated content object",
  "p_theme": "content.theme",
  "p_seo": "content.seo",
  "p_editor_state": {
    "schemaVersion": "site_content_v1",
    "source": "AI"
  }
}
```

The application performs no direct insert or update. Invalid content is rejected before the RPC is called.

## Responses

Successful commit and idempotent retry return the same shape:

```json
{
  "ok": true,
  "jobId": "03137715-b9f0-41eb-8072-9e0135de32a8",
  "versionNumber": 3,
  "siteContentId": "content-row-id",
  "siteVersionId": "version-row-id"
}
```

Error responses contain a stable `code`, with optional bounded `issues` paths. They never contain SQL, stack traces, database messages, tokens, credentials, or content payloads.

| Status | Code examples |
| --- | --- |
| 400 | `MALFORMED_JSON`, `INVALID_COMMIT_ENVELOPE`, `PAYLOAD_TOO_LARGE` |
| 401 | `UNAUTHORIZED` |
| 404 | `GENERATION_JOB_NOT_FOUND` |
| 409 | `GENERATION_COMMIT_CONFLICT` |
| 422 | `INVALID_SITE_CONTENT`, `INVALID_SITE_CONTENT_SEMANTICS` |
| 500 | `GENERATION_COMMIT_FAILED` |
| 503 | `WORKER_AUTH_UNAVAILABLE`, `GENERATION_COMMIT_UNAVAILABLE` |

## Retry and Idempotency

The database RPC locks the job first and uses `generation_jobs.output_summary.version_number` as the numeric commit marker. A retry for a committed job verifies the existing site version and content row, then returns the same version identifiers without creating another version. The marker is written only after content, version, and site pointer writes succeed.

The first commit is allowed only while the job is `GENERATING_CONTENT`. The RPC derives the site from the job and allocates the next version server-side. The application must retry only with the same `jobId` and equivalent content.

## Status Transition

The expected lifecycle is:

```text
QUEUED -> ANALYZING -> GENERATING_CONTENT -> GENERATING_IMAGES/RENDERING
         -> RENDERING -> VALIDATING -> DEPLOYING -> VERIFYING -> LIVE
```

Analysis completion stores `analysis_version`, `analysis`, and `status` in `output_summary`, then transitions to `GENERATING_CONTENT`. It does not write `output_summary.version_number` and does not set `completed_at`.

## Limits and Security

- Request `Content-Length`, when supplied, must not exceed 1 MiB.
- `SiteContentV1` enforces all string, array, section, URL, image, CTA, and theme bounds.
- Unknown envelope and contract fields are rejected.
- Only HTTPS external URLs and safe internal paths are accepted.
- HTML, script, iframe, event handlers, JavaScript, data URIs, file URIs, CSS, executable code, and credentials are rejected or excluded.
- Hermes must emit pure JSON. It must not send Markdown fences, HTML, CSS, or JavaScript.
- Local producer validation with `safeParseSiteContentV1` is recommended, but the server remains the source of truth.

## Hermes Pseudocode

```text
content = generate_json_only(brief)
assert content.schemaVersion == "site_content_v1"
assert safeParseSiteContentV1(content).success

response = POST "/api/internal/generation/content/commit"
  Authorization: Bearer WORKER_SHARED_SECRET
  body: { jobId: claimedJob.job_id, content }

if response.ok:
  record(response.versionNumber)
else if response.code == "GENERATION_COMMIT_CONFLICT":
  inspect job state and retry only according to worker policy
else:
  record safe error code without logging payload or credentials
```

No real credential belongs in pseudocode, fixtures, documentation, or test output.

## Migration Handling

`supabase/migrations/20260912_generation_content_v1_hardening.sql` is an additive, versioned migration artifact. It uses `CREATE OR REPLACE FUNCTION` and preserves the RPC signatures and privilege model. The sentence that it "has not been executed by this application change" refers to the original git commit, not current production apply-status. Do not re-apply through app deploy. Any SQL change still requires approved database change control.