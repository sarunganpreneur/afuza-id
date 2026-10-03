import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  mapProduct: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./catalog", () => ({ mapProduct: mocks.mapProduct }));

import { getMyProducts } from "./entitlements";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "99999999-9999-4999-8999-999999999999";

function installClient(authenticatedUserId: string | null) {
  const entitlementQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  };
  vi.mocked(entitlementQuery.eq).mockReturnValueOnce(entitlementQuery as never);
  vi.mocked(entitlementQuery.eq).mockResolvedValueOnce({
    data: [{ product_id: "22222222-2222-4222-8222-222222222222" }],
    error: null,
  } as never);
  const productQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [{ id: "22222222-2222-4222-8222-222222222222" }], error: null }),
  };
  const from = vi.fn((table: string) => table === "customer_entitlements" ? entitlementQuery : productQuery);
  mocks.createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: authenticatedUserId ? { id: authenticatedUserId } : null } }) },
    from,
  });
  return { from };
}

describe("customer entitlement reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mapProduct.mockReturnValue({ id: "22222222-2222-4222-8222-222222222222", title: "Kalkulator HPP" });
  });

  it("returns active entitled products for the authenticated purchaser", async () => {
    const { from } = installClient(userId);
    await expect(getMyProducts(userId)).resolves.toEqual([
      { id: "22222222-2222-4222-8222-222222222222", title: "Kalkulator HPP" },
    ]);
    expect(from).toHaveBeenCalledWith("customer_entitlements");
    expect(from).toHaveBeenCalledWith("products");
  });

  it("does not read or return another user's entitlements", async () => {
    const { from } = installClient(userId);
    await expect(getMyProducts(otherUserId)).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns no products for an anonymous caller", async () => {
    const { from } = installClient(null);
    await expect(getMyProducts(userId)).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});
