import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  buildLaunchBatchManifest,
  dryRunProductImport,
  generateLaunchBatch01,
  validateLaunchBatch01,
} from "../src/lib/dpf/product-factory/launch-batch-01";

const mode = process.argv[2] ?? "generate";
const manifestPath = join(process.cwd(), "data", "dpf", "launch-batch-01.json");

if (mode === "generate") {
  const batch = generateLaunchBatch01();
  const validation = validateLaunchBatch01(batch);
  const manifest = buildLaunchBatchManifest(batch);
  if (!existsSync(dirname(manifestPath))) mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, validationSummary: validation.summary }, null, 2));
  console.log(JSON.stringify({ batchId: batch.batchId, productCount: batch.products.length, valid: validation.valid }, null, 2));
  process.exit(0);
}

if (mode === "validate") {
  const batch = generateLaunchBatch01();
  const validation = validateLaunchBatch01(batch);
  console.log(JSON.stringify({ valid: validation.valid, summary: validation.summary }, null, 2));
  process.exit(validation.valid ? 0 : 1);
}

if (mode === "dry-run") {
  const batch = generateLaunchBatch01();
  const result = dryRunProductImport(batch.products, []);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.classification === "CREATE" ? 0 : 1);
}

console.error("Usage: tsx scripts/dpf-launch-batch.ts [generate|validate|dry-run]");
process.exit(2);
