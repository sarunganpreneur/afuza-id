# Digital Product Factory Integration and Acceptance V1

Status: integration checklist; no Commerce or Storefront integration is authorized by this document alone.
Integration branch: `feature/dpf-launch-v1`.
Contract inputs: [digital-product-factory-v1.md](digital-product-factory-v1.md) and [digital-product-factory-generation-v1.md](digital-product-factory-generation-v1.md).

## 1. Purpose and hard boundaries

This document is the official gate before Commerce and Storefront lane changes may be merged, wired together, or deployed to staging. It defines evidence required for review and acceptance; a checklist entry is not considered passed without recorded command output, test evidence, or reviewer sign-off appropriate to that entry.

This task and checklist do not authorize:
- cherry-picking or merging either lane before its final report and independent diff review
- implementation changes, migration application, staging or production deployment
- production access or production data changes
- creating a product generator or generating the Launch Batch 01 catalog
- changes to sibling projects or resetting unrelated dirty state

The only integration boundary is the existing `afuza.id` application and its approved contracts. Do not introduce direct cross-project database writes. Do not assume commit hashes until each lane's final report is available and verified.

## 2. Proposed merge and acceptance order

Complete the steps in order; stop when a gate fails.

1. Verify the Commerce lane final report, branch identity, clean status, validation results, and required business tests.
2. Verify the Storefront lane final report, branch identity, clean status, validation results, and required UX/catalog tests.
3. Review the Commerce and Storefront commit diffs independently against the two source-of-truth contracts. Record exact reviewed commit IDs only after reports are available.
4. Integrate Commerce first; do not combine the two lane diffs into one unreviewed change.
5. Run the repository baseline after Commerce integration: lint, typecheck, tests, and build.
6. Integrate Storefront after the Commerce baseline passes.
7. Resolve and review Storefront adapter/service wiring against the canonical Commerce services; preserve server-side pricing and authorization ownership.
8. Run full integration tests, including the golden path and negative cases in this document.
9. Load only the controlled fixture catalog needed for acceptance. Do not start with 50–1000 live SKUs.
10. Review and approve an additive staging migration plan, then deploy to staging only when all staging gates pass.
11. Run and record the staging smoke test. No production migration or deployment is part of this checklist.
12. Consider a production release only after staging evidence is reviewed and a separate production release authorization is granted.

If a commit is not reported, do not guess it from branch tips, worktree state, or previous notes.

## 3. Lane final reports and merge gates

### 3.1 Commerce lane

Commerce final report must include the exact branch and commit reviewed, commands and outcomes, test evidence, and status. Required gates:
- branch is the agreed Commerce lane branch (`feature/dpf-commerce-v1`) or an explicitly approved successor
- `git status --short --branch` is clean
- lint PASS
- typecheck PASS
- tests PASS
- build PASS
- canonical server-side totals: core = IDR 19000; core + add-on 1 = IDR 38000; core + add-on 1 + add-on 2 = IDR 53000
- client price tampering is ignored or rejected; server price remains authoritative
- unpublished product and disabled add-on cannot be purchased
- invalid add-on relationship is rejected
- entitlement is absent before valid `PAID` and present after valid `PAID`
- payment replay does not duplicate payment effects, order, or entitlement
- user A cannot access user B's delivery asset
- minimum normal product price of IDR 10000 is enforced server-side
- secure delivery does not expose a raw private storage path

### 3.2 Storefront lane

Storefront final report must include the exact branch and commit reviewed, commands and outcomes, test evidence, and status. Required gates:
- branch is the agreed Storefront lane branch (`feature/dpf-storefront-v1`) or an explicitly approved successor
- `git status --short --branch` is clean
- lint PASS
- typecheck PASS
- tests PASS
- build PASS
- `/produk` renders; search and category filtering work; empty search and zero-result states are handled
- canonical product detail route `/produk/[slug]` handles an unknown slug as not found; any `/product/[slug]` test name must be reconciled to the actual route contract rather than creating a conflicting route by assumption
- product detail presents title, headline, preview, price, benefits, included assets, format, suitable-for, CTA, add-ons, related products, and FAQ where supplied by the product DTO
- display estimates for the fixture are IDR 19000, IDR 38000, and IDR 53000
- cart and checkout UI work; order states render; My Products authentication gate works
- catalog validation rejects duplicate SKU, duplicate slug, price below IDR 10000, and invalid add-on relationship
- catalog dry-run is supported and does not mutate catalog state

