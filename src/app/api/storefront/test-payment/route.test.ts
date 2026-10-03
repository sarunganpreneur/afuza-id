import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/commerce/checkout", () => ({ getOrder: vi.fn() }));
vi.mock("@/lib/commerce/payments", () => ({ startTestPayment: vi.fn(), confirmPayment: vi.fn() }));

import { getOrder } from "@/lib/commerce/checkout";
import { confirmPayment, startTestPayment } from "@/lib/commerce/payments";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

const orderId = "55555555-5555-4555-8555-555555555555";
const userId = "11111111-1111-4111-8111-111111111111";
const order = {
  id: orderId, orderNumber: "DFP-TEST-0001", customerUserId: userId, status: "AWAITING_PAYMENT",
  subtotal: 19000, addonTotal: 0, total: 19000, createdAt: "2026-10-04T00:00:00.000Z", paidAt: null, items: [],
};

function request() {
  return new Request("http://localhost/api/storefront/test-payment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
}

describe("storefront TEST payment endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DPF_ENABLE_TEST_PAYMENTS", "true");
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
    } as never);
    vi.mocked(getOrder).mockResolvedValue(order as never);
    vi.mocked(startTestPayment).mockResolvedValue({
      provider: "test", providerReference: `test-${orderId}`, amount: 19000, currency: "IDR", status: "PENDING",
    });
    vi.mocked(confirmPayment).mockResolvedValue({ ok: true, orderId, status: "PAID" });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires authentication", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(startTestPayment).not.toHaveBeenCalled();
  });

  it("confirms the authenticated owner's TEST payment through Commerce services", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orderId, status: "PAID", replayed: false });
    expect(startTestPayment).toHaveBeenCalledWith(orderId);
    expect(confirmPayment).toHaveBeenCalledWith({
      provider: "test",
      event: expect.objectContaining({ providerReference: `test-${orderId}`, amount: 19000, status: "PAID" }),
    });
  });

  it("does not disclose or pay another user's order", async () => {
    vi.mocked(getOrder).mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Pesanan tidak tersedia." });
    expect(startTestPayment).not.toHaveBeenCalled();
  });

  it("returns a stable replay result for an already-paid order", async () => {
    vi.mocked(getOrder).mockResolvedValue({ ...order, status: "PAID" } as never);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orderId, status: "PAID", replayed: true });
    expect(startTestPayment).not.toHaveBeenCalled();
    expect(confirmPayment).not.toHaveBeenCalled();
  });

  it("cannot expose TEST payment in production even when its flag is enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(startTestPayment).not.toHaveBeenCalled();
  });
});