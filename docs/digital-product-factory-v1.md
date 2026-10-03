# Digital Product Factory V1 Contract Freeze

Status: frozen for implementation planning
Scope: native module inside existing afuza.id, not a parallel subdomain or standalone app.

## 1. Scope and non-goals

This document is the source of truth for the Commerce Lane and Storefront Lane of the Digital Product Factory V1.

In scope:
- public catalog listing and read-only product detail pages
- product add-ons and cart calculation
- server-side checkout and order creation
- payment confirmation / webhook handling
- entitlement issuance after validated payment
- authenticated product access page and secure delivery
- catalog import validation and dry-run support

Out of scope for V1:
- new standalone payment provider setup
- AI semantic search
- affiliate/commission system
- large-scale storefront redesign
- production migration execution
- deploy or production infra changes

## 2. Existing stack and reuse decisions

This project is a Next.js 16 App Router application with Supabase as the primary auth + DB + storage layer.

Key reuse decisions:
- Auth: reuse existing `auth.users` from Supabase and existing server-side `@supabase/ssr` client pattern from `src/lib/supabase/server.ts`.
- Database: use Supabase Postgres as the canonical data store; no Prisma or ORM layer is present in this repo.
- Storage: reuse Supabase Storage and signed URLs / private bucket patterns rather than introducing a new storage system.
- Payment: no payment adapter exists in the current codebase. For V1, use a provider-agnostic contract that can later attach to existing provider infrastructure once one is approved.
- Analytics: no analytics SDK is currently wired in this repo. Use server-side event contracts and later attach to existing analytics infrastructure if/when introduced.
- UI: reuse existing Next.js app shell and design system patterns; no parallel storefront shell.
- API: use server actions and Route Handlers in the App Router, with server-only auth checks and validation.

## Shared Capability Reuse

This DPF contract does not assume a standalone product architecture. The following ecosystem capabilities were audited read-only and mapped to the DPF design.

### Reuse matrix

| Capability | Source project | Classification | Evidence | Proposed DPF integration | Coupling risk |
| --- | --- | --- | --- | --- | --- |
| Product lifecycle + SKU uniqueness + approval gate | CHALWA (`/home/afuzaid/apps/chalwa`) | REUSE_PATTERN | `apps/chalwa/src/domain.ts` contains `Design/Product` status models, `ProductVariant`, `sku` uniqueness checks, and approval gates | Reuse validation pattern for product lifecycle and uniqueness rules; map DPF statuses to existing state semantics but do not import CHALWA DB state | Medium: lifecycle semantics are valuable, but the CHALWA repo is not the canonical product writer for DPF |
| Workflow/orchestration state machine + retry/idempotency pattern | KlodHost (`/home/afuzaid/apps/klodhost`) | REUSE_PATTERN | `apps/klodhost/src/contracts.ts` defines provider adapter, ordered lifecycle states, and provider-neutral contract models | Reuse request/state semantics for checkout workflow, retries, and idempotent processing boundaries | Medium: provider-agnostic pattern is safe, but not a direct runtime dependency |
| Approval / execution guardrail policy | AFUZA OPS (`/home/afuzaid/engineering/repos/afuza-id/src/lib/ops/approvals-registry.ts`) | REUSE_DIRECT | approval policy registry sets `requires_human_approval` and `execution_enabled = false` for risky actions | Reuse the same approval policy pattern for catalog publish, pricing changes, payment confirmation, and entitlement actions | Low-to-medium: safe if using only registry semantics and not direct ops DB writes |
| Lead ingestion + idempotency + validation | Shared Acquisition Engine (`/home/afuzaid/engineering/repos/afuza-id/src/app/api/internal/lead-engine/v1/leads/upsert/route.ts`) | REUSE_PATTERN | route performs auth, `idempotency-key`, validation, and duplicate-contact handling | Reuse the lead ingestion contract pattern for catalog import validation, deduplication, and request replay safety | Medium: acquisition flow is not DPF business logic but is a good request-contract template |
| Tenant scoping / entitlement / membership guardrails | Marketing Agency (`/home/afuzaid/apps/marketing-agency/src/agency-domain.ts`) | REUSE_PATTERN | tenant scope enforcement and entitlement checks exist; `assertTenantScope`, `assertEntitled`, `resolveEntitlement` | Reuse pattern for user entitlement checks, tenant ownership, and feature gating | Medium: business semantics are analogous but not directly interchangeable |
| AI orchestration / control-center pattern | AFUZA AI (`/home/afuzaid/ai/afuza-ai/README.md`) | REUSE_PATTERN | locked architecture defines `afuza.id` as control center and AI workers as specialist services | Reuse the control-center separation model, but keep DPF as a business module inside `afuza.id` | Low: architecture pattern only |
| Creative generation / asset pipeline | AFUZA Creative OS (`/home/afuzaid/apps/afuza-creative-os/README.md`) | REUSE_PATTERN | reads as a bounded creative platform with worker/scheduler boundaries and storage concerns isolated to owning packages | Reuse the worker/scheduler packaging pattern for asset workflows; do not reuse creative infra as a DPF dependency | Medium: the platform is not yet a production service and should remain a consumer contract |
| Shared acquisition analytics / campaign pipeline | Shared Acquisition Engine in `afuza-id` | REUSE_PATTERN | `.afuzactl/ecosystem/projects.json` lists `shared-acquisition-engine` and `acquisition-analytics` | Reuse event naming and funnel semantics for `product_view`, `search`, and `purchase_completed` if a shared metrics contract is later approved | Medium: growth analytics is important but not yet owned by a stable shared API |