### 3.3 Independent diff review

Review each lane diff independently before integration. At minimum inspect changed files, route/API ownership, auth and authorization, pricing inputs, payment replay behavior, entitlement/delivery access, query/RLS posture, migration files, dependency changes, and tests. Record findings and resolution before merge. This review does not assume either lane has already passed because a worktree or branch exists.

## 4. Service boundary and adapter wiring

Commerce is the canonical source for checkout calculation, order creation/status, payment confirmation, entitlement issuance, and access authorization. Storefront consumes catalog and Commerce services through typed adapters. Storefront must never become the source of truth for price.

Rules:
- Storefront may calculate a display estimate for immediate UX feedback only; label/behavior must not imply that the estimate is final.
- The final payable amount always comes from Commerce after server-side product and add-on validation.
- Cross the boundary with product and add-on identifiers plus quantity/session/user context as allowed by the reviewed service contract. Do not trust or accept browser-supplied unit prices or totals as authority.
- Commerce re-resolves current product status and price, validates add-on eligibility and status, and recalculates the total server-side.
- Storefront fixture/mock adapters must be replaceable behind a typed adapter boundary. Switching to Commerce services must not duplicate pricing, payment, entitlement, or access business rules in the Storefront UI.
- Adapter wiring should preserve loading, empty, error, not-found, and unauthorized states without leaking private provider or storage details.
- Use actual exported names, DTOs, route paths, and error types after reviewing the final Commerce implementation. Do not freeze guessed implementation names in code based solely on this conceptual checklist.

Conceptual integration points, subject to final implementation naming:

| Integration point | Owning contract | Expected responsibility |
| --- | --- | --- |
| `listPublishedProducts` | Catalog/Product lane | Return only published, public catalog data for listing and filtering. |
| `getProductBySlug` | Catalog/Product lane | Resolve a public product by canonical slug; not-found is explicit. |
| `searchProducts` | Catalog/Product lane | Search published catalog metadata; empty and zero-result responses are valid. |
| `getProductAddons` | Commerce/catalog contract | Return eligible active same-core add-on offers and their display data; Commerce validates again at checkout. |
| `createCheckout` | Commerce | Accept identifiers and quantity/context; resolve prices and return canonical order/amount/status. |
| `getOrder` | Commerce | Enforce order ownership and return an authorized order view. |
| `getMyProducts` | Commerce/entitlement | Return products available to the authenticated user based on valid entitlements. |
| `getProductDownloadAccess` | Commerce/delivery authorization | Enforce user identity and entitlement before issuing short-lived access; never expose raw private paths. |

The names above come from the frozen contract and remain conceptual until verified against the lane implementation. Event analytics is optional/no-op safe as specified below.

## 5. Migration and data review gate

Before staging, inspect every proposed migration diff and its rollback/forward-fix plan. Confirm all of the following before approval:
- changes are additive for the DPF domain; no unrelated schema changes or destructive operations
- existing `auth.users` is reused; no parallel customer identity store is created
- product SKU has a global unique constraint; slug has a unique constraint
- order, order-item, payment, provider-reference, and idempotency constraints prevent inconsistent or duplicate effects as appropriate to the design
- order items preserve SKU/title/price snapshots
- payment-to-order linkage and paid-state transition are constrained and auditable
- entitlement links to user, product, order, and order item as applicable, with uniqueness/idempotency protection against duplicate grants
- indexes support the actual public catalog, status, user/order, payment, and entitlement access patterns without speculative unrelated indexing
- RLS/security posture is reviewed; server-only service-role access is narrowly scoped, and user-facing reads cannot cross user boundaries
- delivery assets remain private and are accessed through entitlement-checked server-side authorization or short-lived signed access
- rollback or forward-fix plan is safe for existing Afuza data; never destroy existing data to revert DPF

