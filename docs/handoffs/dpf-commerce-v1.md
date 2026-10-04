# DPF Commerce V1 Handoff

## STATUS
INTEGRATION_READY

## BRANCH
feature/dpf-commerce-v1

## COMMIT/HEAD
IMPLEMENTATION_COMMIT: 21b00a6d29f45b12607f22a31b8639e483ab0400
SAME_NICHE_HOTFIX_COMMIT: this Commerce hotfix commit; resolve with `git rev-parse HEAD` after the hotfix commit.
FINAL_HANDOFF_HEAD: resolve with `git rev-parse HEAD`; the self-referential commit hash is intentionally not embedded.

## BASE CONTRACT
- base revision: 385306b
- source of truth: docs/digital-product-factory-v1.md

## IMPLEMENTED
- Published catalog reads and active product add-on reads in `src/lib/commerce/catalog.ts`.
- Authenticated checkout with database-computed price, order and order-item snapshots, idempotency replay, and payload conflict rejection.
- Provider-neutral payment adapter contract; only the simulated `test` adapter is implemented and it is disabled in production.
- Atomic payment recording and paid-only, per-order-item entitlement issuance.
- Owner-scoped order and purchased-product reads.
- Private Storage delivery with add-on-scoped asset authorization and short-lived signed URLs.
- The HPP product and two add-ons exist only as test fixtures, not migration catalog seed data.

## SCHEMA/MIGRATIONS
- SCHEMA_NAMESPACE_DECISION: DPF_PREFIXED
- NAMESPACE_POLICY: PREVENTIVE_SHARED_SCHEMA_ISOLATION
- CONCEPTUAL_TABLES:
	- products
	- product_addons
	- orders
	- order_items
	- payments
	- customer_entitlements
	- delivery_assets
- PHYSICAL_TABLES:
	- dpf_products
	- dpf_product_addons
	- dpf_orders
	- dpf_order_items
	- dpf_payments
	- dpf_customer_entitlements
	- dpf_delivery_assets
- NAMESPACE_REASON: Prevent ownership ambiguity and future table collisions in Afuza shared PostgreSQL schema. Conceptual Commerce names and business semantics are unchanged.
- Migration: `supabase/migrations/20261004_dpf_commerce_v1.sql`.
- Physical tables: `dpf_products`, `dpf_product_addons`, `dpf_orders`, `dpf_order_items`, `dpf_payments`, `dpf_customer_entitlements`, `dpf_delivery_assets`. Generic Afuza `orders`, `order_items`, and `payments` are not used or modified.
- RPCs: `dpf_create_checkout(uuid, uuid[], integer, text)` and `dpf_record_payment(uuid, text, text, integer, text, jsonb)`.
- Guard triggers: `dpf_guard_order_update()` makes order totals/snapshot immutable and PAID terminal; `dpf_guard_order_item_update()` protects order-item snapshots.
- Private Storage bucket: `dpf-delivery-v1`.
- DPF-owned indexes, policies, triggers, and functions use the `dpf_` prefix. Commerce statuses remain checked text columns; this migration introduces no PostgreSQL enum types.
- Bucket behavior is fail-closed: absent is created private, an existing private bucket is accepted, and an existing public bucket aborts/rolls back the migration.
- PRODUCTION_MIGRATION_APPLIED: NO. The migration was applied only to a disposable local PostgreSQL cluster for verification; no Supabase/staging/production database was changed.
- Test fixture: `src/lib/commerce/test-fixtures.ts`; disposable database setup/assertions: `supabase/tests/dpf_commerce_v1.sql`. Neither is automatically applied by the migration.

## TEST RESULTS
- Focused commerce tests: PASS, 16 tests across 2 files.
- Disposable PostgreSQL verification: PASS, via `bash scripts/test-dpf-commerce-postgres.sh`.
- Namespace collision contract: PASS; incompatible generic `public.orders`, `public.order_items`, and `public.payments` with RLS, policies, index, trigger, and sentinel rows remain unchanged while DPF tables are created.
- PostgREST relation selector: PASS; `dpf_order_items` uses `dpf_product_addons(addon_product_id)`, backed by the migration FK and asserted by SQL/service regressions.
- `npm run lint`: PASS.
- `npx tsc --noEmit --pretty false`: PASS.
- `npm run test -- --run`: PASS, 498 tests across 44 files.
- `npm run build`: PASS.
- `git diff --check`: PASS.

