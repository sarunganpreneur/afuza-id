# Digital Product Factory Generation V1

Status: specification only; no generator, catalog data, migration, or product assets are created by this document.
Parent contract: [digital-product-factory-v1.md](digital-product-factory-v1.md), based on contract revision `385306b`.
Scope: Product Factory and generation lane for the Business/UMKM Launch Batch 01.

## 1. Purpose and boundaries

The factory produces market-ready, niche-specific sellable products from verified master engines and structured niche profiles. It must do more than replace niche names: terminology, sample data, business fields, instructions, examples, documents, and marketing content must make sense for the target niche.

This is a specification, not implementation authorization. It does not create the 50 products or 10 bundles, generate files, implement a production generator, change Commerce or Storefront, create/apply a migration, deploy, or modify sibling projects.

Ownership remains as defined in the parent contract:
- Product Factory / Catalog owns generation inputs, catalog metadata, validation, and import-batch preparation.
- Commerce owns checkout pricing enforcement, order/payment handling, and entitlement issuance.
- Storefront owns public product presentation, cart UX, add-on selection UX, and display DTO mapping.
- The existing `afuza.id` app remains the integration boundary; no direct cross-project database writes are allowed.

Generated records are drafts. AI generation never implies approval or publication.

## 2. Launch Batch 01 formula

### 2.1 Master products

| Master ID | Product | Standalone price (IDR) | Traffic role | Required engine / deliverable |
| --- | --- | ---: | --- | --- |
| HPP | HPP & Pricing Calculator | 19000 | ACQUISITION | HPP calculation engine |
| BOOK | Bookkeeping / Pembukuan Usaha | 29000 | MONETIZATION | bookkeeping engine |
| INV | Inventory Tracker | 25000 | MONETIZATION | inventory engine |
| ADMIN | Business Admin Kit | 29000 | SEO_LONGTAIL | editable operational documents |
| MKT | Marketing Kit | 39000 | MONETIZATION | niche-specific marketing assets |

### 2.2 Niches

| Niche ID | Niche |
| --- | --- |
| LDY | Laundry |
| CAF | Cafe & Coffee Shop |
| WRG | Warung Makan |
| CAT | Catering |
| BAK | Bakery |
| BGM | Bengkel Motor |
| SLN | Salon & Barbershop |
| FLR | Florist |
| TKL | Toko Kelontong |
| FRZ | Frozen Food |

The batch matrix is every master crossed with every niche: 5 masters × 10 niches = 50 product SKUs. All normal standalone products have a minimum price of IDR 10000; the standalone prices in the master table are authoritative for this batch.

### 2.3 Bundles

There is one planned bundle per niche, named `{Niche} Business Starter Kit`, priced at IDR 99000, containing HPP, BOOK, INV, ADMIN, and MKT for that same niche. The component standalone total is IDR 141000. Ten planned bundles plus 50 planned products means 60 eventual sellable offers, if and when the compatible bundle extension is implemented and approved.

Bundle identity example: `AFZ-BUNDLE-CAF-001`.

Bundle conceptual fields:

```ts
type BundleOffer = {
  bundleSku: string;
  title: string;
  price: number;
  componentSkus: string[];
};
```

Bundles do not duplicate component delivery assets. A paid bundle should grant entitlements to its component products, with an auditable relationship to the bundle purchase. The current parent Commerce V1 contract does not define bundle checkout or bundle entitlement behavior. Treat bundle support as a next-compatible extension proposal only; do not require or implement it as part of current Commerce or Storefront work. The IDR 99000 bundle price is an explicit future bundle-price rule, not a change to standalone prices or the normal-product minimum.

## 3. SKU, identity, and version rules

Canonical generated SKU:

```text
AFZ-{MASTER}-{NICHE}-{VERSION}
```

Examples: `AFZ-HPP-CAF-001`, `AFZ-BOOK-CAF-001`, `AFZ-INV-LDY-001`, `AFZ-MKT-BGM-001`.