### Architecture rule: no direct cross-project database writes

The DPF must not implement direct cross-project writes to CHALWA, KlodHost, or Marketing Agency data stores. The preferred integration order is:

1. shared package/library when a proven generic utility already exists
2. explicit internal API contract within the existing `afuza.id` boundary
3. explicit event/job contract for async work
4. copy only small generic utility code as a last resort, and keep it isolated from domain-specific data access

The canonical writer remains the owning domain. DPF is a consumer of shared contracts, not a second write-surface.

### Lane responsibility update

- Product/Catalog Lane: prioritize CHALWA lifecycle and SKU validation patterns only as a reference model. The product catalog schema remains owned by DPF, but the lifecycle semantics and uniqueness checks are adapted rather than copied wholesale.
- Commerce Lane: prioritize KlodHost-style state-machine discipline, idempotency keys, and request replay handling for checkout and payment processing. However, DPF must not call KlodHost domain code or write KlodHost tables.
- Content/Growth Lane: prioritize Marketing Agency and shared acquisition patterns for content pipeline metadata, funnel semantics, and event naming, but only through approved cross-domain contracts.

### Proposed safe parallel worktree plan

This should be treated as a proposal only; no worktrees are created in this revision phase.

- Base repository: `/home/afuzaid/engineering/repos/afuza-id`
- Base branch: `canonical/ax-control-plane-20261003`
- Integration branch: `feature/dpf-launch-v1` (current contract freeze branch)
- Commerce worktree path: `/home/afuzaid/engineering/repos/afuza-id-commerce/feature/dpf-commerce-v1`
- Storefront worktree path: `/home/afuzaid/engineering/repos/afuza-id-storefront/feature/dpf-storefront-v1`
- Rule: each parallel worktree must branch from `feature/dpf-launch-v1` and must not share the same dirty working directory as the main repo

This keeps Person 2 and Person 3 isolated from each other while preserving the single contract source-of-truth in the main repo.

## 3. Canonical entity contracts

### 3.1 Product

