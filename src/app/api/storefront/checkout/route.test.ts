import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/commerce/catalog", () => ({
  listPublishedProducts: vi.fn(),
  getProductAddons: vi.fn(),
}));
vi.mock("@/lib/commerce/checkout", () => ({
  createCheckout: vi.fn(),
  getOrder: vi.fn(),
}));

import { getProductAddons, listPublishedProducts } from "@/lib/commerce/catalog";
import { createCheckout, getOrder } from "@/lib/commerce/checkout";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const bookId = "33333333-3333-4333-8333-333333333333";
const inventoryId = "44444444-4444-4444-8444-444444444444";
const orderId = "55555555-5555-4555-8555-555555555555";

const product = {
  id: productId, sku: "AFZ-HPP-UMKM-001", slug: "kalkulator-hpp-umkm", title: "Kalkulator HPP",
  category: "Bisnis & UMKM", niche: "UMKM", price: 19000,
};
const addons = [
  { id: bookId, productId, addonProductId: null, title: "Pembukuan Usaha", price: 19000, active: true, sortOrder: 1 },
  { id: inventoryId, productId, addonProductId: null, title: "Inventory Tracker", price: 15000, active: true, sortOrder: 2 },
];

function request(body: unknown) {
  return new Request("http://localhost/api/storefront/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("storefront checkout endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
    } as never);
    vi.mocked(listPublishedProducts).mockResolvedValue([product] as never);
    vi.mocked(getProductAddons).mockResolvedValue(addons as never);
    vi.mocked(createCheckout).mockImplementation(async ({ addonIds = [] }) => ({
      orderId,
      orderNumber: "DFP-TEST-0001",
      status: "AWAITING_PAYMENT",
      subtotal: 19000,
      addonTotal: addonIds.length === 0 ? 0 : addonIds.includes(inventoryId) ? 34000 : 19000,
      total: addonIds.length === 0 ? 19000 : addonIds.includes(inventoryId) ? 53000 : 38000,
    }));
    vi.mocked(getOrder).mockResolvedValue({
      id: orderId,
      orderNumber: "DFP-TEST-0001",
      customerUserId: userId,
      status: "AWAITING_PAYMENT",
      subtotal: 19000,
      addonTotal: 0,
      total: 19000,
      createdAt: "2026-10-04T00:00:00.000Z",
      paidAt: null,
      items: [{
        id: "66666666-6666-4666-8666-666666666666", orderId, productId, skuSnapshot: product.sku,
        titleSnapshot: product.title, priceSnapshot: 19000, itemType: "CORE", addonProductId: null,
        quantity: 1, createdAt: "2026-10-04T00:00:00.000Z",
      }],
    } as never);
  });

  it("rejects anonymous checkout", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const response = await POST(request({ productId, addonIds: [], idempotencyKey: "checkout-test-01" }));

    expect(response.status).toBe(401);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it.each([
    { addonIds: [], total: 19000 },
    { addonIds: [bookId], total: 38000 },
    { addonIds: [bookId, inventoryId], total: 53000 },
  ])("returns the canonical Commerce total $total", async ({ addonIds, total }) => {
    vi.mocked(createCheckout).mockResolvedValueOnce({
      orderId, orderNumber: "DFP-TEST-0001", status: "AWAITING_PAYMENT",
      subtotal: 19000, addonTotal: total - 19000, total,
    });

    const response = await POST(request({ productId: product.slug, addonIds, idempotencyKey: "checkout-test-01" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ order: { id: orderId, total, status: "AWAITING_PAYMENT" } });
    expect(createCheckout).toHaveBeenCalledWith({ productId, addonIds, idempotencyKey: "checkout-test-01" });
    expect(vi.mocked(createCheckout).mock.calls[0][0]).not.toHaveProperty("price");
  });

  it("rejects browser-supplied price instead of using it as transaction input", async () => {
    const response = await POST(request({ productId, addonIds: [], idempotencyKey: "checkout-test-01", price: 1 }));

    expect(response.status).toBe(400);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("rejects unpublished or unknown products", async () => {
    vi.mocked(listPublishedProducts).mockResolvedValue([]);
    const response = await POST(request({ productId, addonIds: [], idempotencyKey: "checkout-test-01" }));
    expect(response.status).toBe(422);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("rejects disabled, unknown, or wrong-parent add-ons", async () => {
    vi.mocked(getProductAddons).mockResolvedValue([{ ...addons[0], active: false, productId: "77777777-7777-4777-8777-777777777777" }] as never);
    const response = await POST(request({ productId, addonIds: [bookId], idempotencyKey: "checkout-test-01" }));
    expect(response.status).toBe(422);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("rejects cross-niche linked add-on products", async () => {
    vi.mocked(getProductAddons).mockResolvedValue([{ ...addons[0], addonProductId: "88888888-8888-4888-8888-888888888888" }] as never);
    vi.mocked(listPublishedProducts).mockResolvedValue([
      product,
      { ...product, id: "88888888-8888-4888-8888-888888888888", niche: "Laundry" },
    ] as never);
    const response = await POST(request({ productId, addonIds: [bookId], idempotencyKey: "checkout-test-01" }));
    expect(response.status).toBe(422);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("reuses the Commerce idempotency key for a repeated checkout request", async () => {
    const body = { productId, addonIds: [bookId], idempotencyKey: "checkout-test-01" };
    const first = await POST(request(body));
    const second = await POST(request(body));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(createCheckout).toHaveBeenCalledTimes(2);
    expect(createCheckout).toHaveBeenLastCalledWith({ productId, addonIds: [bookId], idempotencyKey: body.idempotencyKey });
  });
});