Bundle SKU uses `AFZ-BUNDLE-{NICHE}-{VERSION}`, for example `AFZ-BUNDLE-CAF-001`.

Rules:
- SKU is globally unique across all products and bundle offers.
- Master and niche codes must resolve to registered entries in this specification or a later approved registry revision.
- Version is a three-digit, zero-padded positive integer, initially `001` for each master+niche product identity and each niche bundle identity.
- A SKU is immutable after it is issued. A materially revised deliverable that must retain historical clarity receives the next version and a new SKU; it does not silently overwrite a previously published asset or order snapshot.
- Version increments are allocated per logical identity (master+niche, or bundle+niche), not globally. Retired versions remain reserved and must never be recycled.
- A new version may be linked to a prior version through explicit catalog metadata in a future implementation. Redirecting old slugs, migrating entitlements, and customer upgrade policy are unresolved implementation decisions and must not be inferred by the generator.
- Product identity is the logical master+niche combination plus its explicit version. SKU is the immutable sellable-version key; slug is a unique, human-readable route key.

## 4. Generated product record contract

The factory output is a validated draft record. Names below describe the generation contract, not a demand to change the frozen Commerce `Product` DTO or schema. A future catalog adapter must deliberately map these fields to the parent contract's DTO and stored metadata; in particular, the parent DTO currently says `format` while this generation specification uses `formats`.

```ts
type GeneratedProductDraft = {
  sku: string;
  slug: string;
  title: string;
  shortTitle: string;
  headline: string;

  category: string;
  subcategory: string;
  niche: string;
  buyer: string;
  problem: string;
  useCase: string;

  productType: string;
  formats: string[];

  price: number;
  trafficRole: "ACQUISITION" | "MONETIZATION" | "ADD_ON" | "BUNDLE_COMPONENT" | "SEO_LONGTAIL";
  status: "DRAFT" | "READY" | "PUBLISHED" | "TESTING" | "WINNER" | "SCALING" | "ARCHIVED";

  description: string;
  benefits: string[];
  whatsIncluded: string[];
  suitableFor: string[];

  keywords: string[];
  seoTitle: string;
  seoDescription: string;

  masterId: "HPP" | "BOOK" | "INV" | "ADMIN" | "MKT";
  nicheId: "LDY" | "CAF" | "WRG" | "CAT" | "BAK" | "BGM" | "SLN" | "FLR" | "TKL" | "FRZ";
  version: string;

  addonRules: Array<{ masterId: string; offerPrice: number }>;
  relatedProducts: string[];
  bundleId: string | null;

  coverBrief: string;
  previewBrief: string[];
  assets: {
    delivery: string[];
    cover: string[];
    previews: string[];
    instructions: string[];
  };
};
```

`addonRules`, `relatedProducts`, and `bundleId` are generation/catalog relationship metadata. The active parent contract's `ProductAddon` is the checkout offer relation and stores its own price; do not overwrite the standalone `Product.price` with an add-on offer price. The future bundle fields above are descriptive only until the parent contract adds bundle semantics.

## 5. Verified master engines and deliverable requirements

Niche profiles configure terminology, categories, sample data, business-specific fields, and instructions. They do not invent a separate, unverified calculation engine for each SKU. A verified master-engine correction must be distributable to its niche variants, with each generated variant rerun through validation and quality gates.

### 5.1 HPP Engine

The reusable HPP engine must logically support:
- direct costs and overhead
- labor allocation
- packaging where relevant
- channel or marketplace fees where relevant
- target margin
- cost of goods / HPP
- minimum selling price and recommended selling price
- nominal profit and margin percentage
- scenario simulation

Industry-specific pricing models may extend the input configuration (for example catering cost per portion, bakery recipe yield, or motorbike service duration). They must use reviewed, reusable formulas and clearly documented assumptions. The AI must never independently invent spreadsheet formulas for every SKU.

### 5.2 Bookkeeping Engine

Required areas: dashboard, income, expenses, receivables, payables, transaction categories, cashflow, simple profit/loss, and monthly summary.

