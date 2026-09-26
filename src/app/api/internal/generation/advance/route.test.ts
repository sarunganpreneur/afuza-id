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

const jobId = "03137715-b9f0-41eb-8072-9e0135de32a8";

function request(
  body: unknown,
  options: { authorization?: string; raw?: string } = {},
): Request {
  return new Request("http://localhost/api/internal/generation/advance", {
    method: "POST",
    headers: {
      ...(options.authorization
        ? { authorization: options.authorization }
        : {}),
      "content-type": "application/json",
    },
    body: options.raw ?? JSON.stringify(body),
  });
}

function mockClient({
  rpcData = null,
  rpcError = null,
}: {
  rpcData?: unknown;
  rpcError?: { code?: string; message?: string } | null;
} = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: rpcData,
    error: rpcError,
  });

  vi.mocked(getServiceRoleClient).mockResolvedValue({ rpc } as never);

  return { rpc };
}

function validPayload() {
  return {
    jobId,
    expectedStatus: "GENERATING_CONTENT",
    nextStatus: "GENERATING_IMAGES",
  };
}

describe("generation advance endpoint", () => {
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
      request({ ...validPayload(), siteId: "not-accepted" }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid job ids", async () => {
    const response = await POST(
      request({ ...validPayload(), jobId: "not-a-uuid" }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects lifecycle transitions outside the Generation V1 machine boundary", async () => {
    const client = mockClient();

    const response = await POST(
      request({
        jobId,
        expectedStatus: "RENDERING",
        nextStatus: "VALIDATING",
      }),
    );

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("advances GENERATING_CONTENT to GENERATING_IMAGES", async () => {
    const client = mockClient();

    const response = await POST(
      request(validPayload(), { authorization: "Bearer valid" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      jobId,
      status: "GENERATING_IMAGES",
    });

    expect(client.rpc).toHaveBeenCalledWith("advance_generation_job", {
      p_job_id: jobId,
      p_expected_status: "GENERATING_CONTENT",
      p_next_status: "GENERATING_IMAGES",
    });
  });

  it("allows GENERATING_CONTENT to advance directly to RENDERING", async () => {
    const client = mockClient();

    const response = await POST(
      request({
        jobId,
        expectedStatus: "GENERATING_CONTENT",
        nextStatus: "RENDERING",
      }),
    );

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("allows GENERATING_IMAGES to advance to RENDERING", async () => {
    const client = mockClient();

    const response = await POST(
      request({
        jobId,
        expectedStatus: "GENERATING_IMAGES",
        nextStatus: "RENDERING",
      }),
    );

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns conflict for a lifecycle mismatch", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "lifecycle conflict",
      },
    });

    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: jobId,
        status: "GENERATING_CONTENT",
      },
      error: null,
    });

    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    vi.mocked(getServiceRoleClient).mockResolvedValue({
      rpc,
      from,
    } as never);

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(409);
    expect(from).toHaveBeenCalledWith("generation_jobs");
  });

  it("treats a replay as success when the job already reached nextStatus", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "lifecycle conflict",
      },
    });

    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: jobId,
        status: "GENERATING_IMAGES",
      },
      error: null,
    });

    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    vi.mocked(getServiceRoleClient).mockResolvedValue({
      rpc,
      from,
    } as never);

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      jobId,
      status: "GENERATING_IMAGES",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("generation_jobs");
  });

  it("hides database failures from the response", async () => {
    const secret = "database-secret-must-not-leak";

    mockClient({
      rpcError: {
        code: "XX000",
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
