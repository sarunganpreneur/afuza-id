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
  return new Request("http://localhost/api/internal/generation/status", {
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
  job = { id: jobId, status: "GENERATING_CONTENT" },
  error = null,
}: {
  job?: { id: string; status: string } | null;
  error?: { code?: string; message?: string } | null;
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: job, error });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  vi.mocked(getServiceRoleClient).mockResolvedValue({ from } as never);

  return { from, select, eq, maybeSingle };
}

describe("generation status endpoint", () => {
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

    const response = await POST(request({ jobId }));

    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request({}, { raw: "not-json" }));

    expect(response.status).toBe(400);
  });

  it("rejects unknown envelope fields", async () => {
    const response = await POST(request({ jobId, siteId: "not-accepted" }));

    expect(response.status).toBe(400);
  });

  it("rejects an invalid job id", async () => {
    const response = await POST(request({ jobId: "not-a-uuid" }));

    expect(response.status).toBe(400);
  });

  it("returns the current generation job status", async () => {
    mockClient();

    const response = await POST(
      request(
        { jobId },
        { authorization: "Bearer valid" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      jobId,
      status: "GENERATING_CONTENT",
    });
  });

  it("returns not found for a missing job", async () => {
    mockClient({ job: null });

    const response = await POST(request({ jobId }));

    expect(response.status).toBe(404);
  });

  it("hides database failures from the response", async () => {
    const secret = "database-secret-must-not-leak";

    mockClient({
      error: {
        code: "XX000",
        message: secret,
      },
    });

    const response = await POST(request({ jobId }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
  });

  it("returns a safe failure when the service role is unavailable", async () => {
    vi.mocked(getServiceRoleClient).mockResolvedValue(null);

    const response = await POST(request({ jobId }));

    expect(response.status).toBe(503);
  });
});
