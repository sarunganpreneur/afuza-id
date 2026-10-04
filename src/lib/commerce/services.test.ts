import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getServiceRoleClient: vi.fn(),
  getActiveEntitlements: vi.fn(),
  serviceRpc: vi.fn(),
  user: { id: "11111111-1111-4111-8111-111111111111" },
  order: {
    id: "d0f00000-0000-4000-8000-000000000001",
    order_number: "DFP-ABC123",
    customer_user_id: "11111111-1111-4111-8111-111111111111",
    status: "AWAITING_PAYMENT",
    subtotal: 19000,
    addon_total: 19000,
    total: 38000,
    created_at: "2026-10-04T00:00:00.000Z",
    paid_at: null,
  },
  orderItem: {
    id: "22222222-2222-4222-8222-222222222222",
    order_id: "d0f00000-0000-4000-8000-000000000001",
    product_id: "d0f00000-0000-4000-8000-000000000001",
    sku_snapshot: "AFZ-SPR-HPP-001",
    title_snapshot: "Kalkulator HPP & Harga Jual UMKM",
    price_snapshot: 19000,
    item_type: "CORE",
    quantity: 1,
    created_at: "2026-10-04T00:00:00.000Z",
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: mocks.getServiceRoleClient }));
vi.mock("./entitlements", () => ({ getActiveEntitlements: mocks.getActiveEntitlements }));

import { createCheckout, getOrder } from "./checkout";
import { getProductDownloadAccess } from "./delivery";
import { confirmPayment, startTestPayment } from "./payments";

function makeUserClient() {
  const rpc = vi.fn().mockResolvedValue({
    data: { orderId: mocks.order.id, orderNumber: mocks.order.order_number, status: "AWAITING_PAYMENT", subtotal: 19000, addonTotal: 19000, total: 38000 },
    error: null,
  });
  let queryCount = 0;
  const orderQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: mocks.order, error: null }),
  };
  const itemQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [mocks.orderItem], error: null }),
  };
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mocks.user } }) },
    rpc,
    from: vi.fn(() => (queryCount++ === 0 ? orderQuery : itemQuery)),
  };
  return { client, rpc, orderQuery, itemQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AFUZA_RUNTIME_ENV", "test");
  vi.stubEnv("DPF_TEST_PAYMENT_ENABLED", "true");
  const userClient = makeUserClient();
  mocks.createClient.mockResolvedValue(userClient.client);
  const serviceRpc = vi.fn().mockResolvedValue({ data: { ok: true, orderId: mocks.order.id, status: "PAID" }, error: null });
  mocks.getServiceRoleClient.mockResolvedValue({ rpc: serviceRpc });
  mocks.serviceRpc = serviceRpc;
});