```ts
export type ProductStatus =
  | "DRAFT"
  | "READY"
  | "PUBLISHED"
  | "TESTING"
  | "WINNER"
  | "SCALING"
  | "ARCHIVED";

export type TrafficRole =
  | "ACQUISITION"
  | "MONETIZATION"
  | "ADD_ON"
  | "BUNDLE_COMPONENT"
  | "SEO_LONGTAIL";

export type ProductType = string;
export type ProductFormat = string[];

export type Product = {
  id: string;
  sku: string;
  slug: string;

  title: string;
  shortTitle?: string | null;
  headline: string;
  description: string;

  category: string;
  subcategory: string;
  niche: string;
  buyer: string;
  problem: string;
  useCase: string;

  productType: ProductType;
  format: ProductFormat;

  price: number;
  compareAtPrice?: number | null;

  trafficRole: TrafficRole;
  status: ProductStatus;

  previewAssets: string[];
  deliveryAssets: string[];

  keywords: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;

  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Business requirements:
- pricing is always server-side authoritative; client never owns the final price
- minimum sell price is `Rp10.000` (or `10000` in minor units) unless explicit internal bundle rules are defined later
- duplicate `sku` and duplicate `slug` are rejected by validation and DB unique constraints
- unpublished products are not purchasable

### 3.2 Product add-on

```ts
export type ProductAddon = {
  id: string;
  productId: string;

  addonProductId?: string | null;
  title: string;
  description?: string | null;

  price: number;
  active: boolean;
  sortOrder: number;

  createdAt: string;
  updatedAt: string;
};
```

Design note:
- This document prefers a single `product_addons` table with a nullable `addonProductId` reference to a canonical product row, plus a fallback `title/description/price` variant for simple additive items.
- If the team needs a purely "definition" model later, it can be introduced as a stricter subtype without changing the public contract.

### 3.3 Cart contract

Canonical cart is server-computed and is not trusted from the browser alone.

```ts
export type CartItem = {
  productId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  addonIds: string[];
};

export type Cart = {
  id: string;
  userId?: string | null;
  sessionId?: string | null;
  coreProductId: string;
  selectedAddonIds: string[];
  quantity: number;
  displaySubtotal: number;
  serverComputedTotal: number;
  updatedAt: string;
};
```

Required rules:
- `displaySubtotal` is a UI helper only; it is not the source of truth.
- `serverComputedTotal` is the only authoritative monetary value.
- Client prices can be used for UX display but must be recalculated server-side before checkout.
- Add-on selection is validated by server checks for `active`, eligible product relationship, and pricing rules.

### 3.4 Order and order item

```ts
export type OrderStatus =
  | "PENDING"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "FAILED"
  | "CANCELLED";

export type OrderItemType = "CORE" | "ADD_ON" | "BUNDLE";

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  skuSnapshot: string;
  titleSnapshot: string;
  priceSnapshot: number;
  itemType: OrderItemType;
  addonProductId?: string | null;
  quantity: number;
  createdAt: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  customerUserId: string;
  status: OrderStatus;
  subtotal: number;
  addonTotal: number;
  total: number;
  createdAt: string;
  paidAt?: string | null;
};
```

Important source-of-truth rule:
- Order items must store a snapshot of product price and title; product table mutations after checkout must never mutate historical order records.

### 3.5 Payment contract

```ts
export type PaymentProvider = string;
export type PaymentStatus = "INITIATED" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export type Payment = {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  providerReference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  confirmedAt?: string | null;
  rawProviderData?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};
