import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getServiceRoleClient: vi.fn(),
  getActiveEntitlementIds: vi.fn(),
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
vi.mock("./entitlements", () => ({ getActiveEntitlementIds: mocks.getActiveEntitlementIds }));

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
  vi.stubEnv("DPF_ENABLE_TEST_PAYMENTS", "true");
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

  it("does not return an order when the caller-supplied user differs from auth", async () => {
    const userClient = makeUserClient();
    userClient.client.auth.getUser.mockResolvedValue({ data: { user: { id: "99999999-9999-4999-8999-999999999999" } } });
    mocks.createClient.mockResolvedValue(userClient.client);
    await expect(getOrder(mocks.order.id, mocks.user.id)).resolves.toBeNull();
    expect(userClient.client.from).not.toHaveBeenCalled();
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
    mocks.getActiveEntitlementIds.mockResolvedValue([]);
    const result = await getProductDownloadAccess(mocks.user.id, mocks.order.id);
    expect(result).toEqual({ allowed: false, reason: "NOT_ENTITLED" });
    expect(mocks.getServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns only a short-lived signed URL after entitlement validation", async () => {
    mocks.getActiveEntitlementIds.mockResolvedValue(["44444444-4444-4444-8444-444444444444"]);
    const sign = vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.test/signed" }, error: null });
    const assetQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({
        data: [{ storage_bucket: "dpf-delivery-v1", storage_key: "product/file.xlsx", file_name: "file.xlsx", signed_url_expiry_seconds: 180 }],
        error: null,
      }),
    };
    mocks.getServiceRoleClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(assetQuery),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl: sign }) },
    });
    const result = await getProductDownloadAccess(mocks.user.id, mocks.order.id);
    expect(result).toEqual({ allowed: true, assetUrls: ["https://storage.test/signed"] });
    expect(assetQuery.or).toHaveBeenCalledWith("entitlement_id.is.null,entitlement_id.in.(44444444-4444-4444-8444-444444444444)");
    expect(sign).toHaveBeenCalledWith("product/file.xlsx", 180, { download: "file.xlsx" });
    expect(JSON.stringify(result)).not.toContain("product/file.xlsx");
  });
});