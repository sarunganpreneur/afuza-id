# DPF Integration Preparation V1

Status: READY FOR COMMERCE IMPORT INTEGRATION

## 1. Frozen Product Factory input

- Branch: `feature/dpf-product-factory-v1`
- SHA: `6e6c727e6631c23cbd276880bab63f3faa147d23`
- Rule: integration must use the reviewed SHA unless an explicit update is recorded.
- No DB writes in this preparation phase.

## 2. Mapping of readiness by integration boundary

| Area | Status | Notes |
| --- | --- | --- |
| Storefront adapter | WAITING_ON_PERSON_2 | Consumer contract only; runtime implementation remains Commerce-owned. |
| Commerce adapter | WAITING_ON_PERSON_2 | Owns final pricing, order/payment state, and entitlement enforcement. |
| Product Factory dry-run importer | READY | Product Factory manifest and validation are complete. |
| Catalog manifest | READY | Launch Batch 01 manifest is generated and frozen at the Product Factory SHA. |
| Checkout routes | WAITING_ON_PERSON_2 | Final server-side totals and order creation remain Commerce-owned. |
| TEST payment route | WAITING_ON_PERSON_2 | Must be gated by `AFUZA_RUNTIME_ENV=staging` and `DPF_TEST_PAYMENT_ENABLED=true`. |
| Order page | WAITING_ON_PERSON_2 | Requires Commerce-owned order state and ownership checks. |
| My Products | WAITING_ON_PERSON_2 | Requires entitlement and user scoping from Commerce. |
| Delivery route | WAITING_ON_PERSON_2 | Requires secure signed access and private bucket enforcement. |

## 3. Product Factory contract validation

### Canonical mapping model

The manifest is treated as the authoritative Product Factory source of truth for the import contract. The implementation contract required by Commerce is:

- `dpf_products`: product identity, canonical SKU/slug/title/description/price/publish state/category/version metadata
- `dpf_product_addons`: same-niche compatibility pricing and eligibility metadata only
- `dpf_orders`: customer order state, snapshots, and canonical pricing
- `dpf_order_items`: order-line records with snapshot values and lineage
- `dpf_payments`: payment-state record with replay protection and provider reference
- `dpf_customer_entitlements`: exactly-one entitlement claim per paid entitlement scope
- `dpf_delivery_assets`: authorized delivery metadata only; never raw private paths

### Required theoretical fields for each of 50 SKUs

Each imported SKU must be capable of representing:

- stable SKU
- slug
- name
- description
- price
- publish state
- category
- metadata
- version

The Product Factory manifest already satisfies these values in the same canonical structure used by the generator, and the import contract must not invent different names without explicit Commerce approval.

### Compatibility metadata rule

Same-niche compatibility only. The deterministic factory contract is limited to same-niche BOOK/INV relationships. Cross-niche or wrong-parent add-ons are invalid and must be rejected.

If a schema dependency remains ambiguous, record it as `PERSON_2_CONTRACT_REQUIRED` rather than assuming a noncanonical table or column name.

## 4. DPF readiness results

- Product Factory contract: PASS
- 50 SKU import contract: PASS
- 19000 acceptance: DEFINED
- 38000 acceptance: DEFINED
- 53000 acceptance: DEFINED
- Negative tests: DEFINED
- Payment E2E: DEFINED
- Entitlement: DEFINED
- Secure delivery: DEFINED
- Staging migration gates: DEFINED
- Deploy gates: DEFINED
- Production hard gate: PASS
- Ready to consume Person 2 handoff: YES

## 5. Person 2 dependencies

These remain owned by Person 2, and no merge or migration is authorized before they are delivered and reviewed:

1. staging migration readiness is READY
2. final Commerce/schema contract is reviewed and isolated from unrelated work
3. required DPF tables exist in the target staging schema
4. RLS and bucket policy posture is verified ahead of migration
5. delivery bucket is private and no public delivery policy is present
6. migration precheck and postcheck are executed as read-only gating steps
7. exact reviewed integration SHA is used for staging deploy and import run

## 6. Deterministic execution sequence

The later run must follow this exact order and stop on the first safety-critical failure:

A. merge/import Person 2 clean Commerce HEAD
B. merge/import Product Factory frozen HEAD
C. resolve only legitimate integration conflicts
D. lint
E. typecheck
F. full tests
G. PostgreSQL disposable contract
H. production build
I. commit integration
J. push integration
K. read-only staging preflight
L. staging migration
M. migration postcheck
N. deploy exact HEAD
O. enable staging-only TEST payment flag
P. import Launch Batch 01
Q. verify 50 catalog entries
R. run 19k case
S. run 38k case
T. run 53k case
U. TEST payment
V. entitlement
W. payment replay
X. My Products
Y. secure delivery
Z. cross-user denial
AA. final evidence

## 7. Forbidden actions in this phase

- no merge of unfinished Person 2 work
- no migration of staging
- no deployment
- no production payment enablement
- no Product Factory import into live commerce tables
- no inference of production authorization

## 8. Canonical hard gates

- Production remains forbidden for migration, deploy, payment enablement, and catalog import until separately approved after staged E2E.
- `AFUZA_RUNTIME_ENV` must be exactly `staging` before TEST payment is allowed.
- `DPF_TEST_PAYMENT_ENABLED` must be exactly `true`.
- Any unexpected schema or bucket exposure must halt the run.

## 9. Implementation note

This repository contains the Product Factory authoring and manifest work, but the downstream workflow (Commerce schema, checkout, payment, entitlement, secure delivery, and deployment) remains outside the current Product Factory lane and is intentionally not implemented here.
