import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildCommerceLaunchImport } from "./commerce-import";

const manifest = JSON.parse(readFileSync(join(process.cwd(), "data/dpf/launch-batch-01.json"), "utf8")) as unknown;

describe("Commerce Launch Batch import mapping", () => {
  it("maps the frozen 5-master, 10-niche, 50-SKU manifest to the Commerce schema", () => {
    const plan = buildCommerceLaunchImport(manifest);

    expect(plan.summary).toEqual({
      masterCount: 5,
      nicheCount: 10,
      productCount: 50,
      invalidProductCount: 0,
      hppBookCompatibilityCount: 10,
      hppInventoryCompatibilityCount: 10,
    });
    expect(plan.products).toHaveLength(50);
    expect(plan.products.map((product) => product.sku)).toHaveLength(new Set(plan.products.map((product) => product.sku)).size);
    expect(plan.products.map((product) => product.slug)).toHaveLength(new Set(plan.products.map((product) => product.slug)).size);
    expect(new Set(plan.products.map((product) => product.status))).toEqual(new Set(["PUBLISHED"]));
    expect(plan.products.find((product) => product.sku.endsWith("-HPP-V1"))?.price).toBe(19000);
    expect(plan.products.find((product) => product.sku.endsWith("-BOOK-V1"))?.price).toBe(29000);
    expect(plan.products.find((product) => product.sku.endsWith("-INV-V1"))?.price).toBe(25000);
    expect(plan.products.find((product) => product.sku.endsWith("-ADMIN-V1"))?.price).toBe(29000);
    expect(plan.products.find((product) => product.sku.endsWith("-MKT-V1"))?.price).toBe(39000);
    expect(plan.products.every((product) => product.preview_assets.length === 0)).toBe(true);
  });

  it("imports only explicitly priced same-niche compatibility edges", () => {
    const plan = buildCommerceLaunchImport(manifest);
    const masterForSku = new Map(plan.products.map((product) => [product.sku, product]));
    const hppBook = plan.addons.filter((addon) => addon.parentSku.includes("-HPP-") && addon.addonSku.includes("-BOOK-"));
    const hppInventory = plan.addons.filter((addon) => addon.parentSku.includes("-HPP-") && addon.addonSku.includes("-INV-"));

    expect(hppBook).toHaveLength(10);
    expect(hppInventory).toHaveLength(10);
    expect(new Set(hppBook.map((addon) => addon.price))).toEqual(new Set([19000]));
    expect(new Set(hppInventory.map((addon) => addon.price))).toEqual(new Set([15000]));
    expect(plan.addons.every((addon) => masterForSku.get(addon.parentSku)?.niche === masterForSku.get(addon.addonSku)?.niche)).toBe(true);
    expect(plan.addons.some((addon) => addon.parentSku.includes("-BOOK-") && addon.addonSku.includes("-HPP-"))).toBe(false);
  });

  it("rejects any frozen manifest field that differs from the factory source", () => {
    const altered = JSON.parse(JSON.stringify(manifest)) as { products: Array<{ price: number }> };
    altered.products[0].price += 1;

    expect(() => buildCommerceLaunchImport(altered)).toThrow("LAUNCH_MANIFEST_FACTORY_MISMATCH");
  });
});