### 5.3 Inventory Engine

Required areas: item master, initial stock, stock-in, stock-out, current stock, minimum stock, supplier, purchase cost, stock value, and low-stock warning.

### 5.4 Admin Kit

Each niche variant contains 5–10 relevant operational documents, a README/usage guide, editable source files, and printable/export-friendly output. The detailed Launch Batch 01 profiles specify ten document types per niche as the initial target set.

### 5.5 Marketing Kit

Each niche Marketing Kit targets 30 niche-specific content assets:
- 10 promotion
- 5 education
- 5 engagement
- 5 social proof
- 5 CTA/offer

It also includes 30 matching captions, 30 headlines, CTA suggestions, and a usage guide. Content must be grounded in the niche profile and must not assert product features, discounts, testimonials, or business facts that are not supplied or verified. A claimed testimonial must be represented as a placeholder until real customer consent and evidence exist.

## 6. Checkout add-on and related-product rules

An `ADD_ON` is offered during checkout and uses the offer price on the ProductAddon relation. A related product is shown on a product page or after purchase; it is not automatically a checkout add-on. Do not overload checkout with every related SKU.

The following matrix defines eligible same-niche add-on master pairs and their relation offer price (IDR):

| Parent master | Add-on master | Offer price |
| --- | --- | ---: |
| HPP | BOOK | 19000 |
| HPP | INV | 15000 |
| HPP | MKT | 29000 |
| BOOK | INV | 15000 |
| BOOK | ADMIN | 19000 |
| BOOK | MKT | 29000 |
| INV | BOOK | 19000 |
| INV | ADMIN | 19000 |
| ADMIN | BOOK | 19000 |
| ADMIN | MKT | 29000 |
| MKT | ADMIN | 19000 |
| MKT | BOOK | 19000 |

Rules:
- Every add-on relation must remain within the same niche unless a separately approved future rule explicitly allows otherwise.
- An add-on relation references a distinct product SKU in the same niche and has its own relation-level offer price. It must not mutate the target product's standalone price.
- Self-add-ons are invalid. The validator checks that the parent and target master/niche pair is permitted by the matrix and that the target SKU exists in the same batch/catalog.
- All add-on prices in this matrix are at least IDR 10000. If a future offer falls below that threshold, it requires an explicit approved exception.
- The matrix is eligibility and offer-pricing policy, not a requirement that every eligible relation be displayed simultaneously.

Example for HPP Cafe:
- Checkout add-ons: BOOK Cafe and INV Cafe.
- Related products: ADMIN Cafe, MKT Cafe, and Cafe Business Starter Kit (only after bundle/catalog support exists).

## 7. Launch Batch 01 niche profiles

Each profile supplies domain vocabulary and configuration to the shared master engines. These lists are minimum coverage anchors, not permission to publish generic or fabricated sample content.

### CAF — Cafe & Coffee Shop

- HPP vocabulary: coffee beans, milk, cream, syrup, powder, sugar, cup, lid, straw, ice, water, electricity, barista labor allocation, marketplace fee, packaging.
- Inventory examples: beans, milk, syrup, powders, tea, sugar, cup, lid, straw, packaging, cleaning supplies.
- Admin documents: Daily Sales Report; Opening Checklist; Closing Checklist; Cleaning Checklist; Supplier List; Purchase Order; Stock Opname; Employee Attendance; Petty Cash; Equipment Maintenance.
- Marketing themes: menu promo; new menu; morning coffee; afternoon coffee; food + drink bundle; testimonials; behind the scenes; barista; seasonal menu; delivery.

### LDY — Laundry

- Cost vocabulary: detergent, softener, perfume, stain remover, plastic, label, water, electricity, labor, machine depreciation, ironing, delivery.
- Inventory examples: detergent, softener, perfume, plastic, label, stain remover, hanger, cleaning supplies.
- Admin documents: Laundry Order Form; Customer Receipt; Pickup/Delivery Log; Daily Sales; Complaint Form; Employee Attendance; Machine Maintenance; Stock Form; Supplier List; Cleaning Checklist.
- Marketing configuration should distinguish service type, turnaround, pickup/delivery, and fabric-care claims; do not invent guarantees.

