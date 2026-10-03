import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  TRAFFIC_ROLES,
  type Product,
  type ProductAddon,
} from "./types";

export const MINIMUM_PRODUCT_PRICE = 10_000;

export type CatalogValidationIssue = {
  path: string;
  sku?: string;
  slug?: string;
  message: string;
};

export type CatalogValidationReport = {
  valid: boolean;
  validCount: number;
  invalidCount: number;
  productCount: number;
  addonCount: number;
  issues: CatalogValidationIssue[];
};

type CatalogInput = {
  products: unknown[];
  addons: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function isPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= MINIMUM_PRODUCT_PRICE;
}

function addIssue(
  issues: CatalogValidationIssue[],
  path: string,
  row: Record<string, unknown> | undefined,
  message: string,
) {
  issues.push({
    path,
    ...(typeof row?.sku === "string" ? { sku: row.sku } : {}),
    ...(typeof row?.slug === "string" ? { slug: row.slug } : {}),
    message,
  });
}

export function validateCatalog(input: CatalogInput): CatalogValidationReport {
  const issues: CatalogValidationIssue[] = [];
  const productRows = input.products.map((row) => (isRecord(row) ? row : undefined));
  const addonRows = input.addons.map((row) => (isRecord(row) ? row : undefined));
  const productById = new Map<string, Record<string, unknown>>();
  const skuIndexes = new Map<string, number[]>();
  const slugIndexes = new Map<string, number[]>();
  const invalidProductIndexes = new Set<number>();
  const invalidAddonIndexes = new Set<number>();

  const productFields = [
    "id",
    "sku",
    "slug",
    "title",
    "headline",
    "description",
    "subcategory",
    "niche",
    "buyer",
    "problem",
    "useCase",
    "productType",
    "createdAt",
    "updatedAt",
  ];

  productRows.forEach((row, index) => {
    const path = `products[${index}]`;
    if (!row) {
      addIssue(issues, path, undefined, "Baris produk harus berupa object.");
      invalidProductIndexes.add(index);
      return;
    }

    for (const field of productFields) {
      if (!isNonEmptyString(row[field])) {
        addIssue(issues, `${path}.${field}`, row, "Wajib diisi dengan teks yang tidak kosong.");
        invalidProductIndexes.add(index);
      }
    }

    if (isNonEmptyString(row.id)) productById.set(row.id, row);
    if (isNonEmptyString(row.sku)) skuIndexes.set(row.sku, [...(skuIndexes.get(row.sku) ?? []), index]);
    if (isNonEmptyString(row.slug)) slugIndexes.set(row.slug, [...(slugIndexes.get(row.slug) ?? []), index]);

    if (!isNonEmptyString(row.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) {
      addIssue(issues, `${path}.slug`, row, "Gunakan slug lowercase dengan pemisah tanda hubung.");
      invalidProductIndexes.add(index);
    }
    if (!isPrice(row.price)) {
      addIssue(issues, `${path}.price`, row, `Harga produk minimal Rp${MINIMUM_PRODUCT_PRICE.toLocaleString("id-ID")} dan harus berupa bilangan bulat.`);
      invalidProductIndexes.add(index);
    }
    if (!PRODUCT_STATUSES.includes(row.status as Product["status"])) {
      addIssue(issues, `${path}.status`, row, "Status produk tidak dikenal.");
      invalidProductIndexes.add(index);
    }
    if (!TRAFFIC_ROLES.includes(row.trafficRole as Product["trafficRole"])) {
      addIssue(issues, `${path}.trafficRole`, row, "Traffic role tidak dikenal.");
      invalidProductIndexes.add(index);
    }
    if (!PRODUCT_CATEGORIES.includes(row.category as Product["category"])) {
      addIssue(issues, `${path}.category`, row, "Kategori produk tidak termasuk kategori Storefront V1.");
      invalidProductIndexes.add(index);
    }
    for (const field of ["format", "previewAssets", "deliveryAssets", "keywords"] as const) {
      if (!isStringArray(row[field])) {
        addIssue(issues, `${path}.${field}`, row, "Harus berupa daftar teks yang valid.");
        invalidProductIndexes.add(index);
      }
    }
    if (row.compareAtPrice != null && !isPrice(row.compareAtPrice)) {
      addIssue(issues, `${path}.compareAtPrice`, row, "Harga pembanding harus bilangan bulat minimal Rp10.000.");
      invalidProductIndexes.add(index);
    }
  });

  for (const [sku, indexes] of skuIndexes) {
    if (indexes.length > 1) {
      for (const index of indexes) {
        addIssue(issues, `products[${index}].sku`, productRows[index], `SKU duplikat: ${sku}.`);
        invalidProductIndexes.add(index);
      }
    }
  }
  for (const [slug, indexes] of slugIndexes) {
    if (indexes.length > 1) {
      for (const index of indexes) {
        addIssue(issues, `products[${index}].slug`, productRows[index], `Slug duplikat: ${slug}.`);
        invalidProductIndexes.add(index);
      }
    }
  }

  const addonIds = new Map<string, number[]>();
  addonRows.forEach((row, index) => {
    const path = `addons[${index}]`;
    if (!row) {
      addIssue(issues, path, undefined, "Baris add-on harus berupa object.");
      invalidAddonIndexes.add(index);
      return;
    }
    const issueCountBeforeRow = issues.length;

    for (const field of ["id", "productId", "title", "createdAt", "updatedAt"]) {
      if (!isNonEmptyString(row[field])) {
        addIssue(issues, `${path}.${field}`, row, "Wajib diisi dengan teks yang tidak kosong.");
      }
    }
    if (isNonEmptyString(row.id)) addonIds.set(row.id, [...(addonIds.get(row.id) ?? []), index]);
    if (!isPrice(row.price)) {
      addIssue(issues, `${path}.price`, row, "Harga add-on harus bilangan bulat minimal Rp10.000.");
    }
    if (typeof row.active !== "boolean") addIssue(issues, `${path}.active`, row, "Harus bernilai boolean.");
    if (typeof row.sortOrder !== "number" || !Number.isInteger(row.sortOrder)) {
      addIssue(issues, `${path}.sortOrder`, row, "Harus berupa bilangan bulat.");
    }

    const core = isNonEmptyString(row.productId) ? productById.get(row.productId) : undefined;
    if (!core) addIssue(issues, `${path}.productId`, row, "Produk utama tidak ditemukan di catalog.");

    if (row.addonProductId != null) {
      const related = isNonEmptyString(row.addonProductId) ? productById.get(row.addonProductId) : undefined;
      if (!related) {
        addIssue(issues, `${path}.addonProductId`, row, "Produk yang dirujuk add-on tidak ditemukan di catalog.");
      } else {
        if (related.id === core?.id) addIssue(issues, `${path}.addonProductId`, row, "Add-on tidak boleh menunjuk produk utamanya sendiri.");
        if (related.status !== "PUBLISHED") addIssue(issues, `${path}.addonProductId`, row, "Produk add-on harus berstatus PUBLISHED.");
        if (related.price !== row.price) addIssue(issues, `${path}.price`, row, "Harga add-on harus sama dengan harga produk yang dirujuk.");
      }
    }
    if (issues.length > issueCountBeforeRow) invalidAddonIndexes.add(index);
  });

  for (const [id, indexes] of addonIds) {
    if (indexes.length > 1) {
      for (const index of indexes) {
        addIssue(issues, `addons[${index}].id`, addonRows[index], `ID add-on duplikat: ${id}.`);
        invalidAddonIndexes.add(index);
      }
    }
  }

  const invalidCount = invalidProductIndexes.size + invalidAddonIndexes.size;
  const validCount = input.products.length + input.addons.length - invalidCount;
  return {
    valid: issues.length === 0,
    validCount,
    invalidCount,
    productCount: input.products.length,
    addonCount: input.addons.length,
    issues,
  };
}

export function dryRunCatalog(input: CatalogInput): CatalogValidationReport {
  return validateCatalog(input);
}

export type { Product, ProductAddon };