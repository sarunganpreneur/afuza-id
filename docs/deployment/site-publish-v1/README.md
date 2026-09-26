# Site Publish/Public Read V1

> DOCUMENTATION DRIFT (marked 2026-09-15)
>
> This README still describes an unexecuted packet. Production review, publish,
> unpublish, and `/p/[slug]` call `publish_site_version`, `unpublish_site`, and
> `get_published_site`. Do not re-apply or run rollback without a fresh
> preflight and explicit approval. See `docs/STALE_DOCUMENTS.md`.

This packet remains a manual operator artifact for publish, unpublish, and anonymous published-site reads. Apply-status in this README is historical, not current.

## Order

1. Run `01-preflight.sql` read-only.
2. Review exact `site_status` labels and function ACLs.
3. Run `02-apply.sql` only through approved Supabase SQL Editor change control.
4. Run `03-verify.sql` read-only.
5. Use `04-rollback.sql` only if the functions were absent before apply and verification fails.

The packet does not repair rows, change tables, or expose locked-table SELECT policies.

## Stop conditions

Stop if `site_status` labels differ, `public.is_admin()` is unavailable/unsafe, signatures already exist with different definitions, or any ACL/security-path check fails.

## Expected behavior

- Publish is owner/admin authenticated only, locks the site, validates version ownership and `site_content_v1`, and sets `LIVE`.
- Unpublish is owner/admin authenticated only, clears published fields, sets `DRAFT`, and preserves history.
- Public read is anonymous-safe and returns only the published version through a restricted RPC.
- Anonymous users cannot execute publish/unpublish.

Migration is not executed by this application change.