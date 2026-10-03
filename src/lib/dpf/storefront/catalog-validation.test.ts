import { describe, expect, it } from "vitest";
import { dryRunCatalog, validateCatalog } from "./catalog-validation";
import { fixturePresentations, fixtureProductAddons, fixtureProducts } from "./fixture-catalog";
import { fixtureStorefrontAdapters } from "./fixture-adapter";
import { createFixtureStorefrontAdapters } from "./fixture-adapter";
import type { Product } from "./types";

function copyFixture() {
  return {
    products: structuredClone(fixtureProducts) as Product[],
    addons: structuredClone(fixtureProductAddons),
  };
}

describe("storefront catalog validation", () => {
  it("accepts the complete 31-SKU fixture catalog", () => {
    const report = validateCatalog({ products: fixtureProducts, addons: fixtureProductAddons });
    expect(report).toMatchObject({ valid: true, validCount: 33, invalidCount: 0, addonCount: 2 });
    expect(report.issues).toEqual([]);
  });

  it("rejects duplicate SKUs and slugs with actionable row paths", () => {
    const catalog = copyFixture();
    catalog.products[1].sku = catalog.products[0].sku;
    catalog.products[2].slug = catalog.products[0].slug;
    const report = validateCatalog(catalog);
    expect(report.issues.some((issue) => issue.path === "products[1].sku" && issue.sku === catalog.products[1].sku)).toBe(true);
    expect(report.issues.some((issue) => issue.path === "products[2].slug" && issue.slug === catalog.products[2].slug)).toBe(true);
  });

  it("rejects under-minimum prices and invalid enum values", () => {
    const catalog = copyFixture();
    catalog.products[0].price = 9_999;
    catalog.products[1].status = "LIVE" as Product["status"];
    const report = validateCatalog(catalog);
    expect(report.issues.some((issue) => issue.path === "products[0].price")).toBe(true);
    expect(report.issues.some((issue) => issue.path === "products[1].status")).toBe(true);
  });

  it("rejects malformed required storefront data and counts invalid rows", () => {
    const catalog = copyFixture();
    delete (catalog.products[0] as Partial<Product>).headline;
    catalog.addons[0].active = "yes" as unknown as boolean;
    const report = validateCatalog(catalog);
    expect(report.issues.some((issue) => issue.path === "products[0].headline")).toBe(true);
    expect(report.issues.some((issue) => issue.path === "addons[0].active")).toBe(true);
    expect(report).toMatchObject({ valid: false, validCount: 31, invalidCount: 2 });
  });

  it("rejects invalid core and missing related-product addon relations", () => {
    const catalog = copyFixture();
    catalog.addons[0].productId = "missing-core";
    catalog.addons[1].addonProductId = "missing-addon";
    const report = validateCatalog(catalog);
    expect(report.issues.some((issue) => issue.path === "addons[0].productId")).toBe(true);
    expect(report.issues.some((issue) => issue.path === "addons[1].addonProductId")).toBe(true);
  });

  it("dry-runs without mutating supplied rows", () => {
    const catalog = copyFixture();
    const before = structuredClone(catalog);
    const report = dryRunCatalog(catalog);
    expect(report.valid).toBe(true);
    expect(catalog).toEqual(before);
  });
});

describe("storefront fixture adapter", () => {
  it("resolves the flagship and reports display-only totals", async () => {
    const productId = "dpf-hpp-umkm";
    const addons = await fixtureStorefrontAdapters.catalog.getVisibleAddons(productId);
    expect(addons.map((addon) => addon.title)).toEqual(["Pembukuan Usaha", "Inventory Tracker"]);
    await expect(fixtureStorefrontAdapters.checkoutPreview.resolveSelection({ productId, selectedAddonIds: [] }))
      .resolves.toMatchObject({ ok: true, estimatedDisplayTotal: 19_000, estimateOnly: true });
    await expect(fixtureStorefrontAdapters.checkoutPreview.resolveSelection({ productId, selectedAddonIds: [addons[0].id] }))
      .resolves.toMatchObject({ ok: true, estimatedDisplayTotal: 38_000 });
    await expect(fixtureStorefrontAdapters.checkoutPreview.resolveSelection({ productId, selectedAddonIds: addons.map((addon) => addon.id) }))
      .resolves.toMatchObject({ ok: true, estimatedDisplayTotal: 53_000 });
  });

  it("resolves product details, unknown slugs and unavailable addons", async () => {
    await expect(fixtureStorefrontAdapters.catalog.getProductBySlug("kalkulator-hpp-harga-jual-umkm"))
      .resolves.toMatchObject({ sku: "AFZ-SPR-HPP-001" });
    await expect(fixtureStorefrontAdapters.catalog.getProductBySlug("missing-product")).resolves.toBeNull();
    await expect(fixtureStorefrontAdapters.checkoutPreview.resolveSelection({ productId: "dpf-hpp-umkm", selectedAddonIds: ["disabled-or-unknown"] }))
      .resolves.toEqual({ ok: false, reason: "ADDON_UNAVAILABLE" });
  });

  it("hides disabled addons and refuses them in display previews", async () => {
    const adapters = createFixtureStorefrontAdapters({
      products: fixtureProducts,
      addons: fixtureProductAddons.map((addon, index) => index === 0 ? { ...addon, active: false } : addon),
      presentations: fixturePresentations,
    });
    await expect(adapters.catalog.getVisibleAddons("dpf-hpp-umkm")).resolves.toHaveLength(1);
    await expect(adapters.checkoutPreview.resolveSelection({ productId: "dpf-hpp-umkm", selectedAddonIds: ["addon-bookkeeping-umkm"] }))
      .resolves.toEqual({ ok: false, reason: "ADDON_UNAVAILABLE" });
  });

  it("searches metadata deterministically and paginates without loading every result", async () => {
    await expect(fixtureStorefrontAdapters.catalog.listProducts({ q: "hpp" })).resolves.toMatchObject({ total: 1 });
    await expect(fixtureStorefrontAdapters.catalog.listProducts({ category: "Marketing" })).resolves.toMatchObject({ total: 2 });
    await expect(fixtureStorefrontAdapters.catalog.listProducts({ q: "Pendidikan" })).resolves.toMatchObject({ total: 5 });
    await expect(fixtureStorefrontAdapters.catalog.listProducts({ q: "guru" })).resolves.toMatchObject({ total: 5 });
    await expect(fixtureStorefrontAdapters.catalog.listProducts({ q: "tersebar di banyak tempat" })).resolves.toMatchObject({ total: 6 });
    await expect(fixtureStorefrontAdapters.catalog.listProducts({ q: "tracker" })).resolves.toMatchObject({ total: 2 });
    await expect(fixtureStorefrontAdapters.catalog.listProducts({ page: 2, pageSize: 5 })).resolves.toMatchObject({ page: 2, pageSize: 5, items: expect.any(Array) });
  });
});