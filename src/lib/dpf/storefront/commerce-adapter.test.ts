import { afterEach, describe, expect, it, vi } from "vitest";
import { createCommerceStorefrontAdapters, shouldUseFixtureCatalogFallback } from "./commerce-adapter";
import { listPublishedProducts } from "@/lib/commerce/catalog";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/commerce/catalog", () => ({
  listPublishedProducts: vi.fn(),
  getProductBySlug: vi.fn(),
  getProductAddons: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("storefront commerce adapter fixture gating", () => {
  it("uses fixture catalog only when explicit local/test fixture mode is enabled", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DPF_ENABLE_FIXTURE_CATALOG", "true");
    vi.mocked(listPublishedProducts).mockRejectedValue(new Error("catalog unavailable"));

    const adapters = createCommerceStorefrontAdapters();
    const page = await adapters.catalog.listProducts({ page: 1, pageSize: 12 });

    expect(shouldUseFixtureCatalogFallback()).toBe(true);
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.length).toBeGreaterThan(0);
  });

  it("fails closed without silent fixture fallback in production-like mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DPF_ENABLE_FIXTURE_CATALOG", "true");
    vi.mocked(listPublishedProducts).mockRejectedValue(new Error("catalog unavailable"));

    const adapters = createCommerceStorefrontAdapters();
    const page = await adapters.catalog.listProducts({ page: 1, pageSize: 12 });

    expect(shouldUseFixtureCatalogFallback()).toBe(false);
    expect(page).toEqual({ items: [], total: 0, page: 1, pageSize: 12, pageCount: 1 });
  });
});