```

Callback / webhook requirements:
- webhook must be provider-authenticated / verified per provider contract
- all callback actions must be idempotent
- payment confirmation may only issue entitlement once
- duplicate callback or retry must not create duplicate order payments or duplicate entitlements
- raw provider payload is stored only for audit/traceability and is not exposed to the public frontend

### 3.6 Customer entitlement

```ts
export type EntitlementStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export type CustomerEntitlement = {
  id: string;
  userId: string;
  productId: string;
  orderId: string;
  orderItemId?: string | null;
  grantedAt: string;
  revokedAt?: string | null;
  status: EntitlementStatus;
};
```

Rules:
- Entitlement is created only after valid payment status is `PAID`.
- This entitlement is the authorization source for `/akun/produk` and delivery access.
- A user cannot access another user's entitlements.

### 3.7 Delivery asset contract

```ts
export type DeliveryAsset = {
  id: string;
  productId: string;
  entitlementId?: string | null;
  storageBucket: string;
  storageKey: string;
  mimeType?: string | null;
  fileName: string;
  signedUrlExpirySeconds?: number | null;
  createdAt: string;
};
```

Security requirement:
- Never expose raw filesystem paths.
- Delivery should use either Supabase private bucket + authenticated server-side access or short-lived signed URLs.
- Access must be gated by entitlement and user identity.

### 3.8 Search contract

V1 uses conventional catalog metadata search, not AI semantic search.

```ts
export type ProductSearchIndex = {
  title: string;
  category: string;
  subcategory: string;
  niche: string;
  buyer: string;
  problem: string;
  keywords: string[];
};
```

Indexed fields:
- title
- category
- subcategory
- niche
- buyer
- problem
- keywords

This is intentionally structured so semantic search or vector indexing can be added later without changing the core entity shape.

### 3.9 Bulk product import contract

Canonical JSON import format:

```json
{
  "sku": "AFZ-SPR-HPP-001",
  "slug": "kalkulator-hpp-harga-jual-umkm",
  "title": "Kalkulator HPP & Harga Jual UMKM",
  "headline": "Hitung HPP dan harga jual untuk usaha mikro dan kecil.",
  "category": "Bisnis & UMKM",
  "subcategory": "Keuangan",
  "niche": "UMKM",
  "buyer": "Pemilik usaha",
  "problem": "Sulit menghitung HPP dan harga jual yang tepat.",
  "productType": "Spreadsheet",
  "format": ["XLSX"],
  "price": 19000,
  "trafficRole": "ACQUISITION",
  "status": "PUBLISHED",
  "keywords": ["hpp", "harga jual", "umkm"],
  "addons": [
    {
      "title": "Pembukuan Usaha",
      "description": "Template pembukuan usaha harian.",
      "price": 19000,
      "active": true,
      "sortOrder": 1
    },
    {
      "title": "Inventory Tracker",
      "description": "Tracker stok barang dan omzet.",
      "price": 15000,
      "active": true,
      "sortOrder": 2
    }
  ]
}
```

Import validation requirements:
- validate all rows before commit
- dry-run / validation mode required
- reject duplicate SKU and slug before applying commit
- validate numeric price and business rules before mutation
- accumulate row/item errors and report them without partial silent corruption

## 4. Route contract

### 4.1 Public routes

| Route | Purpose | Ownership | Auth required |
| --- | --- | --- | --- |
| `/produk` | product listing | Server route + storefront component | No |
| `/produk/[slug]` | product detail | Server route + storefront component | No |
| `/cart` | cart state and summary | Client + server cart API | No |
| `/checkout` | checkout form and server confirmation | Server + client | No for browsing, yes for order creation |
| `/order/[id]` | order status page | Server page + API | Optional but tied to ownership |

### 4.2 Authenticated routes

| Route | Purpose | Ownership | Auth required |
| --- | --- | --- | --- |
| `/akun/produk` | purchased products and download access | Server page + entitlement service | Yes |

### 4.3 API / service ownership

- Storefront Lane owns UI DTO mappers, route rendering, and client-side cart state.
- Commerce Lane owns server-side price validation, checkout orchestration, order creation, payment confirmation, and entitlement issuance.
- Product/Catalog Lane owns import validation, catalog CRUD, and seeded fixtures.

## 5. API / service contract

Canonical server functions should follow the existing App Router conventions already used by the repo.

```ts
export type ProductListInput = {
  status?: ProductStatus[];
  category?: string;
  q?: string;
};

export async function listPublishedProducts(input: ProductListInput): Promise<Product[]>;
export async function getProductBySlug(slug: string): Promise<Product | null>;
export async function searchProducts(query: string): Promise<Product[]>;
export async function getProductAddons(productId: string): Promise<ProductAddon[]>;

export async function createCheckout(input: {
  productId: string;
  addonIds?: string[];
  quantity?: number;
  customerUserId?: string;
  sessionId?: string;
}): Promise<{ orderId: string; total: number; status: string }>;

export async function getOrder(orderId: string, userId: string): Promise<Order | null>;
export async function confirmPayment(input: {
  provider: string;
  providerReference: string;
  rawPayload: Record<string, unknown>;
  signature?: string;
}): Promise<{ ok: boolean; orderId?: string; status: string }>;

