# Digital Product Factory Assets V1

## Purpose and boundaries

Asset Factory V1 generates five sellable product families for the ten canonical Launch Batch 01 niches. The Launch Batch manifest and `src/lib/dpf/product-factory/launch-batch-01.ts` remain the source of SKU, slug, master, niche, and price identity. Asset generation is local and non-mutating by default. It does not change Commerce schema, product pricing, orders, payments, entitlements, or production.

The generator is implemented under `src/lib/dpf/asset-factory/`. `masters.ts` owns product-family contracts; `niches.ts` owns reusable sector knowledge; `planner.ts` joins those sources to the canonical manifest; `generators/` creates files; `package.ts` builds package manifests and runs QA; `scripts/dpf-assets.ts` controls generation and the explicit staging publication lane.

## Asset architecture

```text
Launch Batch manifest + master specifications + niche dataset
                         |
                    deterministic planner
                         |
       HPP / BOOK / INV / ADMIN / MKT generators
                         |
          XLSX + editable DOCX + quick-start PDF
                         |
        structural/content/niche/package automated QA
                         |
        SHA-256 manifest + ZIP customer package
                         |
        external binary workspace (not committed)
                         |
 explicit --staging publication -> private bucket -> delivery mapping
```

The binary workspace defaults to `/home/afuzaid/product-assets/dpf/v1/` and can be redirected with `DPF_ASSET_OUTPUT`. It contains `generated/<SKU>/`, `packages/<SKU>/<SKU>-V1.zip`, `qa/`, and `manifests/`. Repository data contains only JSON manifests and QA reports. Generated XLSX, DOCX, PDF, and ZIP files are never committed to normal Git history.

## Master product specification

All customer materials are written in Bahasa Indonesia for beginner UMKM owners. Examples are clearly identified as illustrations and must be replaced with verified business values.

| Master | Primary package files | Required functional content | Standalone price |
|---|---|---|---:|
| HPP | Formula-based XLSX + quick-start PDF | Business profile; recipe/material cost; quantity/unit; packaging, labor, overhead and waste; total batch cost; unit HPP; target margin; suggested price; markup; unit profit; simple break-even; three niche examples | Rp19.000 |
| BOOK | Transaction XLSX + quick-start PDF | Setup; dated income and expense records; category, cash, receivable/payable status; monthly summary; simple cash profit/loss; dashboard; niche transactions | Rp29.000 |
| INV | Inventory XLSX + quick-start PDF | SKU/item master, category, unit, supplier, opening stock, movement log, live current stock, purchase cost, stock value, minimum/reorder status, dashboard, niche items | Rp25.000 |
| ADMIN | Operations XLSX + editable DOCX forms + quick-start PDF | Customer and supplier databases; quotation; purchase/order form; invoice and numbering guide; receiving record; expense/payment records; operational checklist | Rp29.000 |
| MKT | Marketing XLSX + editable DOCX worksheet + quick-start PDF | Persona, offer, evidence-based USP, 30-day content structure, hooks/CTAs, promotion calendar, campaign tracker, conversion/cost/AOV/ROAS calculations, niche examples | Rp39.000 |

BOOK and INV checkout offer prices are not product standalone prices: BOOK offers at Rp19.000 and INV at Rp15.000. Asset Factory does not write offer or catalog prices.

## Niche adaptation rules

`niches.ts` pairs the existing canonical profile with explicit examples for each of KUL, CAF, RTL, FAS, LND, SAL, BNG, ONL, BAK, and PRO. Each dataset contains three distinct products/services with material quantities and units, three inventory examples with suppliers/cost/minimums, expense categories, customer segments, administration examples, and actionable offer/hook/channel/CTA examples.

Generators consume that dataset rather than implementing per-sector business logic. Every workbook and companion document should use multiple niche examples. Automated QA checks distinct examples across product, inventory, expense, and offer content; a simple niche-name substitution is insufficient. Examples are illustrative, not represented as observed market prices or guaranteed results.

## Package format and deterministic names

Each package is `packages/<SKU>/<SKU>-V1.zip`. Internal filenames are stable and SKU-prefixed, for example `<SKU>-Kalkulator.xlsx`, `<SKU>-Administrasi.xlsx`, `<SKU>-Formulir-Editable.docx`, and `<SKU>-Panduan-Cepat.pdf`. The ZIP contains only customer files, sorted by filename; no temporary files, source code, system metadata, or `__MACOSX` entries are allowed.

