import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("storefront checkout preview route", () => {
  it("resolves estimated display totals from product and addon IDs", async () => {
    const response = await POST(new Request("http://localhost/api/storefront/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "dpf-hpp-umkm", selectedAddonIds: ["addon-bookkeeping-umkm", "addon-inventory-umkm"] }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, estimatedDisplayTotal: 53_000, estimateOnly: true });
  });

  it("rejects client-supplied prices instead of treating them as transaction input", async () => {
    const response = await POST(new Request("http://localhost/api/storefront/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "dpf-hpp-umkm", selectedAddonIds: [], price: 1 }),
    }));
    expect(response.status).toBe(400);
  });
});