import { dryRunCatalog } from "../src/lib/dpf/storefront/catalog-validation";
import { fixtureProductAddons, fixtureProducts } from "../src/lib/dpf/storefront/fixture-catalog";

if (!process.argv.includes("--dry-run")) {
  console.error("Usage: npx tsx scripts/validate-storefront-catalog.ts --dry-run");
  process.exitCode = 2;
} else {
  const report = dryRunCatalog({ products: fixtureProducts, addons: fixtureProductAddons });
  console.log(`Dry run: ${report.valid ? "VALID" : "INVALID"}`);
  console.log(`Catalog rows: ${report.productCount + report.addonCount} total, ${report.validCount} valid, ${report.invalidCount} invalid`);
  console.log(`Products: ${report.productCount}; add-ons: ${report.addonCount}`);
  for (const issue of report.issues) {
    console.log(`${issue.path}${issue.sku ? ` [${issue.sku}]` : ""}${issue.slug ? ` (${issue.slug})` : ""}: ${issue.message}`);
  }
  if (!report.valid) process.exitCode = 1;
}