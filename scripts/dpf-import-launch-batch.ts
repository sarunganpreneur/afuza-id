import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildCommerceLaunchImport } from "../src/lib/dpf/product-factory/commerce-import";

const STAGING_PROJECT_REF = "kleuwltduofmfouidnhm";
const manifestPath = join(process.cwd(), "data", "dpf", "launch-batch-01.json");
const applyMode = process.argv.includes("--staging-apply");
const stagingDryRun = process.argv.includes("--staging-dry-run");

type ExistingProduct = Record<string, unknown> & { id: string; sku: string; slug: string };
type ExistingAddon = Record<string, unknown> & { product_id: string; addon_product_id: string | null };

function loadPlan() {
  return buildCommerceLaunchImport(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
}

function verifyStagingIdentity(): { client: SupabaseClient; url: string } {
  if (process.env.AFUZA_RUNTIME_ENV !== "staging") throw new Error("STAGING_RUNTIME_IDENTITY_REQUIRED");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("STAGING_SUPABASE_CREDENTIALS_REQUIRED");
  const parts = serviceRoleKey.split(".");
  if (parts.length !== 3) throw new Error("STAGING_PROJECT_KEY_IDENTITY_UNVERIFIABLE");
  let claims: { ref?: string; role?: string };
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { ref?: string; role?: string };
  } catch {
    throw new Error("STAGING_PROJECT_KEY_IDENTITY_UNVERIFIABLE");
  }
  if (claims.ref !== STAGING_PROJECT_REF || claims.role !== "service_role") {
    throw new Error("STAGING_PROJECT_IDENTITY_MISMATCH");
  }
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== `${STAGING_PROJECT_REF}.supabase.co`) {
    throw new Error("STAGING_SUPABASE_URL_MISMATCH");
  }
  return {
    client: createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    url,
  };
}

function equalMappedProduct(actual: ExistingProduct, expected: Record<string, unknown>): boolean {
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
}

function equalMappedAddon(actual: ExistingAddon, expected: Record<string, unknown>): boolean {
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
}

async function readExisting(client: SupabaseClient, plan: ReturnType<typeof loadPlan>) {
  const skus = plan.products.map((product) => product.sku);
  const slugs = plan.products.map((product) => product.slug);
  const [skuResult, slugResult] = await Promise.all([
    client.from("dpf_products").select("*").in("sku", skus),
    client.from("dpf_products").select("id,sku,slug").in("slug", slugs),
  ]);
  if (skuResult.error || slugResult.error) throw new Error("STAGING_DPF_CATALOG_READ_FAILED");
  const bySku = new Map(((skuResult.data ?? []) as ExistingProduct[]).map((row) => [row.sku, row]));
  const slugConflicts = ((slugResult.data ?? []) as ExistingProduct[]).filter((row) => row.sku !== plan.products.find((product) => product.slug === row.slug)?.sku);
  const mismatches = plan.products.filter((product) => {
    const existing = bySku.get(product.sku);
    return existing && !equalMappedProduct(existing, product as unknown as Record<string, unknown>);
  });
  return { bySku, slugConflicts, mismatches };
}

