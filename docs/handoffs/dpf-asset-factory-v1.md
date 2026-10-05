# DPF Asset Factory V1 Handoff

## Base and lane

- Branch: `feature/dpf-asset-factory-v1`
- Base: `a0c766d2baec0c2c87ae8a3a9c1c2a07dd33beef`
- Worktree: `/home/afuzaid/engineering/worktrees/dpf-asset-factory`
- Binary output: `/home/afuzaid/product-assets/dpf/v1/` (outside Git)
- Staging bucket: `dpf-delivery-v1`, private; publication requires explicit `--staging`
- Production: untouched and closed

## Implemented architecture

`src/lib/dpf/asset-factory/` contains typed contracts, five master specs, ten niche datasets, deterministic planning against the Launch Batch 01 source, five file generators, XLSX/DOCX/PDF generation, ZIP packaging, SHA-256 manifests, and automated QA. The CLI is `scripts/dpf-assets.ts`. It generates KUL by default; `--all` requires a passing pilot report. Staging publication is separate and explicit.

Generated binaries are not intended for Git. Repository outputs are machine-readable manifests and QA/human-review reports. Do not publish `QA_FAILED` output. Do not mark a human review passed from automated results.

## Commands

```bash
npm run dpf:assets
npm run dpf:assets -- --all
npm run dpf:assets -- --staging
npx vitest run src/lib/dpf/asset-factory/asset-factory.test.ts
npm run lint
npx tsc --noEmit --pretty false
npm run test -- --run
```

The default command is local-only KUL pilot generation/QA. `--all` is permitted only when `data/dpf/assets/pilot-kul-report.json` says `PASS` with 5 QA passes. `--staging` requires staging identity, the accepted staging project URL, and a service-role key from the operator environment. No default command publishes.

## Required remaining acceptance

1. Inspect `pilot-kul-report.md` and the five external packages. Resolve any pilot failure in shared generator/spec/niche logic before all-50 generation.
2. Complete the human-review queue for KUL, CAF, FAS, BNG, and PRO, with at least one sample per master family; leave it pending until an actual reviewer records findings.
3. Generate all 50 and require every manifest/package QA pass, ten SKUs per family, distinct niche content, valid ZIPs/hashes, and zero placeholders/duplicates.
4. Run lint, typecheck, and the full suite. Build only if needed for an integration check.
5. Only after human review and 50 QA passes, publish to staging. Verify replay idempotency, private bucket state, row mapping, and actual purchased ZIP download/hash/contents.

## Dependency security review

**DEPENDENCY_SECURITY_REVIEW: PENDING**

The install reported 14 npm audit advisories: 5 moderate, 7 high, and 2 critical. These advisories do not invalidate the completed Asset Factory functional acceptance, but they must be reviewed before production approval. No `npm audit fix` or `npm audit fix --force` was run, and dependency upgrades are not part of this freeze.

No production action is authorized by this handoff. Final production readiness remains `NO` pending separate approval.