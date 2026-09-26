import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAfuzaGeneratedImageHttpStorageV1 } from "./http-storage";

const baseUrl = "http://127.0.0.1:4100";
const workerSecret = "worker-secret";
const siteId = "61c79c23-690a-4f5d-8eca-4d3588362c7c";
const jobId = "03137715-b9f0-41eb-8072-9e0135de32a8";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("AFUZA generated image HTTP storage", () => {
  const fetchImpl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function storage() {
    return createAfuzaGeneratedImageHttpStorageV1({
      baseUrl,
      workerSecret,
      fetchImpl,
    });
  }

  function input() {
    return {
      siteId,
      generationJobId: jobId,
      requestId: "section-0-hero",
      retryCount: 0,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/webp" as const,
      overwrite: false as const,
    };
  }

  it("uploads generated image through the AFUZA image boundary", async () => {
    const storagePath =
      `sites/${siteId}/generation-jobs/${jobId}/attempt-0/section-0-hero.webp`;

    const publicUrl =
      `https://storage.example.test/${storagePath}`;

    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        storagePath,
        publicUrl,
        mimeType: "image/webp",
      }),
    );

    const result = await storage().storeGeneratedImage(input());

    expect(result).toEqual({
      storagePath,
      publicUrl,
      mimeType: "image/webp",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${baseUrl}/api/internal/generation/images/upload`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: `Bearer ${workerSecret}`,
          "content-type": "application/json",
        }),
      }),
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];

    expect(JSON.parse(String(init.body))).toEqual({
      siteId,
      generationJobId: jobId,
      requestId: "section-0-hero",
      retryCount: 0,
      mimeType: "image/webp",
      bytesBase64: Buffer.from([1, 2, 3]).toString("base64"),
    });
  });

  it("accepts idempotent replay success returned by the AFUZA boundary", async () => {
    const storagePath =
      `sites/${siteId}/generation-jobs/${jobId}/attempt-0/section-0-hero.webp`;

    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        storagePath,
        publicUrl: `https://storage.example.test/${storagePath}`,
        mimeType: "image/webp",
      }),
    );

    await expect(
      storage().storeGeneratedImage(input()),
    ).resolves.toMatchObject({
      storagePath,
      mimeType: "image/webp",
    });
  });

  it("sanitizes boundary errors without leaking response payload", async () => {
    const secret = "storage-secret-must-not-leak";

    fetchImpl.mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          code: "GENERATION_IMAGE_STORAGE_CONFLICT",
          internal: secret,
        },
        409,
      ),
    );

    await expect(
      storage().storeGeneratedImage(input()),
    ).rejects.toThrow(
      "IMAGE_STORAGE_UPLOAD_FAILED:GENERATION_IMAGE_STORAGE_CONFLICT",
    );

    try {
      await storage().storeGeneratedImage(input());
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("rejects malformed success responses", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        storagePath: "missing-other-required-fields",
      }),
    );

    await expect(
      storage().storeGeneratedImage(input()),
    ).rejects.toThrow(
      "IMAGE_STORAGE_UPLOAD_FAILED:INVALID_GENERATION_IMAGE_RESPONSE",
    );
  });

  it("surfaces network failure as a stable storage error", async () => {
    fetchImpl.mockRejectedValueOnce(
      new Error("network-secret-must-not-leak"),
    );

    await expect(
      storage().storeGeneratedImage(input()),
    ).rejects.toThrow(
      "IMAGE_STORAGE_UPLOAD_FAILED:GENERATION_IMAGE_BOUNDARY_UNAVAILABLE",
    );
  });
});