### WRG — Warung Makan

- Cost vocabulary: rice, protein, vegetables, spices, oil, gas, condiments, packaging, labor, electricity, wastage, marketplace commission.
- Inventory configuration must support ingredient units, purchase quantities, stock movement, and wastage.
- Admin documents: Daily Sales; Ingredient Purchase; Supplier List; Stock Opname; Kitchen Opening Checklist; Closing Checklist; Cleaning Checklist; Employee Attendance; Cash Report; Waste Record.
- Marketing configuration should support menu, meal period, portion, and delivery themes without fabricating menu prices or claims.

### CAT — Catering

- HPP configuration must support cost-per-portion and order quantity, with assumptions visible in results.
- Cost vocabulary: ingredients, portions, packaging, cutlery, labor, transport, gas, kitchen overhead, equipment rental, buffer/wastage.
- Admin documents: Customer Brief; Menu Confirmation; Quotation; Purchase List; Production Checklist; Delivery Checklist; Event Schedule; Payment Record; Supplier List; Feedback Form.
- Sample data and copy must distinguish event size, serving count, delivery scope, and confirmed menu from estimates.

### BAK — Bakery

- HPP configuration must support recipe yield.
- Cost vocabulary: flour, sugar, butter/margarine, egg, milk, yeast, filling, topping, decoration, packaging, gas/electricity, labor, wastage.
- Admin documents: Production Sheet; Order Form; Recipe Card; Daily Production; Waste Log; Stock Form; Custom Cake Brief; Delivery Checklist; Supplier List; Cleaning Checklist.
- Inventory and examples should distinguish recipe ingredients, finished goods, yield, and perishability.

### BGM — Bengkel Motor

- Pricing engine is service-pricing oriented, supporting service duration and mechanic labor separately from sparepart costs.
- Cost vocabulary: mechanic labor, service duration, sparepart, lubricant, consumables, workshop overhead, equipment depreciation, target margin.
- Inventory examples: oil, spark plug, brake pad, cable, chain, battery, tire, bulb, filter, common spareparts.
- Admin documents: Service Order; Vehicle Inspection; Customer Data; Service History; Mechanic Work Order; Sparepart Request; Invoice; Stock Opname; Supplier List; Workshop Checklist.
- Safety, warranty, and repair-result claims must be provided and approved by the business; the generator must not invent them.

### SLN — Salon & Barbershop

- Pricing configuration: service duration, stylist/barber labor, shampoo, treatment, disposables, electricity, water, equipment, product usage, target margin.
- Inventory examples should track consumable products and service product usage where applicable.
- Admin documents: Customer Record; Appointment Form; Service Record; Employee Attendance; Daily Sales; Commission Record; Stock Form; Cleaning Checklist; Equipment Maintenance; Supplier List.
- Marketing examples may describe services and booking prompts but may not invent results, qualifications, or customer testimonials.

### FLR — Florist

- HPP vocabulary: flower stems, foliage, wrapping, ribbon, foam, basket/box, card, accessories, labor, delivery, spoilage.
- Inventory examples: fresh flowers, artificial flowers, wrapping, ribbon, boxes, baskets, accessories, freshness/expiry.
- Admin documents: Customer Order; Custom Arrangement Brief; Delivery Schedule; Purchase Sheet; Supplier List; Daily Sales; Stock; Waste/Spoilage; Payment Record; Production Checklist.
- Freshness, seasonality, and delivery timing are variable inputs and must not be represented as guaranteed without business confirmation.

### TKL — Toko Kelontong