describe("commerce service boundaries", () => {
  it("creates checkout using only server-recalculated inputs and the authenticated session", async () => {
    const result = await createCheckout({
      productId: mocks.order.id,
      addonIds: ["33333333-3333-4333-8333-333333333333"],
      quantity: 1,
      idempotencyKey: "checkout-12345678",
    });
    expect(result.total).toBe(38000);
    const client = await mocks.createClient.mock.results[0].value;
    expect(client.rpc).toHaveBeenCalledWith("dpf_create_checkout", {
      p_product_id: mocks.order.id,
      p_addon_ids: ["33333333-3333-4333-8333-333333333333"],
      p_quantity: 1,
      p_idempotency_key: "checkout-12345678",
    });
    expect(client.rpc.mock.calls[0][1]).not.toHaveProperty("price");
  });

  it("returns an explicit error code for cross-niche product add-ons rejected by the checkout RPC", async () => {
    const userClient = makeUserClient();
    userClient.rpc.mockResolvedValue({
      data: null,
      error: { message: "Add-on product must match the core product niche" },
    });
    mocks.createClient.mockResolvedValue(userClient.client);
    await expect(createCheckout({
      productId: mocks.order.id,
      addonIds: ["33333333-3333-4333-8333-333333333333"],
      idempotencyKey: "checkout-niche-123",
    })).rejects.toThrow("ADDON_NICHE_MISMATCH");
  });

  it("does not return an order when the caller-supplied user differs from auth", async () => {
    const userClient = makeUserClient();
    userClient.client.auth.getUser.mockResolvedValue({ data: { user: { id: "99999999-9999-4999-8999-999999999999" } } });
    mocks.createClient.mockResolvedValue(userClient.client);
    await expect(getOrder(mocks.order.id, mocks.user.id)).resolves.toBeNull();
    expect(userClient.client.from).not.toHaveBeenCalled();
  });

  it("returns the canonical order to its authenticated purchaser", async () => {
    const result = await getOrder(mocks.order.id, mocks.user.id);
    expect(result).toMatchObject({
      id: mocks.order.id,
      customerUserId: mocks.user.id,
      status: "AWAITING_PAYMENT",
      total: 38000,
      items: [{ titleSnapshot: "Kalkulator HPP & Harga Jual UMKM", priceSnapshot: 19000 }],
    });
  });

  it("reads DPF orders through the FK-backed DPF add-on PostgREST relation", async () => {
    const userClient = makeUserClient();
    userClient.itemQuery.order.mockResolvedValue({
      data: [{
        ...mocks.orderItem,
        item_type: "ADD_ON",
        addon_id: "33333333-3333-4333-8333-333333333333",
        dpf_product_addons: { addon_product_id: "55555555-5555-4555-8555-555555555555" },
      }],
      error: null,
    });
    mocks.createClient.mockResolvedValue(userClient.client);

    const result = await getOrder(mocks.order.id, mocks.user.id);

    expect(userClient.client.from).toHaveBeenNthCalledWith(1, "dpf_orders");
    expect(userClient.client.from).toHaveBeenNthCalledWith(2, "dpf_order_items");
    expect(userClient.itemQuery.select).toHaveBeenCalledWith("*, dpf_product_addons(addon_product_id)");
    expect(result?.items[0].addonProductId).toBe("55555555-5555-4555-8555-555555555555");
  });

  it("records a simulated payment only for an authenticated owner's order", async () => {
    const intent = await startTestPayment(mocks.order.id);
    expect(intent).toMatchObject({ provider: "test", amount: 38000, status: "PENDING" });
    expect(mocks.serviceRpc).toHaveBeenCalledWith("dpf_record_payment", expect.objectContaining({
      p_order_id: mocks.order.id,
      p_provider: "test",
      p_amount: 38000,
      p_status: "PENDING",
    }));
  });

  it("denies TEST payment service calls in production despite an enabled flag", async () => {
    vi.stubEnv("AFUZA_RUNTIME_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DPF_TEST_PAYMENT_ENABLED", "true");

    await expect(startTestPayment(mocks.order.id)).rejects.toThrow("TEST_PAYMENT_DISABLED");
    await expect(confirmPayment({ provider: "test", event: {} })).rejects.toThrow("TEST_PAYMENT_DISABLED");
    expect(mocks.getServiceRoleClient).not.toHaveBeenCalled();
  });

  it("rejects forged payment callbacks before privileged database access", async () => {
    await expect(confirmPayment({
      provider: "test",
      event: { provider: "test", providerReference: `test-${mocks.order.id}`, amount: 38000, currency: "IDR", status: "PAID", signature: "forged" },
    })).rejects.toThrow("PAYMENT_EVENT_INVALID");
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it("sends only verified paid callbacks to the privileged atomic payment RPC", async () => {
    const providerReference = `test-${mocks.order.id}`;
    const result = await confirmPayment({
      provider: "test",
      event: { provider: "test", providerReference, amount: 38000, currency: "IDR", status: "PAID", signature: `test-signature:${providerReference}:38000` },
    });
    expect(result).toMatchObject({ ok: true, status: "PAID" });
    expect(mocks.serviceRpc).toHaveBeenCalledWith("dpf_record_payment", expect.objectContaining({
      p_order_id: mocks.order.id,
      p_provider_reference: providerReference,
      p_status: "PAID",
      p_amount: 38000,
    }));
  });

  it("does not access storage when the user has no active entitlement", async () => {
    mocks.getActiveEntitlements.mockResolvedValue([]);
    const result = await getProductDownloadAccess(mocks.user.id, mocks.order.id);
    expect(result).toEqual({ allowed: false, reason: "NOT_ENTITLED" });
    expect(mocks.getServiceRoleClient).not.toHaveBeenCalled();
  });

  it("fails safely when an entitled product has no provisioned delivery asset", async () => {
    mocks.getActiveEntitlements.mockResolvedValue([{ id: "ent-core", addonId: null }]);
    mocks.getServiceRoleClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    await expect(getProductDownloadAccess(mocks.user.id, mocks.order.id)).resolves.toEqual({
      allowed: false,
      reason: "NO_DELIVERY_ASSETS",
    });
  });

  it("allows core assets for a core purchase but denies fallback add-on assets", async () => {
    mocks.getActiveEntitlements.mockResolvedValue([{ id: "ent-core", addonId: null }]);
    const sign = vi.fn(async (key: string) => ({ data: { signedUrl: `https://storage.test/signed/${key.split("/").pop()}` }, error: null }));
    mocks.getServiceRoleClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [
          { storage_bucket: "dpf-delivery-v1", storage_key: "core/private.xlsx", file_name: "core.xlsx", signed_url_expiry_seconds: 180, addon_id: null },
          { storage_bucket: "dpf-delivery-v1", storage_key: "addon-a/private.xlsx", file_name: "addon-a.xlsx", signed_url_expiry_seconds: 180, addon_id: "addon-a" },
        ], error: null }),
      }),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl: sign }) },
    });
    const result = await getProductDownloadAccess(mocks.user.id, mocks.order.id);
    expect(result).toEqual({ allowed: true, assetUrls: ["https://storage.test/signed/private.xlsx"] });
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith("core/private.xlsx", 180, { download: "core.xlsx" });
    expect(JSON.stringify(result)).not.toContain("storage_key");
    expect(JSON.stringify(result)).not.toContain("addon-a/private.xlsx");
  });

  it("allows core and purchased add-on A while denying unpurchased add-on B", async () => {
    mocks.getActiveEntitlements.mockResolvedValue([
      { id: "ent-core", addonId: null },
      { id: "ent-addon-a", addonId: "addon-a" },
    ]);
    const sign = vi.fn(async (key: string) => ({ data: { signedUrl: `https://storage.test/signed/${key.split("/").pop()}` }, error: null }));
    mocks.getServiceRoleClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [
          { storage_bucket: "dpf-delivery-v1", storage_key: "core/core.xlsx", file_name: "core.xlsx", signed_url_expiry_seconds: 180, addon_id: null },
          { storage_bucket: "dpf-delivery-v1", storage_key: "addon-a/a.xlsx", file_name: "a.xlsx", signed_url_expiry_seconds: 180, addon_id: "addon-a" },
          { storage_bucket: "dpf-delivery-v1", storage_key: "addon-b/b.xlsx", file_name: "b.xlsx", signed_url_expiry_seconds: 180, addon_id: "addon-b" },
        ], error: null }),
      }),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl: sign }) },
    });
    const result = await getProductDownloadAccess(mocks.user.id, mocks.order.id);
    expect(result).toEqual({ allowed: true, assetUrls: [
      "https://storage.test/signed/core.xlsx",
      "https://storage.test/signed/a.xlsx",
    ] });
    expect(sign).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("addon-b/b.xlsx");
  });

  it("denies user B access to user A entitlement-bound assets", async () => {
    mocks.getActiveEntitlements.mockResolvedValue([]);
    const result = await getProductDownloadAccess("99999999-9999-4999-8999-999999999999", mocks.order.id);
    expect(result).toEqual({ allowed: false, reason: "NOT_ENTITLED" });
    expect(mocks.getServiceRoleClient).not.toHaveBeenCalled();
  });
});