# Image Pipeline V1 Deployment State

> DOCUMENTATION DRIFT / UNVERIFIED OPS (marked 2026-09-15)
>
> Image Pipeline V1 is locked in production code. The commit-RPC applied flag
> below is from the original packet record. Site-assets bucket provisioning
> was **not** re-verified in Phase 0. Treat bucket existence as a P1
> operational check. Do not create or mutate Storage from application deploys.
> See `docs/STALE_DOCUMENTS.md`.

- Commit RPC migration applied: YES (packet record; not re-verified in Phase 0)
- Commit RPC verification: PASS (packet record)
- Applied RPC accepts: `GENERATING_CONTENT`, `GENERATING_IMAGES`
- Commit RPC rollback: available, NOT RUN
- Site-assets bucket provisioning: NOT RE-VERIFIED (packet still says NOT APPLIED)
- Storage bucket audit: pending read-only Supabase verification

The storage design uses a public bucket for stable asset URLs. No anon or
authenticated upload policy is defined. Uploads are server-side only through
the service-role worker, which bypasses Storage object RLS.