No production migration is included or permitted as part of integration acceptance. Staging migration application requires separate approval after diff review.

## 6. Controlled fixture and canonical E2E

Initial integration must use a small controlled fixture, not immediately load 50–1000 live SKUs. Canonical fixture:
- authenticated test user
- SKU `AFZ-SPR-HPP-001`
- title `Kalkulator HPP & Harga Jual UMKM`
- standalone price IDR 19000
- add-on `Pembukuan Usaha`, offer IDR 19000
- add-on `Inventory Tracker`, offer IDR 15000

The SKU/title are fixture identifiers inherited from the frozen contract; the generation spec's future SKU format does not silently rewrite this acceptance fixture. Any canonical fixture rename requires an explicit contract update.

Record each scenario with expected and observed order amount, state, and entitlement/access result:

| Scenario | Steps | Acceptance |
| --- | --- | --- |
| A | Open catalog, search fixture product, open detail, add core, checkout. | Commerce canonical total is IDR 19000. |
| B | Add core plus Pembukuan. | Commerce canonical total is IDR 38000. |
| C | Add core, Pembukuan, and Inventory. | Commerce canonical total is IDR 53000. |
| D | Check My Products before valid payment. | No purchased entitlement or delivery access is granted. |
| E | Confirm a safe TEST payment. | Order transitions to `PAID`; expected entitlements are created exactly once. |
| F | Reload/replay payment confirmation. | No duplicate payment effects, order, or entitlement. |
| G | Open My Products as the purchaser. | Purchased products are visible to the authorized user. |
| H | Request product access as purchaser, then as another user. | Purchaser succeeds; another user is denied without private-path disclosure. |

Use test-only payment confirmation. No real payment credentials or provider calls are required for this flow.

## 7. Required negative and security tests

All must fail closed with a stable user-safe response and no unauthorized side effect:
- unknown product
- unpublished product
- disabled add-on
- add-on belongs to a different core product or otherwise invalid relationship
- tampered client price or total
- anonymous access to protected order, My Products, or delivery content
- another user's order
- another user's entitlement
- invalid payment state transition
- payment confirmation replay
- missing delivery asset
- invalid, expired, or forged signed access
- unknown product slug / product not found
- empty search query and zero-result search, with correct non-error UX states

Negative tests must verify absence of order/payment/entitlement side effects where applicable, not only an error response.

## 8. Catalog rollout progression

Progress through these bounded stages; a later stage requires acceptance of the previous one:
- **Step A:** fixture products required for E2E only.
- **Step B:** 5–10 representative products across the relevant master/niche profiles.
- **Step C:** dry-run Launch Batch 01 and review all validator findings without mutation.
- **Step D:** 50 normal product SKUs only after schema, SKU, slug, minimum price, master reference, niche reference, niche-specificity, required metadata, add-on relation, related-product relation, and asset-truthfulness gates pass.
- **Step E:** the future 10 bundles only after explicit Commerce bundle checkout, order, price/refund, entitlement, and analytics support exists and is separately accepted.

Do not require production delivery assets before the Product Factory implementation and asset pipeline are actually ready. Before publish, however, enforce the parent contract's required delivery asset and verify that all listing claims match real assets. Generation spec plans 50 products plus 10 future-compatible bundles; bundle checkout is not a Commerce V1 launch requirement.

## 9. Analytics event contract

Expected events are `product_view`, `search`, `add_to_cart`, `checkout_started`, `addon_selected`, `purchase_completed`, and `download_started`. Analytics payloads must not contain payment-card data or unnecessary personal data.

Analytics integration may be a no-op adapter in V1. Missing analytics backend, transport failure, or analytics no-op must not fail catalog browsing, cart, checkout, payment, order, entitlement, or download access. Analytics must not become a transactional dependency.

## 10. Staging gates and smoke test

