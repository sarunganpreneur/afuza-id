import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/server/worker/auth", () => ({
  AUTH_RESULT: {
    AUTHORIZED: "AUTHORIZED",
    UNAUTHORIZED: "UNAUTHORIZED",
    MISCONFIGURED: "MISCONFIGURED",
  },
  authenticateWorkerRequest: vi.fn(),
}));

const siteId = "61c79c23-690a-4f5d-8eca-4d3588362c7c";
const jobId = "03137715-b9f0-41eb-8072-9e0135de32a8";
const requestId = "section-0-hero";
const storagePath =
  `sites/${siteId}/generation-jobs/${jobId}/attempt-0/${requestId}.webp`;
const publicUrl = `https://storage.example.test/${storagePath}`;

function request(
  body: unknown,
  options: { authorization?: string; raw?: string } = {},
): Request {
  return new Request(
    "http://localhost/api/internal/generation/images/upload",
    {
      method: "POST",
      headers: {
        ...(options.authorization
          ? { authorization: options.authorization }
          : {}),
        "content-type": "application/json",
      },
      body: options.raw ?? JSON.stringify(body),
    },
  );
}

function validPayload() {
  return {
    siteId,
    generationJobId: jobId,
    requestId,
    retryCount: 0,
    mimeType: "image/webp",
    bytesBase64: Buffer.from([1, 2, 3]).toString("base64"),
  };
}

function mockClient({
  job = {
    id: jobId,
    site_id: siteId,
    status: "GENERATING_IMAGES",
  },
  jobError = null,
  uploadError = null,
  downloadData = new Blob([new Uint8Array([1, 2, 3])], {
    type: "image/webp",
  }),
  downloadError = null,
}: {
  job?: unknown;
  jobError?: { code?: string; message?: string } | null;
  uploadError?: { statusCode?: string; message?: string } | null;
  downloadData?: Blob | null;
  downloadError?: { statusCode?: string; message?: string } | null;
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: job,
    error: jobError,
  });

  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  const upload = vi.fn().mockResolvedValue({
    data: uploadError ? null : { path: storagePath },
    error: uploadError,
  });

  const download = vi.fn().mockResolvedValue({
    data: downloadData,
    error: downloadError,
  });

  const getPublicUrl = vi.fn().mockReturnValue({
    data: { publicUrl },
  });

  const bucket = {
    upload,
    download,
    getPublicUrl,
  };

  const storageFrom = vi.fn().mockReturnValue(bucket);

  vi.mocked(getServiceRoleClient).mockResolvedValue({
    from,
    storage: {
      from: storageFrom,
    },
  } as never);

  return {
    from,
    select,
    eq,
    maybeSingle,
    storageFrom,
    upload,
    download,
    getPublicUrl,
  };
}

describe("generation image upload endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateWorkerRequest).mockReturnValue({
      status: AUTH_RESULT.AUTHORIZED,
    });
  });

  it("rejects missing authorization", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({
      status: AUTH_RESULT.UNAUTHORIZED,
      reason: "missing-header",
    });

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request({}, { raw: "not-json" }));

    expect(response.status).toBe(400);
  });

  it("rejects unknown envelope fields", async () => {
    const response = await POST(
      request({
        ...validPayload(),
        storagePath: "worker-must-not-control-this",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid identifiers", async () => {
    const response = await POST(
      request({
        ...validPayload(),
        requestId: "../unsafe",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects unsupported image MIME types", async () => {
    const response = await POST(
      request({
        ...validPayload(),
        mimeType: "image/gif",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects an empty image payload", async () => {
    const response = await POST(
      request({
        ...validPayload(),
        bytesBase64: "",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects malformed base64 image data", async () => {
    const response = await POST(
      request({
        ...validPayload(),
        bytesBase64: "%%%not-base64%%%",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects decoded images larger than 10 MiB", async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 1).toString("base64");

    const response = await POST(
      request({
        ...validPayload(),
        bytesBase64: oversized,
      }),
    );

    expect(response.status).toBe(413);
  });

  it("rejects jobs outside GENERATING_IMAGES", async () => {
    const client = mockClient({
      job: {
        id: jobId,
        site_id: siteId,
        status: "GENERATING_CONTENT",
      },
    });

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(409);
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("rejects a site and generation job mismatch", async () => {
    const client = mockClient({
      job: {
        id: jobId,
        site_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "GENERATING_IMAGES",
      },
    });

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(409);
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("stores the image using the deterministic server-side path", async () => {
    const client = mockClient();

    const response = await POST(
      request(validPayload(), {
        authorization: "Bearer valid",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      storagePath,
      publicUrl,
      mimeType: "image/webp",
    });

    expect(client.storageFrom).toHaveBeenCalledWith("site-assets");

    expect(client.upload).toHaveBeenCalledWith(
      storagePath,
      expect.any(Blob),
      {
        contentType: "image/webp",
        upsert: false,
      },
    );
  });

  it("treats an identical existing object as an idempotent replay success", async () => {
    const client = mockClient({
      uploadError: {
        statusCode: "409",
        message: "The resource already exists",
      },
      downloadData: new Blob([new Uint8Array([1, 2, 3])], {
        type: "image/webp",
      }),
    });

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      storagePath,
      publicUrl,
      mimeType: "image/webp",
    });

    expect(client.download).toHaveBeenCalledWith(storagePath);
  });

  it("keeps a same-path collision as conflict when existing bytes differ", async () => {
    const client = mockClient({
      uploadError: {
        statusCode: "409",
        message: "The resource already exists",
      },
      downloadData: new Blob([new Uint8Array([9, 9, 9])], {
        type: "image/webp",
      }),
    });

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(409);
    expect(client.download).toHaveBeenCalledWith(storagePath);
  });

  it("keeps a storage collision as conflict when the exact object cannot be found", async () => {
    const client = mockClient({
      uploadError: {
        statusCode: "409",
        message: "The resource already exists",
      },
      downloadData: null,
      downloadError: {
        statusCode: "404",
        message: "Object not found",
      },
    });

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(409);
    expect(client.download).toHaveBeenCalledWith(storagePath);
  });

  it("hides storage failures from the response", async () => {
    const secret = "storage-secret-must-not-leak";

    mockClient({
      uploadError: {
        statusCode: "500",
        message: secret,
      },
    });

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
  });

  it("returns a safe failure when the service role is unavailable", async () => {
    vi.mocked(getServiceRoleClient).mockResolvedValue(null);

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(503);
  });
});