- Pricing configuration: supplier price, purchase quantity, freight, discount, shrinkage, expiry allowance, target markup, selling price, profit/unit.
- Inventory fields: SKU, optional barcode, supplier, purchase price, selling price, stock, minimum stock, expiry, stock value.
- Admin documents: Purchase Order; Supplier List; Stock Opname; Daily Cash; Expense; Return Form; Expiry Check; Employee Attendance; Closing Checklist; Sales Recap.
- Examples must distinguish unit cost, pack size, purchase quantity, and selling unit to avoid invalid margin calculations.

### FRZ — Frozen Food

- HPP vocabulary: product/raw material, packaging, label, freezer electricity, cold storage, labor, delivery, marketplace fee, spoilage, target margin.
- Inventory fields: product, batch, expiry, frozen stock, supplier, purchase cost, selling price, minimum stock.
- Admin documents: Stock Log; Freezer Temperature Log; Supplier List; Purchase Order; Delivery Record; Expiry Check; Daily Sales; Cleaning Checklist; Cash Report; Return/Damaged Product.
- Temperature, food-safety, shelf-life, and handling claims require verified business/product inputs; never fabricate them.

## 8. Generation and batch state machine

Conceptual flow:

```text
MASTER
  -> NICHE
  -> GENERATE
  -> DRAFT SKU
  -> SCHEMA VALIDATOR
  -> NICHE-SPECIFICITY QUALITY GATE
  -> ASSET QUALITY GATE
  -> COMMERCIAL VALIDATION
  -> READY
  -> APPROVAL
  -> PUBLISHED
```

Batch/job states are distinct from the frozen catalog `ProductStatus`:

```text
PLANNED
GENERATING
GENERATED
VALIDATING
READY
IMPORTED
PUBLISHED
VALIDATION_FAILED
```

The batch coordinator must preserve an explicit validation failure reason for every rejected row/item. Failures must not be silently skipped. `READY` means all required automated checks passed; it does not mean approved or published. Publishing requires a separate authorized approval and the existing catalog/Commerce security boundaries. Generation, validation, and import must not bypass approval.

## 9. Validation contract

### 9.1 Hard failures

Reject a draft/batch item for any of these conditions:
- duplicate global SKU or duplicate slug, within the batch or existing catalog
- standalone normal product price below IDR 10000, or invalid/non-integer/negative monetary value
- unknown master or niche, or SKU master/niche/version inconsistent with the record
- invalid enum/status or malformed required field
- missing required metadata, empty required asset manifest, or missing delivery asset before publish
- invalid, cross-niche, disallowed, self-referential, or unresolved add-on relation
- missing or unresolved related-product SKU
- asset claims that do not match the actual delivery files
- listing claims of features not present in the delivered artifact
- publish request without approval or required delivery asset
- invalid bundle component set, duplicate component, cross-niche component, or missing component, if bundle validation is later enabled

Bundle validations above are requirements for a future bundle-capable catalog importer; they do not add bundle support to Commerce V1.

### 9.2 Quality warnings

Warnings do not silently become passes and must be surfaced in dry-run output:
- possible duplicate-like content across generated variants
- low niche specificity
- weak or repetitive headline/caption coverage
- incomplete or unsupported marketing theme coverage

The validator must distinguish warnings from hard failures, retain diagnostics, and avoid treating a warning as evidence of product readiness when the niche-specificity gate has not passed.

### 9.3 Niche-specificity gate

Required:
- vocabulary, fields, examples, and instructions match the registered niche profile and master engine
- niche-specific content materially changes user workflow or inputs, not only the product name
- generated examples use plausible units and internally consistent values
- generic placeholders such as `Item 1`, `Item 2`, and `Item 3` fail where niche-specific vocabulary is required
- descriptions, benefits, and `whatsIncluded` match inspectable delivery assets

### 9.4 Dry-run and import behavior

The future validator/importer must support a dry-run that evaluates all rows and relationships without mutating catalog state. It reports row-level and relation-level findings, duplicate detection, readiness, and explicit failure reasons. Applying an import is a separate, explicit operation after review; do not partially import silently. Dry-run and apply must use the same validation rules and deterministic normalization.

