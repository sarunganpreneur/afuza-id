# DPF Integration V1 Handoff

## STATUS
INTEGRATION_READY

## BRANCH
feature/dpf-integration-v1

## BASE CONTRACT
- base revision: 385306b
- source of truth: docs/digital-product-factory-v1.md
- source lanes: `dpf-commerce-v1` and `dpf-storefront-v1`

## INTEGRATION SUMMARY
- Storefront root export is now wired to the Commerce-backed adapter instead of the fixture adapter.
- Live catalog reads, product preview, product-detail resolution, addon visibility, order status, and owned-products reads all flow through the canonical Commerce services.
- Fixture catalog fallback remains intentionally gated to explicit test/dev mode only; production-like runtime is fail-closed and does not silently invent catalog or customer data.
- Order status and my-products pages now require an authenticated user and render data from the real Commerce boundary instead of preview-only placeholders.
- Client-controlled prices are still rejected; server totals remain authoritative when the transactional flow is used.

## IMPLEMENTED
- `src/lib/dpf/storefront/commerce-adapter.ts`
  - real Product catalog reads via Commerce services
  - real product-detail and related/addon resolution
  - guarded fallback logic using `DPF_ENABLE_FIXTURE_CATALOG` and `NEXT_PUBLIC_DPF_ENABLE_FIXTURE_CATALOG`
- `src/lib/dpf/storefront/index.ts`
  - points the storefront adapter export at the Commerce adapter
- `src/app/order/[id]/page.tsx`
  - authenticated, real order lookup with runtime-safe rendering
- `src/app/akun/produk/page.tsx`
  - real owned-product flow with outcome messaging aligned to actual entitlements
- `src/app/api/storefront/preview/route.test.ts`
  - explicit test-mode fixture stub for preview route validation
- `src/lib/dpf/storefront/commerce-adapter.test.ts`
  - verifies fail-closed behavior in production-like runtime and explicit fixture mode in local/test mode

## SECURITY / RUNTIME GATES
- NO production migration applied.
- NO production deploy performed.
- NO real payment provider enabled.
- Fixture fallback is only allowed when `NODE_ENV` is `test` or `development` and the fixture flag is explicitly enabled.
- Fail-closed behavior is enforced whenever the runtime is production-like or the fallback flag is absent.
- Storefront order-status and account views require authenticated session ownership before returning data.

## VERIFICATION
Command run:
`cd /home/afuzaid/engineering/worktrees/dpf-integration && npm run lint && npx tsc --noEmit --pretty false && npm run test -- --run && npm run build && git diff --check`

Result:
- lint: PASS
- typecheck: PASS
- tests: PASS, 47 files / 511 tests
- build: PASS
- diff check: PASS

## NEXT ACTIONS
1. Merge or continue on `feature/dpf-integration-v1` only in an authorized non-production worktree.
2. If a later environment-specific rollout is approved, apply the Commerce migration only in that environment and then provision any private delivery assets required.
3. Keep real payment-provider integration, production migration, and environment deployment as separate, explicit work streams outside this branch.
