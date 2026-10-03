import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dpf/storefront", () => ({
  storefrontAdapters: {
    checkoutPreview: { resolveSelection: vi.fn() },
  },
}));

import { storefrontAdapters } from "@/lib/dpf/storefront";
import { POST } from "./route";

const productId = "22222222-2222-4222-8222-222222222222";
const addonId = "33333333-3333-4333-8333-333333333333";

function request(body: unknown) {
  return new Request("http://localhost/api/storefront/selection-summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("storefront selection summary endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a display estimate resolved from Commerce identifiers", async () => {
    vi.mocked(storefrontAdapters.checkoutPreview.resolveSelection).mockResolvedValue({
      ok: true,
      product: { id: productId } as never,
      selectedAddons: [],
      estimatedDisplayTotal: 19000,
      currency: "IDR",
      estimateOnly: true,
    });
    const response = await POST(request({ productId, selectedAddonIds: [] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, estimatedDisplayTotal: 19000, estimateOnly: true });
    expect(storefrontAdapters.checkoutPreview.resolveSelection).toHaveBeenCalledWith({ productId, selectedAddonIds: [] });
  });

  it("rejects client-supplied price fields", async () => {
    const response = await POST(request({ productId, selectedAddonIds: [addonId], price: 1 }));
    expect(response.status).toBe(400);
    expect(storefrontAdapters.checkoutPreview.resolveSelection).not.toHaveBeenCalled();
  });
});