export async function getMyProducts(userId: string): Promise<Product[]>;
export async function getProductDownloadAccess(userId: string, productId: string): Promise<{ allowed: boolean; assetUrls?: string[]; reason?: string }>;
```

Notes:
- These services are intentionally shaped to fit the current App Router server-only architecture.
- All monetary totals must be computed in the server layer and never trust browser input.
- `confirmPayment` must be idempotent and safe to replay.

## 6. Analytics event contract

No analytics platform is currently present in the codebase. The event contract below should be mapped to future infrastructure if available.

```ts
export type ProductViewEvent = {
  event: "product_view";
  productId: string;
  sku: string;
  niche: string;
  category: string;
  price: number;
};

export type SearchEvent = {
  event: "search";
  query: string;
  category?: string;
  niche?: string;
  resultCount: number;
};

export type AddToCartEvent = {
  event: "add_to_cart";
  productId: string;
  sku: string;
  category: string;
  niche: string;
  price: number;
  addonIds: string[];
};

export type CheckoutStartedEvent = {
  event: "checkout_started";
  productId: string;
  sku: string;
  category: string;
  niche: string;
  price: number;
  orderId?: string;
};

export type AddonSelectedEvent = {
  event: "addon_selected";
  productId: string;
  addonProductId: string;
  price: number;
  category: string;
  niche: string;
};

export type PurchaseCompletedEvent = {
  event: "purchase_completed";
  productId: string;
  sku: string;
  category: string;
  niche: string;
  price: number;
  orderId: string;
};

