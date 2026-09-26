import { beforeEach, describe, expect, it, vi } from "vitest";

import { validSiteContentFixtures } from "@/lib/site-content/fixtures";
import type { SiteContentV1 } from "@/lib/site-content/schema";
import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { POST } from "./route";

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
const content = validSiteContentFixtures.umkmKuliner;
const hero = (value: SiteContentV1) => value.sections[0] as Extract<SiteContentV1["sections"][number], { type: "hero" }>;
const about = (value: SiteContentV1) => value.sections[1] as Extract<SiteContentV1["sections"][number], { type: "about" }>;

function request(body: unknown, options: { authorization?: string; raw?: string } = {}): Request {
  return new Request("http://localhost/api/internal/generation/content/commit", {
    method: "POST",
    headers: {
      ...(options.authorization ? { authorization: options.authorization } : {}),
      ...(options.raw ? { "content-type": "application/json" } : {}),
    },
    body: options.raw ?? JSON.stringify(body),
  });
}

function mockClient({
  job = { id: jobId },
  jobError = null,
  rpcData = [{ version_number: 3, site_content_id: "content-id", site_version_id: "version-id" }],
  rpcError = null,
}: {
  job?: { id: string } | null;
  jobError?: { code?: string; message?: string } | null;
  rpcData?: unknown;
  rpcError?: { code?: string; message?: string } | null;
} = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: rpcData, error: rpcError });
  const maybeSingle = vi.fn().mockResolvedValue({ data: job, error: jobError });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn(() => ({ select })), rpc } as never);
  return { maybeSingle, rpc };
}

function validPayload() {
  return { jobId, content: structuredClone(content) };
}

describe("generation content commit endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
  });

  it("rejects missing authorization", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.UNAUTHORIZED, reason: "missing-header" });
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(401);
  });

  it("rejects invalid authorization", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.UNAUTHORIZED, reason: "invalid-token" });
    const response = await POST(request(validPayload(), { authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request({}, { raw: "not-json" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("MALFORMED_JSON");
  });

  it("rejects unknown envelope fields", async () => {
    const response = await POST(request({ ...validPayload(), ownerId: "not-accepted" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_COMMIT_ENVELOPE");
  });

  it("rejects an unsupported content schema version", async () => {
    const payload = validPayload();
    payload.content.schemaVersion = "site_content_v2" as never;
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
  });

  it("accepts valid content and returns the committed version", async () => {
    const client = mockClient();
    const response = await POST(request(validPayload(), { authorization: "Bearer valid" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, jobId, versionNumber: 3, siteContentId: "content-id", siteVersionId: "version-id" });
    expect(client.rpc).toHaveBeenCalledWith("commit_generated_site_version", expect.objectContaining({
      p_job_id: jobId,
      p_content: content,
      p_theme: content.theme,
      p_seo: content.seo,
      p_editor_state: { schemaVersion: "site_content_v1", source: "AI" },
    }));
  });

  it("does not call RPC for structurally invalid content", async () => {
    const client = mockClient();
    const payload = validPayload();
    delete (payload.content as { sections?: unknown }).sections;
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("does not call RPC for semantically invalid content", async () => {
    const client = mockClient();
    const payload = validPayload();
    payload.content.sections[1].id = "hero";
    const response = await POST(request(payload));
    expect(response.status).toBe(422);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["script injection", "<script>alert(1)</script>"],
    ["unsafe CTA URL", "javascript:alert(1)"],
  ])("rejects %s", async (_label, value) => {
    const client = mockClient();
    const payload = validPayload();
    if (_label === "script injection") about(payload.content).body = value;
    else hero(payload.content).cta = { label: "Go", kind: "external", target: value };
    const response = await POST(request(payload));
    expect(response.status).toBe(422);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("returns not found without calling commit RPC for a missing job", async () => {
    const client = mockClient({ job: null });
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(404);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("returns conflict when RPC rejects a job-site or lifecycle mismatch", async () => {
    const client = mockClient({ rpcError: { code: "P0001", message: "Generation job is not available" } });
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(409);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns conflict for a job in the wrong status", async () => {
    const client = mockClient({ rpcError: { code: "P0001", message: "Generation job is not available" } });
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(409);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns the same version on an idempotent retry", async () => {
    const client = mockClient({ rpcData: [{ version_number: 3, site_content_id: "content-id", site_version_id: "version-id" }] });
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(200);
    expect((await response.json()).versionNumber).toBe(3);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("hides database failures and credentials from the response", async () => {
    const secret = "worker-secret-must-not-leak";
    mockClient({ rpcError: { code: "XX000", message: secret } });
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
  });

  it("does not log database messages or credentials", async () => {
    const secret = "database-secret-must-not-log";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockClient({ rpcError: { code: "XX000", message: secret } });
    await POST(request(validPayload()));
    expect(warn.mock.calls.flat().join(" ")).not.toContain(secret);
    warn.mockRestore();
  });

  it("returns a safe failure when the service role is unavailable", async () => {
    vi.mocked(getServiceRoleClient).mockResolvedValue(null);
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("GENERATION_COMMIT_UNAVAILABLE");
  });
});