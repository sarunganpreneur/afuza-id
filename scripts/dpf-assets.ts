import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { buildProductPlans } from "@/lib/dpf/asset-factory/planner";
import { buildProduct } from "@/lib/dpf/asset-factory/package";
import { GENERATOR_VERSION } from "@/lib/dpf/asset-factory/masters";
import type { ProductManifest } from "@/lib/dpf/asset-factory/types";

const require = createRequire(import.meta.url);
const args = new Set(process.argv.slice(2));
const outputRoot = process.env.DPF_ASSET_OUTPUT ?? "/home/afuzaid/product-assets/dpf/v1";
const repoRoot = process.cwd();
const reportDirectory = join(repoRoot, "data/dpf/assets");
const manifestDirectory = join(reportDirectory, "manifests");
const qaReportDirectory = join(reportDirectory, "qa");

async function writeFileSafe(path: string, bytes: Buffer | string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

async function readManifest(path: string): Promise<ProductManifest> {
  return JSON.parse(await readFile(path, "utf8")) as ProductManifest;
}

function markdownReport(report: Record<string, unknown>): string {
  return [
    `# DPF Asset Factory QA: ${String(report.scope)}`,
    "",
    `- Generated: ${String(report.generatedAt)}`,
    `- Generator: ${GENERATOR_VERSION}`,
    `- Products: ${String(report.productCount)}`,
    `- QA passed: ${String(report.qaPassed)}`,
    `- QA failed: ${String(report.qaFailed)}`,
    `- Unresolved placeholders: ${String(report.placeholderLeaks)}`,
    `- Package failures: ${String(report.packageFailures)}`,
    `- Human review: HUMAN_REVIEW_PENDING (automation only; no human approval claimed)`,
    "",
    "| SKU | Master | Niche | QA | Files | Package SHA-256 | Failures |",
    "|---|---|---|---|---:|---|---|",
    ...(report.products as Array<ProductManifest>).map((manifest) => `| ${manifest.sku} | ${manifest.masterCode} | ${manifest.nicheCode} | ${manifest.status} | ${manifest.files.length} | ${manifest.package.sha256} | ${[...manifest.qa.structure.failures, ...manifest.qa.formulas.failures, ...manifest.qa.content.failures, ...manifest.qa.nicheSpecificity.failures, ...manifest.qa.packaging.failures].join("; ") || "-"} |`),
    "",
  ].join("\n");
}

async function generate(scope: "KUL" | "ALL") {
  const generatedAt = "2026-10-05T00:00:00.000Z";
  const pilotPath = join(reportDirectory, "pilot-kul-report.json");
  if (scope === "ALL") {
    const pilot = JSON.parse(await readFile(pilotPath, "utf8")) as { status: string; qaPassed: number; qaFailed: number };
    if (pilot.status !== "PASS" || pilot.qaPassed !== 5 || pilot.qaFailed !== 0) throw new Error("ALL_50_GENERATION_REQUIRES_PASSING_KUL_PILOT");
  }
  const plans = buildProductPlans(scope);
  const manifests: ProductManifest[] = [];
  for (const plan of plans) {
    const build = await buildProduct(plan, generatedAt);
    manifests.push(build.manifest);
    for (const file of build.files) {
      if (file.filename.endsWith(".zip")) {
        await writeFileSafe(join(outputRoot, "packages", plan.product.sku, file.filename), file.bytes);
      } else if (file.filename.endsWith("-manifest.json")) {
        await writeFileSafe(join(outputRoot, "generated", plan.product.sku, file.filename), file.bytes);
      } else {
        await writeFileSafe(join(outputRoot, "generated", plan.product.sku, file.filename), file.bytes);
      }
    }
    const manifest = JSON.stringify(build.manifest, null, 2) + "\n";
    await writeFileSafe(join(manifestDirectory, `${plan.product.sku}.json`), manifest);
    await writeFileSafe(join(qaReportDirectory, `${plan.product.sku}.json`), `${JSON.stringify(build.manifest.qa, null, 2)}\n`);
    await writeFileSafe(join(outputRoot, "manifests", `${plan.product.sku}.json`), manifest);
    await writeFileSafe(join(outputRoot, "qa", `${plan.product.sku}.json`), `${JSON.stringify(build.manifest.qa, null, 2)}\n`);
  }
  const failed = manifests.filter((manifest) => manifest.status !== "QA_PASSED");
  const report = {
    scope,
    generatedAt,
    generatorVersion: GENERATOR_VERSION,
    productCount: manifests.length,
    qaPassed: manifests.filter((manifest) => manifest.status === "QA_PASSED").length,
    qaFailed: failed.length,
    placeholderLeaks: manifests.filter((manifest) => manifest.qa.content.failures.includes("placeholder-token-detected")).length,
    packageFailures: manifests.filter((manifest) => !manifest.qa.packaging.passed).length,
    byMaster: Object.fromEntries(["HPP", "BOOK", "INV", "ADMIN", "MKT"].map((master) => [master, manifests.filter((manifest) => manifest.masterCode === master).length])),
    byNiche: Object.fromEntries(["KUL", "CAF", "RTL", "FAS", "LND", "SAL", "BNG", "ONL", "BAK", "PRO"].map((niche) => [niche, manifests.filter((manifest) => manifest.nicheCode === niche).length])),
    humanReview: "HUMAN_REVIEW_PENDING",
    status: failed.length === 0 ? "PASS" : "FAIL",
    products: manifests,
  };
  const baseName = scope === "KUL" ? "pilot-kul-report" : "all-products-report";
  await writeFileSafe(join(reportDirectory, `${baseName}.json`), `${JSON.stringify(report, null, 2)}\n`);
  await writeFileSafe(join(reportDirectory, `${baseName}.md`), markdownReport(report));
  await writeFileSafe(join(outputRoot, "qa", `${baseName}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ scope, productCount: report.productCount, qaPassed: report.qaPassed, qaFailed: report.qaFailed, report: join(reportDirectory, `${baseName}.json`), outputRoot }, null, 2));
  if (failed.length) process.exitCode = 1;
}

async function publishStaging() {
  const stagingUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (process.env.AFUZA_RUNTIME_ENV !== "staging" || !stagingUrl || new URL(stagingUrl).hostname !== "kleuwltduofmfouidnhm.supabase.co" || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("STAGING_PUBLICATION_GUARD_FAILED");
  }
  if (!args.has("--staging")) throw new Error("EXPLICIT_STAGING_FLAG_REQUIRED");
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucket = await client.storage.getBucket("dpf-delivery-v1");
  if (bucket.error || bucket.data?.public !== false) throw new Error("PRIVATE_STAGING_BUCKET_REQUIRED");
  const packagePaths = await readdir(join(outputRoot, "packages"), { withFileTypes: true });
  const packageEntries = packagePaths.filter((candidate) => candidate.isDirectory());
  if (packageEntries.length !== 50) throw new Error(`STAGING_PUBLICATION_REQUIRES_50_PACKAGES:${packageEntries.length}`);
  const manifests: ProductManifest[] = [];
  for (const entry of packageEntries) {
    const manifest = await readManifest(join(manifestDirectory, `${entry.name}.json`));
    if (!["QA_PASSED", "STAGING_PUBLISHED"].includes(manifest.status) || !manifest.qa.passed) throw new Error(`QA_GATE_FAILED:${entry.name}`);
    manifests.push(manifest);
  }
  const publishPass = async () => {
    for (const manifest of manifests) {
      const sku = manifest.sku;
      const packagePath = join(outputRoot, "packages", sku, manifest.package.filename);
      const bytes = await readFile(packagePath);
      const digest = (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");
      if (digest !== manifest.package.sha256) throw new Error(`PACKAGE_SHA_MISMATCH:${sku}`);
      const product = await client.from("dpf_products").select("id").eq("sku", sku).eq("status", "PUBLISHED").maybeSingle();
      if (product.error || !product.data) throw new Error(`STAGING_PRODUCT_NOT_FOUND:${sku}`);
      const storageKey = `products/v1/${sku}/${manifest.package.filename}`;
      const upload = await client.storage.from("dpf-delivery-v1").upload(storageKey, bytes, { contentType: "application/zip", upsert: true });
      if (upload.error) throw new Error(`STAGING_PACKAGE_UPLOAD_FAILED:${sku}:${upload.error.statusCode ?? "UNKNOWN"}`);
      const asset = await client.from("dpf_delivery_assets").upsert({
        product_id: product.data.id,
        addon_id: null,
        storage_bucket: "dpf-delivery-v1",
        storage_key: storageKey,
        mime_type: "application/zip",
        file_name: manifest.package.filename,
        signed_url_expiry_seconds: 180,
      }, { onConflict: "storage_bucket,storage_key", ignoreDuplicates: false }).select("id").single();
      if (asset.error) throw new Error(`STAGING_ASSET_MAPPING_FAILED:${sku}:${asset.error.code ?? "UNKNOWN"}`);
      const mappings = await client.from("dpf_delivery_assets").select("id").eq("storage_bucket", "dpf-delivery-v1").eq("storage_key", storageKey);
      if (mappings.error || mappings.data.length !== 1) throw new Error(`STAGING_MAPPING_NOT_EXACTLY_ONE:${sku}`);
      const objects = await client.storage.from("dpf-delivery-v1").list(`products/v1/${sku}`, { search: manifest.package.filename, limit: 100 });
      if (objects.error || objects.data.filter((object: { name: string }) => object.name === manifest.package.filename).length !== 1) throw new Error(`STAGING_OBJECT_NOT_EXACTLY_ONE:${sku}`);
    }
  };
  await publishPass();
  await publishPass();
  for (const manifest of manifests) {
    manifest.status = "STAGING_PUBLISHED";
    const text = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFileSafe(join(manifestDirectory, `${manifest.sku}.json`), text);
    await writeFileSafe(join(outputRoot, "manifests", `${manifest.sku}.json`), text);
  }
  const publishReport = { status: "STAGING_PUBLISHED", count: manifests.length, replay: "IDEMPOTENT", secondPassDuplicateObjects: 0, secondPassDuplicateRows: 0, bucket: "dpf-delivery-v1", private: true };
  await writeFileSafe(join(reportDirectory, "staging-publication-report.json"), `${JSON.stringify(publishReport, null, 2)}\n`);
  console.log(JSON.stringify(publishReport, null, 2));
}

async function main() {
  if (args.has("--staging")) return publishStaging();
  return generate(args.has("--all") ? "ALL" : "KUL");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "DPF_ASSET_FACTORY_FAILED");
  process.exitCode = 1;
});