# DPF Integration V1 Handoff

## STATUS
WRITE_SIDE_INTEGRATION_COMPLETE

## BRANCH / BASE
- Branch: `feature/dpf-integration-v1`
- Implementation base: `146ffc7f9fff839bcbd76ff7aa3f32d67c6a204a`
- Source lanes: Commerce `3d045f52d42535cb4e999a8861b75ac48fd44a89`; Storefront `eb73f62c4f2c067c0b32054dcd8036639c8358cb`
- Source of truth: `docs/digital-product-factory-v1.md`

## TRANSACTION FLOW
- `POST /api/storefront/checkout` requires an authenticated user, resolves a published product by Commerce UUID/slug/SKU and active child add-ons server-side, then calls Commerce `createCheckout`. It accepts no price or quantity and returns the canonical order summary and item snapshots.
- `/cart` to `/checkout` submits the stored identifiers and a session-persisted idempotency key. The UI displays Commerce's returned canonical total and links to `/order/[id]`.
- `POST /api/storefront/test-payment` is a controlled simulation only. It requires an authenticated owner order, `DPF_ENABLE_TEST_PAYMENTS=true`, and a runtime other than `NODE_ENV=production`; the route calls the existing TEST payment start/confirmation services.
- `POST /api/storefront/delivery` requires authentication and delegates entitlement checks and signed-link creation to Commerce `getProductDownloadAccess`. Only signed URLs are returned; storage keys and service-role credentials are not.
- `/order/[id]` reads owner-scoped Commerce order state and total. `/akun/produk` reads authenticated active entitlements and exposes the delivery route through the access control.

## ACCEPTANCE EVIDENCE
- CHECKOUT: PASS. Route tests cover anonymous rejection, server identifier resolution, unknown/unpublished product, disabled/wrong-parent/cross-niche add-ons, price-field rejection, canonical service-total propagation, and idempotency key reuse. Disposable PostgreSQL tests exercise the actual checkout RPC.
- TEST PAYMENT: PASS. Route tests cover authentication, owner-only lookup, production disablement, and already-paid replay. Commerce service and disposable PostgreSQL tests cover signature verification and payment recording.
- ENTITLEMENT: PASS. Disposable PostgreSQL tests prove pending payment creates zero entitlements and PAID creates exactly one per order item; entitlement service tests prove authenticated-user scoping.
- PAYMENT REPLAY: PASS. Disposable PostgreSQL tests replay PAID and assert stable PAID state and unchanged entitlement count; the customer route returns a stable replay response for an already-paid order.
- ORDER OWNERSHIP: PASS. Commerce service tests cover purchaser read and mismatched user denial; PostgreSQL tests verify order and item RLS hides another user's rows.
- MY PRODUCTS: PASS. Entitlement service tests verify purchaser products and deny caller/user mismatch; PostgreSQL tests verify cross-user entitlement RLS.
- SECURE DELIVERY: PASS. Route tests cover signed URL-only success, unauthorized and missing-asset safe denial, and internal failure privacy. Commerce service tests cover entitlement scope and add-on asset isolation.
- Totals in disposable PostgreSQL contract: core `19000`; core + BOOK `38000`; core + BOOK + INV `53000`.
- Price tampering: route rejects any client `price` field with HTTP 400 before calling Commerce. Checkout service passes identifiers only; the database calculates and snapshots totals.
- Negative SQL cases include unknown/unpublished product, disabled add-on, wrong-parent add-on, cross-niche add-on, incorrect payment amount, missing payment order, invalid payment transition, idempotency conflict, and cross-user RLS.
- No real payment provider is implemented or enabled.

## ROUTE / FIXTURE CLASSIFICATION
- `/api/storefront/checkout`, `/api/storefront/test-payment`, `/api/storefront/delivery`: customer transaction routes; TEST route disabled under production `NODE_ENV`.
- `/api/storefront/selection-summary`: runtime display-only estimate from Commerce-published records; it does not create or mutate an order and does not gate checkout submission.
- `/api/storefront/preview`: DEV_ONLY / TEST_ONLY. Returns 404 unless explicit fixture fallback is enabled in `development` or `test`; the customer UI no longer calls it.
- `fixture-adapter.ts`, `fixture-catalog.ts`: TEST_ONLY for catalog validation/tests; runtime Commerce fallback dynamically imports fixture data only under the explicit dev/test gate.
- Fake preview order: REMOVE_FROM_RUNTIME. The active adapter and fixture adapter no longer synthesize a preview order.
- No empty fixture-backed My Products or mock order is used by the active customer flow.

## STAGING DATABASE PREFLIGHT
No migration was applied by this change. Before a future staging migration, independently verify the exact non-production database target, migration state, and available backup/recovery posture. The DPF migration uses `ON CONFLICT (id) DO NOTHING` for the storage bucket, so it does not repair an existing public bucket. Before applying it, run this read-only query against the confirmed staging database:

```sql
select id, public
from storage.buckets
where id = 'dpf-delivery-v1';
```

Require exactly one row with `public = false`. If the row is missing or public is true, stop and use a separately reviewed staging-only remediation; do not assume the migration changed existing bucket privacy. Verify RLS, tables, RPC privileges, and bucket privacy again after the migration.

## VERIFICATION
- Focused customer routes/services: PASS, 35 tests at focused run.
- Disposable local PostgreSQL contract: PASS (`bash scripts/test-dpf-commerce-postgres.sh`); scratch cluster is stopped and removed by the runner.
- Fresh `npm run lint`: PASS.
- Fresh `npx tsc --noEmit --pretty false`: PASS.
- Fresh `npm run test -- --run`: PASS, 52 files / 537 tests.
- `npm run build`: PASS after temporarily activating an additional 6 GiB `/tmp` swap file; the file was deactivated and removed. No `/etc/fstab` or persistent swap configuration was changed.
- `git diff --check`: run before commit.

## ENVIRONMENT LIMITS / NEXT GATES
- No staging or production database was contacted or migrated.
- No staging or production application was deployed.
- For safety, a standard production-mode Next.js staging runtime (`NODE_ENV=production`) cannot use the TEST payment adapter. TEST payment is available only in explicitly enabled non-production runtimes.
- Future staging work must verify the target database, migration state/backup posture, private bucket flag, and deploy checkout commit before operations. This handoff does not authorize those actions.
- No real payment provider, Product Factory 50 SKU import, production migration, or production deployment is included.

## PRE-STAGING READINESS
READY for a separately approved staging review, conditional on the staging database/bucket preflight and a deployment target review. This classification is not a staging deployment, migration approval, or production authorization.
