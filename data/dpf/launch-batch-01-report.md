# DPF Launch Batch 01 Evidence

Niche source: V1_FALLBACK
Factory version: 1.0.0
Manifest: data/dpf/launch-batch-01.json

## Core counts
- Masters: 5
- Niches: 10
- Generated SKUs: 50
- Validation: PASS
- Deterministic generation: PASS
- Dry-run import: CREATE (no mutation)

## Master definitions
- HPP — Kalkulator HPP & Harga Jual — 19000
- BOOK — Pembukuan Usaha — 29000
- INV — Inventory Tracker — 25000
- ADMIN — Business Administration Kit — 29000
- MKT — Marketing Kit — 39000

## Add-on offer metadata
- BOOK: 19000
- INV: 15000

## Niche list
- KUL — Kuliner / Warung / Resto
- CAF — Cafe / Coffee Shop
- RTL — Retail / Toko Kelontong
- FAS — Fashion / Clothing
- LND — Laundry
- SAL — Salon / Barbershop
- BNG — Bengkel
- ONL — Toko Online / Reseller
- BAK — Bakery / Snack
- PRO — Jasa Profesional

## Canonical downstream totals
- 19000 — PASS
- 38000 — PASS
- 53000 — PASS

## Same-niche compatibility
- HPP -> BOOK and INV only
- BOOK -> HPP and INV only
- INV -> HPP and BOOK only
- ADMIN -> BOOK and MKT only
- MKT -> ADMIN and BOOK only

## Asset completeness
- 50/50 SKUs include required workbook, sample data, preview metadata, and version metadata requirements.

## Niche specificity summary
- Threshold: 60
- Average score: 70.6
- Generic keyword-swapped variants fail validation and are excluded from pass state.
