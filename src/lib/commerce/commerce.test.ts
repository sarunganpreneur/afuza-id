import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DPF_COMMERCE_FIXTURE_V1 } from "./fixture";
import { getEnabledTestPaymentAdapter, createTestPaymentAdapter } from "./payment-adapter";
import { calculateCheckoutPrice } from "./pricing";

const fixture = DPF_COMMERCE_FIXTURE_V1;
const product = { id: fixture.product.id, status: fixture.product.status, price: fixture.product.price };
const addons = fixture.addons.map((addon) => ({
  id: addon.id,
  productId: fixture.product.id,
  active: addon.active,
  price: addon.price,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DPF commerce V1", () => {
  it("calculates the canonical fixture totals from server-side prices", () => {
    expect(calculateCheckoutPrice({ product, addons })).toEqual({ subtotal: 19000, addonTotal: 0, total: 19000 });
    expect(calculateCheckoutPrice({ product, addons, selectedAddonIds: [addons[0].id] })).toEqual({ subtotal: 19000, addonTotal: 19000, total: 38000 });
    expect(calculateCheckoutPrice({ product, addons, selectedAddonIds: addons.map((addon) => addon.id) })).toEqual({ subtotal: 19000, addonTotal: 34000, total: 53000 });
  });

  it("rejects unpublished, under-minimum, duplicate, and unrelated add-on selections", () => {
    expect(() => calculateCheckoutPrice({ product: { ...product, status: "DRAFT" }, addons })).toThrow("PRODUCT_UNAVAILABLE");
    expect(() => calculateCheckoutPrice({ product: { ...product, price: 9999 }, addons })).toThrow("INVALID_PRODUCT_PRICE");
    expect(() => calculateCheckoutPrice({ product, addons, selectedAddonIds: [addons[0].id, addons[0].id] })).toThrow("DUPLICATE_ADDON");
    expect(() => calculateCheckoutPrice({ product, addons: [{ ...addons[0], productId: "other-product" }], selectedAddonIds: [addons[0].id] })).toThrow("ADDON_UNAVAILABLE");
    expect(() => calculateCheckoutPrice({ product, addons: [{ ...addons[0], active: false }], selectedAddonIds: [addons[0].id] })).toThrow("ADDON_UNAVAILABLE");
  });

  it("accepts only well-formed simulated payment events", async () => {
    const adapter = createTestPaymentAdapter();
    const intent = await adapter.createPayment({ orderId: "d0f00000-0000-4000-8000-000000000001", amount: 19000 });
    expect(intent.providerReference).toBe("test-d0f00000-0000-4000-8000-000000000001");
    expect(await adapter.verifyPaymentEvent({
      provider: "test", providerReference: intent.providerReference, amount: 19000, currency: "IDR",
      status: "PAID", signature: `test-signature:${intent.providerReference}:19000`,
    })).toMatchObject({ provider: "test", status: "PAID", amount: 19000 });
    expect(await adapter.verifyPaymentEvent({
      provider: "test", providerReference: intent.providerReference, amount: 19000, currency: "IDR",
      status: "PAID", signature: "forged",
    })).toBeNull();
  });

  it("keeps the test payment adapter disabled unless explicitly enabled outside production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DPF_ENABLE_TEST_PAYMENTS", "true");
    expect(getEnabledTestPaymentAdapter()).toBeNull();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DPF_ENABLE_TEST_PAYMENTS", "false");
    expect(getEnabledTestPaymentAdapter()).toBeNull();
    vi.stubEnv("DPF_ENABLE_TEST_PAYMENTS", "true");
    expect(getEnabledTestPaymentAdapter()?.provider).toBe("test");
  });

  it("keeps payment confirmation privileged and entitlements behind paid status in SQL", () => {
    const migration = readFileSync(new URL("../../../supabase/migrations/20261004_dpf_commerce_v1.sql", import.meta.url), "utf8");
    expect(migration).toMatch(/price integer not null check \(price >= 10000\)/);
    expect(migration).toMatch(/unique \(customer_user_id, checkout_idempotency_key\)/);
    expect(migration).toMatch(/revoke all on function public\.dpf_record_payment\([^;]+ from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.dpf_record_payment\([^;]+ to service_role;/);
    expect(migration).toMatch(/if p_status = 'PAID' then[\s\S]*?insert into public\.dpf_customer_entitlements/);
    expect(migration).toMatch(/customer_user_id = \(select auth\.uid\(\)\)/);
    expect(migration).toMatch(/unique \(order_item_id\)/);
    expect(migration).toMatch(/on conflict \(order_item_id\) do nothing/);
    expect(migration).not.toMatch(/unique \(user_id, product_id\)/);
    expect(migration).toMatch(/dpf_products_entitled_read/);
    expect(migration).not.toMatch(/delivery_assets text\[\]/);
    expect(migration).toMatch(/order by a\.id for share/);
    expect(migration).toMatch(/coalesce\(v_addons\.addon_product_id, v_product\.id\)/);
    expect(migration).toMatch(/values \('dpf-delivery-v1', 'dpf-delivery-v1', false\)/);
  });
});