import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storefront checkout preview route", () => {
  it("resolves estimated display totals from product and addon IDs", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DPF_ENABLE_FIXTURE_CATALOG", "true");
    const response = await POST(new Request("http://localhost/api/storefront/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "dpf-hpp-umkm", selectedAddonIds: ["addon-bookkeeping-umkm", "addon-inventory-umkm"] }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, estimatedDisplayTotal: 53_000, estimateOnly: true });
  });

  it("rejects client-supplied prices instead of treating them as transaction input", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DPF_ENABLE_FIXTURE_CATALOG", "true");
    const response = await POST(new Request("http://localhost/api/storefront/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "dpf-hpp-umkm", selectedAddonIds: [], price: 1 }),
    }));
    expect(response.status).toBe(400);
  });

  it("does not expose the fixture preview endpoint in production-like mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DPF_ENABLE_FIXTURE_CATALOG", "true");
    const response = await POST(new Request("http://localhost/api/storefront/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "dpf-hpp-umkm", selectedAddonIds: [] }),
    }));
    expect(response.status).toBe(404);
  });
});