Before any staging deploy:
- staging is built from the exact reviewed integration commit in a clean worktree (`git status --short --branch` has no changes); preserve pre-existing unrelated dirty changes in other checkouts rather than cleaning or resetting them
- full lint, typecheck, tests, integration E2E, and build PASS on the exact reviewed integration commit
- migration plan and diff are reviewed and approved for staging only
- environment requirements are documented without committing secrets
- TEST payment flow works without real payment credentials
- no secrets are committed; staging credentials remain in the approved secret store
- rollback/forward-fix and monitoring owner are recorded; DPF route failures do not break unrelated `afuza.id` routes

Staging smoke test, performed only after approval:
- `/produk` renders the controlled published fixture
- canonical `/produk/[slug]` detail renders expected catalog data
- search behaves correctly for matches, empty query, and zero results
- cart displays the core/add-on selections and estimates without claiming authority
- checkout returns Commerce's canonical total and creates the expected order
- TEST payment confirms the order
- order status renders correctly after payment
- My Products auth gate and purchaser product list work
- secure product access succeeds for the purchaser and fails for another user

Record exact staging evidence when performed: environment and build/deploy identifier, commit IDs, migration ID if any, UTC timestamp, test user/fixture identifiers that are safe to disclose, commands or URLs exercised, expected versus observed result, and pass/fail. Do not fabricate staging evidence in advance. Staging validation must pass before production is considered.

## 11. Release blockers and non-blocking scope

### P0 — blocks staging and any release consideration

- security or access-control failure
- price source-of-truth failure
- entitlement granted before valid payment
- cross-user order, entitlement, or delivery access
- migration failure or unsafe/destructive migration plan
- build failure

### P1 — blocks DPF staging acceptance

- checkout total mismatch
- invalid add-on accepted
- search or catalog listing broken
- My Products broken

### Non-blocking for V1 staging

Advanced analytics, AI search, reviews, affiliate/commission, subscription, bundles, real payment provider, and complex recommendations are non-blocking only if they remain disabled/not represented as available, and do not weaken any P0/P1 gate. Bundles remain out of Commerce V1 scope until explicitly supported.

## 12. Reversibility, data safety, and route isolation

- Keep lane integration reviewable and revertable by lane commit; record exact commit boundaries and avoid unrelated mixed commits.
- Additive migrations require an explicit safe rollback or forward-fix plan. Reversal must not destroy existing Afuza data or customer records.
- Do not reset, clean, overwrite, or commit unrelated dirty worktree changes as part of DPF integration.
- DPF route or service failure must be isolated and must not break unrelated `afuza.id` routes or authentication flows.
- Staging validation is mandatory before any separate production release decision.
- No production migration, deploy, or data mutation is permitted by this acceptance document.

## 13. After integration acceptance

Only after Commerce and Storefront integration passes, their required regression tests pass, and the integration commit is accepted may a separate Product Factory implementation branch be considered:

```text
feature/dpf-product-factory-v1
```

Its first objective is limited to:

```text
generate -> validate -> dry-run
```

for Launch Batch 01. This document does not start or authorize that implementation. The generation contract remains [digital-product-factory-generation-v1.md](digital-product-factory-generation-v1.md).

## 14. Acceptance record template

Complete this record during the future integration; leave it unfilled until evidence exists.

| Gate | Evidence / commit / environment | Result | Reviewer / date |
| --- | --- | --- | --- |
| Commerce final report and clean branch |  |  |  |
| Storefront final report and clean branch |  |  |  |
| Independent diff reviews |  |  |  |
| Commerce integration baseline |  |  |  |
| Storefront integration and adapter review |  |  |  |
| Full integration tests and golden path |  |  |  |
| Negative/security tests |  |  |  |
| Migration review / staging-only approval |  |  |  |
| Staging deploy and smoke evidence |  |  |  |
| Production release consideration (separate authorization) |  |  |  |

## 15. Change boundary

This document adds an acceptance contract only. It changes no implementation, lane branch, migration, environment, sibling project, production system, or staging system.