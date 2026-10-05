import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateLaunchBatch01 } from "@/lib/dpf/product-factory/launch-batch-01";
import { GENERATOR_VERSION, MASTER_SPECS, SOURCE_MASTER_BY_CODE } from "./masters";
import { NICHE_DATA, NICHE_CODES } from "./niches";
import type { MasterCode, NicheCode, PlannedProduct } from "./types";

const manifestPath = resolve(process.cwd(), "data/dpf/launch-batch-01.json");

export function buildProductPlans(scope: "KUL" | "ALL" = "ALL"): PlannedProduct[] {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { products: Array<{ sku: string; slug: string; masterId: string; nicheId: string; price: number }> };
  const generated = generateLaunchBatch01();
  if (manifest.products.length !== 50 || generated.products.length !== 50) throw new Error("LAUNCH_MANIFEST_MUST_CONTAIN_50_PRODUCTS");
  const sourceRows = new Map(manifest.products.map((product) => [product.sku, product]));
  const plans = generated.products.map((product) => {
    const source = sourceRows.get(product.sku);
    if (!source || source.slug !== product.slug || source.masterId !== product.masterId || source.nicheId !== product.nicheId || source.price !== product.price) {
      throw new Error(`LAUNCH_MANIFEST_MISMATCH:${product.sku}`);
    }
    const masterCode = product.masterCode as MasterCode;
    const nicheCode = product.nicheId as NicheCode;
    const master = MASTER_SPECS[masterCode];
    const sourceMaster = SOURCE_MASTER_BY_CODE.get(masterCode);
    const niche = NICHE_DATA[nicheCode];
    if (!master || !sourceMaster || !niche || product.price !== master.priceIdr) throw new Error(`ASSET_PLAN_SOURCE_MISSING:${product.sku}`);
    return { product, master, sourceMaster, niche };
  });
  const plansBySku = new Map(plans.map((plan) => [plan.product.sku, plan]));
  if (plansBySku.size !== 50 || sourceRows.size !== 50) throw new Error("DUPLICATE_OR_MISSING_LAUNCH_SKU");
  if (NICHE_CODES.length !== 10 || Object.keys(MASTER_SPECS).length !== 5) throw new Error("MASTER_NICHE_MATRIX_INCOMPLETE");
  return plans.filter((plan) => scope === "ALL" || plan.product.nicheId === scope);
}

export { GENERATOR_VERSION };