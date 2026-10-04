import { describe, expect, it } from "vitest";
import {
  MASTER_DEFINITIONS,
  NICHE_PROFILES,
  buildLaunchBatchManifest,
  dryRunProductImport,
  generateLaunchBatch01,
  validateLaunchBatch01,
} from "./launch-batch-01";

describe("dpf product factory launch batch 01", () => {
  it("generates exactly 5 masters x 10 niches = 50 unique SKUs and canonical costs", () => {
    const batch = generateLaunchBatch01();

    expect(MASTER_DEFINITIONS).toHaveLength(5);
    expect(NICHE_PROFILES).toHaveLength(10);
    expect(batch.products).toHaveLength(50);
    expect(new Set(batch.products.map((product) => product.sku)).size).toBe(50);
    expect(new Set(batch.products.map((product) => product.slug)).size).toBe(50);

    const priceByMaster = new Map(batch.products.map((product) => [product.masterId, product.price]));
    expect(priceByMaster.get("HPP")).toBe(19000);
    expect(priceByMaster.get("BOOK")).toBe(29000);
    expect(priceByMaster.get("INV")).toBe(25000);
    expect(priceByMaster.get("ADMIN")).toBe(29000);
    expect(priceByMaster.get("MKT")).toBe(39000);
  });

  it("requires same-niche add-on relations and rejects invalid cross-niche logic", () => {
    const validation = validateLaunchBatch01(generateLaunchBatch01());

    expect(validation.valid).toBe(true);
    expect(validation.summary.masterCount).toBe(5);
    expect(validation.summary.nicheCount).toBe(10);
    expect(validation.summary.productCount).toBe(50);
    expect(validation.summary.offerMatrix["HPP"]["BOOK"]).toBe(19000);
    expect(validation.summary.offerMatrix["HPP"]["INV"]).toBe(15000);

    const invalidCrossNiche = {
      productId: "AFZ-HPP-CAF-001",
      masterId: "HPP",
      nicheId: "CAF",
      addonMasterId: "BOOK",
      addonNicheId: "LDY",
    };

    const dryRun = dryRunProductImport(generateLaunchBatch01().products, [invalidCrossNiche as never]);
    expect(dryRun.classification).toBe("INVALID");
    expect(dryRun.reasons[0]).toContain("same niche");
  });

  it("creates a deterministic manifest and dry-run import summary", () => {
    const batch = generateLaunchBatch01();
    const manifest = buildLaunchBatchManifest(batch);

    expect(manifest.batchId).toBe("DPF-LAUNCH-BATCH-01");
    expect(manifest.factoryVersion).toBe("1.0.0");
    expect(manifest.products).toHaveLength(50);
    expect(manifest.validationSummary.valid).toBe(true);
    expect(manifest.validationSummary.productCount).toBe(50);

    const dryRun = dryRunProductImport(batch.products, []);
    expect(dryRun.classification).toBe("CREATE");
    expect(dryRun.productCount).toBe(50);
    expect(dryRun.productMap.size).toBe(50);
  });
});