`data/dpf/assets/manifests/<SKU>.json` records SKU, slug, master/niche code, version, generator version, generation timestamp, price identity, role/filename/MIME/byte length/SHA-256 for each file, ZIP name/size/SHA-256, QA evidence, and status. Generation status is `GENERATED`, then `QA_FAILED` or `QA_PASSED`; only the explicit staging publisher may advance a passing manifest to `STAGING_PUBLISHED`.

## QA contract

The build reopens XLSX workbooks with ExcelJS, verifies expected sheet names and non-empty structure, rejects duplicate sheets, inspects formulas and rejects broken-reference/error tokens, and checks minimum master-specific live formula patterns. Formula calculation is delegated to spreadsheet-compatible applications; formula presence and reference structure are verified here, not recalculated by a headless spreadsheet engine.

DOCX files are reopened as ZIP packages, required Word XML parts are checked, and document text is extracted for content/placeholder checks. PDFs are parsed with PDF-Lib and must contain at least one page. ZIP packages are reopened with CRC checking; required files, non-empty entries, no unexpected system files, and package SHA-256 are verified.

Content QA rejects `{{...}}`, Lorem Ipsum, TODO/TBD and explicit fill-in placeholder tokens; checks meaningful text volume and niche-specific terms; and records structure, formula, content, niche-specificity, and packaging results separately. Any failed QA leaves the SKU `QA_FAILED`; failed products cannot be published. Automated checks are not human approval.

## Manifest and QA reports

Per-SKU JSON manifests and QA records are stored in `data/dpf/assets/manifests/` and `data/dpf/assets/qa/` in the external binary workspace. Pilot and batch summaries are stored as both JSON and Markdown under `data/dpf/assets/`. These reports distinguish `AUTOMATED_QA` from `HUMAN_REVIEW_PENDING` and `HUMAN_REVIEW_PASSED`.

## Storage path and delivery contract

Only `npm run dpf:assets -- --staging` can publish. It requires `AFUZA_RUNTIME_ENV=staging`, the accepted staging Supabase project, an explicitly configured service-role key, and a private `dpf-delivery-v1` bucket. Each customer ZIP is uploaded to `products/v1/<SKU>/<SKU>-V1.zip`; the corresponding `dpf_delivery_assets` row points to the published product and that package object. Upload uses upsert and the asset row uses the unique `(storage_bucket, storage_key)` conflict key, so replay must not add another object or mapping row. The service returns authorized signed download links through the existing delivery route; the bucket is never made public.

## Versioning and regeneration

The current product and niche content versions are V1 and generator version is recorded independently. A material change to a master contract or file layout requires a reviewed new asset version; it must not silently overwrite a customer’s previously purchased version. A niche-data correction can regenerate only affected SKUs, but all affected packages must pass QA again. Regeneration is deterministic for identical manifest/master/niche inputs and fixed generation timestamp. Existing package bytes are compared by SHA-256 before staging replacement.

Local commands never publish. Re-running a generation command rewrites only the selected SKU scope under the external asset directory and repository manifests/reports. Publication is a separate explicit action.

## Staging publication workflow

1. Run the default KUL pilot and require exactly five generated SKUs, five QA passes, no structural/content/package failures.
2. Review the pilot outputs and reports. Automation must not set human review to passed.
3. Run the all-SKU generation only after the stored KUL pilot report passes.
4. Require 50 unique manifests/packages, 50 QA passes, ten SKUs per master, zero unresolved placeholders, zero duplicate SKUs/package names, and zero package failures.
5. Complete the human-review queue for KUL, CAF, FAS, BNG, and PRO, including at least one SKU from each master family. Record reviewer/date/findings; until then classification remains `HUMAN_REVIEW_PENDING`.
6. Publish explicitly to staging private storage. Verify object/package hashes, product-to-asset mappings, private bucket state, and a second publication with zero additional objects or rows.
7. Run a fresh staging purchase for KUL HPP through checkout, TEST payment, entitlement, My Products, and actual ZIP download. Compare downloaded ZIP SHA-256 and contents to its manifest.

Asset readiness is `PILOT_ONLY`, `GENERATED_NOT_PUBLISHED`, or `REAL_PRODUCT_ASSETS`, based on evidence. A sample text file is not a sellable asset.

## Production hard gate

Production remains CLOSED and `PRODUCTION READY = NO`, regardless of pilot or staging results. No production upload, product import, payment configuration, deployment, or database mutation is part of this factory. Production requires a separately approved review, publication plan, data/storage mapping, security review, and operator authorization.