## BUSINESS/SECURITY GATES
SERVER_PRICE_SOURCE_OF_TRUTH: PASS
MINIMUM_NORMAL_PRODUCT_PRICE: PASS
UNPUBLISHED_PRODUCT_BLOCK: PASS
DISABLED_ADDON_BLOCK: PASS
CHECKOUT_IDEMPOTENCY: PASS
CHECKOUT_PAYLOAD_CONFLICT: PASS
PAYMENT_AMOUNT_VALIDATION: PASS
PAYMENT_REPLAY_SAFETY: PASS
PAID_STATE_MONOTONICITY: PASS
PAID_ONLY_ENTITLEMENT: PASS
ENTITLEMENT_IDEMPOTENCY: PASS
CORE_ADDON_ASSET_ISOLATION: PASS
CROSS_USER_ISOLATION: PASS
PRIVATE_STORAGE_PATH_PROTECTION: PASS
RPC_PRIVILEGE_BOUNDARY: PASS
TEST_PAYMENT_DISABLED_IN_PRODUCTION: PASS
FIXTURE_TOTALS_19000_38000_53000: PASS
SAME-NICHE ADDON: PASS

Same-niche enforcement: `supabase/migrations/20261004_dpf_commerce_v1.sql`, inside `dpf_create_checkout`, locks referenced add-on product rows and rejects `addon_product.niche IS DISTINCT FROM core_product.niche` before creating the order. `src/lib/commerce/checkout.ts` maps that SQL rejection to `ADDON_NICHE_MISMATCH`. Evidence: `supabase/tests/dpf_commerce_v1.sql` proves Cafe-to-Cafe checkout succeeds, an active Cafe-to-Laundry relation is rejected, and no order or entitlement is created for the invalid relation. The disposable PostgreSQL runner passed this regression.

## INTEGRATION POINTS
- Catalog: `listPublishedProducts`, `getProductBySlug`, and `getProductAddons` from `src/lib/commerce/catalog.ts`.
- Checkout: `createCheckout` from `src/lib/commerce/checkout.ts`; input is `{ productId, addonIds?, quantity?, idempotencyKey }`. User identity is read from the authenticated Supabase session. Client-supplied prices are not accepted.
- Checkout result: `{ orderId, orderNumber, status, subtotal, addonTotal, total }`. `orderId` is the UUID used by later order/payment operations.
- Order read: `getOrder(orderId, userId)` returns only the authenticated owner's order and item price/title/SKU snapshots.
- Test payment start: `startTestPayment(orderId)` from `src/lib/commerce/payments.ts`; no real provider or webhook route exists.
- Payment confirmation boundary: `confirmPayment({ provider, event })` verifies the event through the enabled provider adapter, then calls the privileged atomic `dpf_record_payment` RPC. Do not call the payment RPC from a client.
- Entitlements: `getMyProducts(userId)` and `getActiveEntitlements(userId, productId)` from `src/lib/commerce/entitlements.ts`.
- Delivery: `getProductDownloadAccess(userId, productId)` from `src/lib/commerce/delivery.ts`; successful result contains signed `assetUrls`, not storage keys. Asset scope is core (`addon_id IS NULL`) or the exact purchased `product_addons.id` represented by the order item.
- Schema/RPC names are those listed in SCHEMA/MIGRATIONS. Apply the migration only through an authorized environment-specific integration step before using the services against Supabase.
- Checkout add-on ID ordering is canonicalized as a set. Reusing an idempotency key with another product, add-on set, or quantity is a conflict.

## KNOWN LIMITATIONS
- No real payment provider is integrated.
- No production payment webhook or callback route exists.
- No Storefront UI is included in this lane.
- The migration has not been applied to Supabase, staging, or production.
- Private bucket configuration is defined by the migration; delivery asset rows and private objects still require authorized provisioning before a download can succeed.
- TEST payment signatures are simulation-only and are not a production payment verification mechanism.
- Catalog authoring/import and customer-facing account routes are outside this lane's implementation.

## NEXT ACTION
1. Integration Agent reads this handoff and compares Storefront DTO needs to the service boundaries above.
2. Verify the integration branch/worktree plan and merge or cherry-pick the lane commit as approved; do not apply the migration as part of this handoff.
3. In an explicitly authorized non-production environment, apply the migration and provision private delivery assets.
4. Connect Storefront checkout to `createCheckout`; display returned server totals and retain the returned `orderId`.
5. Keep real payment-provider approval, webhook verification, and production migration/deployment as separate authorized work.