async function applyPlan(client: SupabaseClient, plan: ReturnType<typeof loadPlan>) {
  const preflight = await readExisting(client, plan);
  if (preflight.slugConflicts.length || preflight.mismatches.length) {
    throw new Error(`STAGING_CATALOG_CONFLICT:slug=${preflight.slugConflicts.length},mismatch=${preflight.mismatches.length}`);
  }

  const missingProducts = plan.products.filter((product) => !preflight.bySku.has(product.sku));
  if (missingProducts.length) {
    const { error } = await client.from("dpf_products").upsert(missingProducts, { onConflict: "sku", ignoreDuplicates: true });
    if (error) throw new Error("STAGING_PRODUCT_IMPORT_FAILED");
  }

  const { data: productRows, error: productReadError } = await client
    .from("dpf_products")
    .select("id,sku,slug")
    .in("sku", plan.products.map((product) => product.sku));
  if (productReadError || !productRows || productRows.length !== 50) throw new Error("STAGING_PRODUCT_IMPORT_VERIFY_FAILED");
  const idBySku = new Map((productRows as ExistingProduct[]).map((product) => [product.sku, product.id]));
  if (new Set((productRows as ExistingProduct[]).map((product) => product.slug)).size !== 50) {
    throw new Error("STAGING_PRODUCT_SLUG_DUPLICATE");
  }

  const parentIds = plan.products.map((product) => idBySku.get(product.sku)!);
  const { data: currentAddons, error: addonReadError } = await client
    .from("dpf_product_addons")
    .select("*")
    .in("product_id", parentIds);
  if (addonReadError) throw new Error("STAGING_ADDON_READ_FAILED");
  const idByPair = new Map<string, ExistingAddon>();
  for (const addon of (currentAddons ?? []) as ExistingAddon[]) {
    if (addon.addon_product_id) idByPair.set(`${addon.product_id}:${addon.addon_product_id}`, addon);
  }
  const addonsToInsert = plan.addons.flatMap((addon) => {
    const pair = `${idBySku.get(addon.parentSku)}:${idBySku.get(addon.addonSku)}`;
    const existing = idByPair.get(pair);
    const expected = {
      product_id: idBySku.get(addon.parentSku),
      addon_product_id: idBySku.get(addon.addonSku),
      title: addon.title,
      description: addon.description,
      price: addon.price,
      active: addon.active,
      sort_order: addon.sort_order,
    };
    if (existing) {
      if (!equalMappedAddon(existing, expected)) throw new Error(`STAGING_ADDON_CONFLICT:${addon.parentSku}:${addon.addonSku}`);
      return [];
    }
    return [expected];
  });
  if (addonsToInsert.length) {
    const { error } = await client.from("dpf_product_addons").insert(addonsToInsert);
    if (error) throw new Error("STAGING_ADDON_IMPORT_FAILED");
  }

  const { data: verifiedAddons, error: verifyAddonError } = await client
    .from("dpf_product_addons")
    .select("id,product_id,addon_product_id")
    .in("product_id", parentIds);
  if (verifyAddonError || !verifiedAddons || verifiedAddons.length !== plan.addons.length) {
    throw new Error("STAGING_ADDON_IMPORT_VERIFY_FAILED");
  }
  return {
    createdProducts: missingProducts.length,
    createdAddons: addonsToInsert.length,
    productCount: productRows.length,
    addonCount: verifiedAddons.length,
    idempotent: missingProducts.length === 0 && addonsToInsert.length === 0,
  };
}

async function main() {
  const plan = loadPlan();
  const baseReport = {
    productCount: plan.summary.productCount,
    valid: plan.summary.invalidProductCount === 0,
    invalid: plan.summary.invalidProductCount,
    duplicateSku: 0,
    duplicateSlug: 0,
    hppBookCompatibility: plan.summary.hppBookCompatibilityCount,
    hppInventoryCompatibility: plan.summary.hppInventoryCompatibilityCount,
    addonRelationCount: plan.addons.length,
  };
  if (!applyMode && !stagingDryRun) {
    console.log(JSON.stringify({ mode: "DRY_RUN", ...baseReport, databaseMutation: false }, null, 2));
    return;
  }

  const { client } = verifyStagingIdentity();
  const existing = await readExisting(client, plan);
  const report = {
    mode: applyMode ? "STAGING_APPLY" : "STAGING_DRY_RUN",
    ...baseReport,
    existingProducts: existing.bySku.size,
    newProducts: plan.products.length - existing.bySku.size,
    slugConflicts: existing.slugConflicts.length,
    productMismatches: existing.mismatches.length,
    databaseMutation: applyMode,
  };
  console.log(JSON.stringify(report, null, 2));
  if (existing.slugConflicts.length || existing.mismatches.length) throw new Error("STAGING_DRY_RUN_BLOCKED");
  if (applyMode) console.log(JSON.stringify(await applyPlan(client, plan), null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "DPF_IMPORT_FAILED";
  console.error(message);
  process.exitCode = 1;
});
