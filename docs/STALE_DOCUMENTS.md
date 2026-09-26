# Stale / drifted operational documents

Status: index of known documentation drift
Verified at: 2026-09-15
Policy: if a document says A and production code/tests do B, report DOCUMENTATION DRIFT. Do not silently follow the stale document.

| Document | What it still says | Verified behavior / evidence | Classification |
| --- | --- | --- | --- |
| `docs/database-contract-live-20260912.md` | Snapshot dated 2026-09-12; "deployment packet remains unexecuted" | Useful as a historical RPC/table snapshot. Publish/public-read and generation hardening are used by production application code. Packet apply timestamps were not re-run in Phase 0 (no SQL). | HISTORICAL SNAPSHOT — do not treat "unexecuted" as current |
| `docs/generation-output-adapter-v1.md` | Hardening migration "has not been executed by this application change" | True of the git commit that added the file. Production worker/commit path depends on the hardened contract. | PARTIALLY STALE (migration execution sentence) |
| `docs/deployment/generation-content-v1/README.md` | "Migration belum dijalankan" | Packet files are still manual operator artifacts. Live generation V1 is running. Do not re-apply without a fresh preflight. | PACKET README STALE on apply-status |
| `docs/deployment/site-publish-v1/README.md` | "unexecuted database deployment artifact" | Production review/publish/public renderer call `publish_site_version`, `unpublish_site`, `get_published_site`. | PACKET README STALE on apply-status |
| `docs/deployment/image-pipeline-v1/README.md` | Commit RPC applied YES; site-assets bucket `NOT APPLIED`; storage audit pending | Image Pipeline V1 is locked in production code. Bucket provisioning is not re-verified here. | MIXED — RPC status claimed applied; bucket status unverified |
| `../schema/afuza_id_v1_1_multi_payment_schema.sql` | "Source of truth" for billing, affiliate, n8n, etc. | Future domain map. Not proof that those modules are implemented in the web app. | FUTURE BACKLOG |
| Historical `AGENTS.md` / `CLAUDE.md` / `README.md` | Generic Next.js starter | Replaced in this Phase 0 commit | SUPERSEDED |

Live executable contracts that remain current unless a later audit proves otherwise:

- `docs/site-content-v1.md`
- `src/lib/site-content/schema.ts`
- `src/lib/site-content/validation.ts`
- worker / review / publish / renderer code and tests
- `docs/releases/AFUZA_V1_BASELINE.md` (metadata refreshed in Phase 0)

Example JSON in `docs/site-content-v1.md` still uses local `/images/...` paths. That is illustrative. Generated production assets must be persistent public Supabase refs.
