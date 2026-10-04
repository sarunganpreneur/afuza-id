import {
  generateLaunchBatch01,
  validateLaunchBatch01,
  type DpfProduct,
} from "./launch-batch-01";

type ManifestProduct = {
  sku: string;
  slug: string;
  masterId: string;
  nicheId: string;
  price: number;
  description: string;
  features: string[];
  tags: string[];
  assetContract: string[];
  compatibility: { sameNicheOnly: boolean; relatedSkus: string[] };
};

type LaunchManifest = {
  batchId: string;
  products: ManifestProduct[];
  compatibilityMetadata: {
    sameNicheOnly: boolean;
    offerMatrix: Record<string, Record<string, number>>;
  };
};

export type CommerceProductInsert = {
  sku: string;
  slug: string;
  title: string;
  short_title: string;
  headline: string;
  description: string;
  category: string;
  subcategory: string;
  niche: string;
  buyer: string;
  problem: string;
  use_case: string;
  product_type: string;
  format: string[];
  price: number;
  traffic_role: DpfProduct["trafficRole"];
  status: "PUBLISHED";
  preview_assets: string[];
  keywords: string[];
};

export type CommerceAddonInsert = {
  parentSku: string;
  addonSku: string;
  title: string;
  description: string;
  price: number;
  active: true;
  sort_order: number;
};

export type CommerceLaunchImport = {
  products: CommerceProductInsert[];
  addons: CommerceAddonInsert[];
  summary: {
    masterCount: number;
    nicheCount: number;
    productCount: number;
    invalidProductCount: number;
    hppBookCompatibilityCount: number;
    hppInventoryCompatibilityCount: number;
  };
};

function asManifest(value: unknown): LaunchManifest {
  if (!value || typeof value !== "object") throw new Error("LAUNCH_MANIFEST_INVALID");
  const manifest = value as Partial<LaunchManifest>;
  if (manifest.batchId !== "DPF-LAUNCH-BATCH-01" || !Array.isArray(manifest.products)) {
    throw new Error("LAUNCH_MANIFEST_INVALID");
  }
  if (!manifest.compatibilityMetadata?.sameNicheOnly || !manifest.compatibilityMetadata.offerMatrix) {
    throw new Error("LAUNCH_COMPATIBILITY_CONTRACT_INVALID");
  }
  return manifest as LaunchManifest;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildCommerceLaunchImport(manifestValue: unknown): CommerceLaunchImport {
  const manifest = asManifest(manifestValue);
  const batch = generateLaunchBatch01();
  const validation = validateLaunchBatch01(batch);
  if (!validation.valid || validation.summary.masterCount !== 5 || validation.summary.nicheCount !== 10) {
    throw new Error("FROZEN_FACTORY_CONTRACT_INVALID");
  }
  if (manifest.products.length !== 50 || new Set(manifest.products.map((product) => product.sku)).size !== 50) {
    throw new Error("LAUNCH_MANIFEST_PRODUCT_COUNT_INVALID");
  }

  const factoryBySku = new Map(batch.products.map((product) => [product.sku, product]));
  const manifestBySku = new Map(manifest.products.map((product) => [product.sku, product]));
  for (const manifestProduct of manifest.products) {
    const factoryProduct = factoryBySku.get(manifestProduct.sku);
    if (
      !factoryProduct ||
      factoryProduct.slug !== manifestProduct.slug ||
      factoryProduct.masterId !== manifestProduct.masterId ||
      factoryProduct.nicheId !== manifestProduct.nicheId ||
      factoryProduct.price !== manifestProduct.price ||
      factoryProduct.description !== manifestProduct.description ||
      !sameJsonValue(factoryProduct.features, manifestProduct.features) ||
      !sameJsonValue(factoryProduct.tags, manifestProduct.tags) ||
      !sameJsonValue(factoryProduct.assetContract, manifestProduct.assetContract) ||
      !manifestProduct.compatibility.sameNicheOnly ||
      !sameJsonValue(factoryProduct.compatibility.relatedSkus, manifestProduct.compatibility.relatedSkus)
    ) {
      throw new Error(`LAUNCH_MANIFEST_FACTORY_MISMATCH:${manifestProduct.sku}`);
    }
  }
  if (manifestBySku.size !== factoryBySku.size) throw new Error("LAUNCH_MANIFEST_FACTORY_MISMATCH");

  const products: CommerceProductInsert[] = manifest.products.map((manifestProduct) => {
    const product = factoryBySku.get(manifestProduct.sku)!;
    return {
      sku: product.sku,
      slug: product.slug,
      title: product.title,
      short_title: product.shortTitle,
      headline: product.headline,
      description: product.description,
      category: product.category,
      subcategory: product.subcategory,
      niche: product.niche,
      buyer: product.buyer,
      problem: product.problem,
      use_case: product.useCase,
      product_type: product.productType,
      format: product.format,
      price: product.price,
      traffic_role: product.trafficRole,
      status: "PUBLISHED",
      preview_assets: [],
      keywords: product.keywords,
    };
  });

  const addons: CommerceAddonInsert[] = [];
  const hppBook = new Set<string>();
  const hppInventory = new Set<string>();
  for (const parentManifest of manifest.products) {
    const parent = factoryBySku.get(parentManifest.sku)!;
    const seen = new Set<string>();
    for (const addonSku of parentManifest.compatibility.relatedSkus) {
      const addon = factoryBySku.get(addonSku);
      if (!addon || seen.has(addonSku) || addon.nicheId !== parent.nicheId) {
        throw new Error(`SAME_NICHE_COMPATIBILITY_INVALID:${parent.sku}`);
      }
      seen.add(addonSku);
      const offerPrice = manifest.compatibilityMetadata.offerMatrix[parent.masterId]?.[addon.masterId];
      if (offerPrice === undefined) continue;
      if (!Number.isInteger(offerPrice) || offerPrice < 0) throw new Error("COMPATIBILITY_OFFER_PRICE_INVALID");
      addons.push({
        parentSku: parent.sku,
        addonSku: addon.sku,
        title: addon.title,
        description: addon.description,
        price: offerPrice,
        active: true,
        sort_order: seen.size - 1,
      });
      if (parent.masterId === "HPP" && addon.masterId === "BOOK") hppBook.add(parent.nicheId);
      if (parent.masterId === "HPP" && addon.masterId === "INV") hppInventory.add(parent.nicheId);
    }
  }

  if (hppBook.size !== 10 || hppInventory.size !== 10) throw new Error("HPP_COMPATIBILITY_CONTRACT_INVALID");
  return {
    products,
    addons,
    summary: {
      masterCount: validation.summary.masterCount,
      nicheCount: validation.summary.nicheCount,
      productCount: products.length,
      invalidProductCount: 0,
      hppBookCompatibilityCount: hppBook.size,
      hppInventoryCompatibilityCount: hppInventory.size,
    },
  };
}