export type DownloadStartedEvent = {
  event: "download_started";
  productId: string;
  sku: string;
  userId: string;
  category: string;
  niche: string;
};
```

No personal or payment-card data should be sent in these events.

## 7. Database change plan (proposed, not production-applied)

This repo already uses Supabase Postgres with SQL migrations. There is no current product catalog or payment schema, so the safest design is an additive schema rather than duplicate/incompatible tables.

### 7.1 Extend vs duplicate

Preferred pattern: extend the current Supabase schema with new additive tables. This is safer than creating a duplicate parallel store because:
- it reuses the current auth user model
- it uses the same DB and connection layer
- it avoids parallel security and RLS logic
- it keeps product/order/payment state in one source of truth

Proposed minimal tables:
- `products`
- `product_addons`
- `carts`
- `orders`
- `order_items`
- `payments`
- `customer_entitlements`
- `delivery_assets`

### 7.2 Recommended schema plan

1. `products`
   - PK `id`
   - unique `sku`
   - unique `slug`
   - status, traffic role, price, SEO fields, metadata
2. `product_addons`
   - FK `product_id` => `products.id`
   - optional `addon_product_id` => `products.id`
   - `active`, `sort_order`, `price`
3. `orders`
   - FK `customer_user_id` => `auth.users.id`
   - `status`, `subtotal`, `addon_total`, `total`, `order_number`
4. `order_items`
   - FK `order_id`
   - snapshot fields for product + price + title + SKU
5. `payments`
   - FK `order_id`
   - provider + provider reference + status + amount + raw payload
6. `customer_entitlements`
   - FK `user_id` => `auth.users.id`
   - FK `product_id` => `products.id`
   - FK `order_id` => `orders.id`
   - `granted_at`, `status`
7. `delivery_assets`
   - FK `product_id`
   - storage bucket + object key + optional signed url metadata

### 7.3 Migration strategy

- Do not apply to production.
- Create dev/staging migration under `supabase/migrations/` only.
- Add unique constraints:
  - `products.sku UNIQUE`
  - `products.slug UNIQUE`
  - `product_addons(product_id, addon_product_id)` if needed
  - `payments(order_id, provider_reference)` when provider-specific uniqueness is required
- Add indexes on `status`, `slug`, `category`, `subcategory`, `traffic_role`, `product_id`, `user_id`, `status`, `order_id`
- Add server-side RLS policies to scope user access to their own orders and entitlements

## 8. Security and quality gates

Required enforcement:
- minimum sell price enforced on server; no client-supplied pricing
- client cannot change product price or addon price
- unpublished product cannot be purchased
- disabled addon cannot be purchased
- order total must be recalculated server-side
- entitlement created only once valid payment is `PAID`
- user A cannot access user B entitlement
- secure delivery URL path cannot be bypassed through direct object path access
- duplicate SKU and duplicate slug are rejected
- import validates in dry-run mode before commit
- import reports row and item errors without silently corrupting catalog
- idempotent payment confirmation flow

## 9. First product fixture (seed / test)

### Product

```json
{
  "sku": "AFZ-SPR-HPP-001",
  "slug": "kalkulator-hpp-harga-jual-umkm",
  "title": "Kalkulator HPP & Harga Jual UMKM",
  "headline": "Hitung HPP dan harga jual untuk usaha mikro dan kecil.",
  "category": "Bisnis & UMKM",
  "subcategory": "Keuangan",
  "niche": "UMKM",
  "buyer": "Pemilik usaha",
  "problem": "Sulit menghitung HPP dan harga jual yang tepat.",
  "useCase": "Membantu pemilik usaha menentukan harga jual yang sehat.",
  "productType": "Spreadsheet",
  "format": ["XLSX"],
  "price": 19000,
  "trafficRole": "ACQUISITION",
  "status": "PUBLISHED",
  "keywords": ["hpp", "harga jual", "umkm"],
  "addons": [
    {
      "title": "Pembukuan Usaha",
      "price": 19000,
      "active": true,
      "sortOrder": 1
    },
    {
      "title": "Inventory Tracker",
      "price": 15000,
      "active": true,
      "sortOrder": 2
    }
  ]
}
```

### Expected totals

- Core only: `19000`
- Core + Addon 1: `38000`
- Core + Addon 1 + Addon 2: `53000`

## 10. Parallel lane boundaries

### Lane A — Commerce

Allowed ownership:
- checkout orchestration
- order creation
- payment state handling
- entitlement issuance after payment confirmation
- server-side total calculation and pricing validation
- order status and user-owned order pages

Required interfaces:
- `createCheckout()`
- `getOrder()`
- `confirmPayment()`

Disallowed areas:
- storefront copy and catalog UI
- search indexing logic
- bulk import validation logic
- product content authoring and SEO metadata editing

### Lane B — Storefront

Allowed ownership:
- `/produk` page rendering
- `/produk/[slug]` detail rendering
- `/cart` client state and display
- `/checkout` UX and form fields
- `Product` DTO mapping from server data
- add-on selection UX and cross-sell component blocks

Required DTOs/adapters:
- `ProductCardViewModel`
- `ProductDetailViewModel`
- `CartSummaryViewModel`

Disallowed areas:
- payment provider logic
- order database writes
- entitlement issuance
- server-side pricing enforcement

### Lane C — Product / Catalog generation

Allowed ownership:
- product import validators
- bulk JSON/CSV parser and dry-run mode
- catalog normalization and uniqueness checks
- seed fixtures for product and add-on data
- search indexing metadata preparation

Required interfaces:
- `validateImportRow()`
- `dryRunImport()`
- `applyImportBatch()`
- seed fixture generator utilities

Disallowed areas:
- checkout UX
- payment callback code
- page routing design
- storefront design system customization

## 11. Validation against current codebase

This freeze is compatible with the existing repo architecture because:
- app routes are already organized under `src/app/`
- server-side auth is handled with `@supabase/ssr`
- DB access is already done via Supabase clients in server-only code
- storage and signed URL patterns are already present via the generation content and image upload workflow
- no existing product/order/payment tables conflict with the planned additive schema
- route naming does not collide with existing `src/app/(auth)`, `src/app/dashboard`, `src/app/ops`, and `src/app/p` patterns
- the planned route names are additive and do not reuse current app folders

Potential naming collision risk:
- `product` is a common domain term, but no current route or database table uses a `products` catalog table in this app.
- `order` and `payment` names are common but not currently reserved in this repo route tree.

## 12. Implementation notes for future work

This document intentionally stops at contract freeze. It is not a feature implementation, and it does not create a parallel app.

Implementation should be done in the existing Next.js App Router with:
- server-side route handlers or server actions where auth and pricing validation are required
- Supabase client factories already used by the repo
- a single database schema extension rather than a duplicated commerce service
- existing auth and storage patterns where possible

## 13. Final stop condition

This contract freeze is complete. No storefront buildout, checkout UI implementation, production migration, or deploy actions are included in this phase.