## 10. Batch manifest and expected counts

Example manifest:

```json
{
  "batchId": "DPF-LAUNCH-001",
  "masters": ["HPP", "BOOK", "INV", "ADMIN", "MKT"],
  "niches": ["LDY", "CAF", "WRG", "CAT", "BAK", "BGM", "SLN", "FLR", "TKL", "FRZ"]
}
```

Expected counts are planning assertions, not generated records:
- planned product SKUs: 50
- planned niche bundles: 10
- eventual sellable offers if bundle support is approved: 60

Batch accounting must report planned, generated, valid, failed, imported, and published counts separately. It must not report a planned offer as sellable until it exists in the catalog and is published through the approved process.

## 11. Proposed logical structure

This is a future logical organization only; do not create these implementation directories as part of this specification:

```text
product-factory/
  masters/
  niches/
  batches/
  schemas/
  generators/
  validators/
```

Final source location must follow existing repository conventions and be decided during implementation planning. Shared calculation logic belongs in the verified master engine; niche profiles are configuration and must not fork formula logic unnecessarily.

## 12. Metrics and feedback loop

Future metrics should include:
- generated SKU count
- validation pass rate
- failed SKU count
- published SKU count
- revenue per master
- revenue per niche
- conversion per SKU
- add-on take rate
- bundle conversion (only after bundle support exists)

Future learning loop:

```text
PRODUCT FACTORY
  -> VALIDATOR
  -> CATALOG
  -> STOREFRONT
  -> COMMERCE
  -> TRANSACTION
  -> ANALYTICS
  -> WINNER DETECTOR
  -> PRODUCT FACTORY
```

Commerce remains the source of transaction outcomes; analytics consumes approved event contracts. The winner detector may propose a subsequent batch, but cannot publish products or change prices without the established validation and approval flow.

## 13. Compatibility with the frozen DPF contract

- This specification adds Product Factory generation detail to the Product/Catalog lane already identified by the parent contract; it does not change Commerce or Storefront responsibilities.
- Standalone product price remains the catalog `Product.price`. Checkout add-on offer price belongs to the ProductAddon relation and is server-validated by Commerce.
- Related-product placement is a Storefront presentation concern; this document only supplies relationship metadata and does not dictate UI layout.
- Product/order/payment/entitlement fields and payment security remain governed by the parent contract.
- Bundle composition is defined as a next-compatible product/entitlement extension. The parent contract's current checkout and entitlement interface does not yet support it, so bundle checkout, order representation, and entitlement expansion remain open work before bundles can be sold.
- Generated output must map to the frozen product/catalog import contract. Any schema/DTO changes require a reviewed amendment to the parent contract; this document alone does not authorize implementation changes.
- No direct cross-project database writes are allowed. Future shared capabilities must follow the approved API/event/package boundary in the parent contract.

## 14. Open implementation gaps

Before implementation, owners still need to decide:
- precise formula specifications, rounding rules, tax treatment, units, and verified test vectors for each master engine and specialized pricing configuration
- exact artifact formats and QA criteria for each engine and Admin/Marketing deliverable
- durable schema/DTO mapping for factory provenance, version lineage, relation metadata, and validation diagnostics
- slug policy across versions, redirects, retirement, and customer access to superseded versions
- bundle order-item representation, price allocation/refunds, entitlement expansion, access/revocation, and analytics semantics
- whether the add-on matrix should apply globally to all editions or be selectively enabled per SKU after commercial review
- ownership, evidence, consent, and approval rules for testimonials, safety claims, and other customer-facing assertions
- deterministic batch retry, partial failure recovery, reviewer workflow, and approval evidence retention
- analytics event ownership and winner-detector decision thresholds

These are implementation-planning gaps. They do not block this contract document and must not be filled by an AI generator with unstated assumptions.

## 15. Change boundary

This document changes no source implementation, database schema, migration, sibling project, production system, Commerce worktree, or Storefront worktree. It specifies future Product Factory behavior only.