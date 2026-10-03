import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/commerce/delivery", () => ({ getProductDownloadAccess: vi.fn() }));

import { getProductDownloadAccess } from "@/lib/commerce/delivery";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

const productId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";

function request() {
  return new Request("http://localhost/api/storefront/delivery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId }),
  });
}

describe("storefront secure delivery endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
    } as never);
  });

  it("returns signed access for an authorized purchaser without storage paths", async () => {
    vi.mocked(getProductDownloadAccess).mockResolvedValue({
      allowed: true,
      assetUrls: ["https://storage.example/signed/private-token"],
    });

    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ assetUrls: ["https://storage.example/signed/private-token"] });
    expect(getProductDownloadAccess).toHaveBeenCalledWith(userId, productId);
    expect(JSON.stringify(body)).not.toContain("storage_key");
    expect(JSON.stringify(body)).not.toContain("private/");
  });

  it("denies unauthorized users without revealing whether access exists", async () => {
    vi.mocked(getProductDownloadAccess).mockResolvedValue({ allowed: false, reason: "NOT_ENTITLED" });
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Akses produk tidak tersedia." });
  });

  it("handles a missing delivery asset safely", async () => {
    vi.mocked(getProductDownloadAccess).mockResolvedValue({ allowed: false, reason: "NO_DELIVERY_ASSETS" });
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("storage");
  });

  it("returns a safe service failure without leaking internal paths", async () => {
    vi.mocked(getProductDownloadAccess).mockResolvedValue({ allowed: false, reason: "DELIVERY_UNAVAILABLE" });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("storage_key");
  });
});