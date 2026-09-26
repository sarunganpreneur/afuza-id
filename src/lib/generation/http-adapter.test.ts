import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAfuzaGenerationHttpClient } from "./http-adapter";

const baseUrl = "http://127.0.0.1:4100";
const workerSecret = "worker-secret";
const jobId = "03137715-b9f0-41eb-8072-9e0135de32a8";
const siteId = "61c79c23-690a-4f5d-8eca-4d3588362c7c";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AFUZA generation HTTP client", () => {
  const fetchImpl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function client() {
    return createAfuzaGenerationHttpClient({
      baseUrl,
      workerSecret,
      fetchImpl,
    });
  }

  it("claims through the AFUZA claim boundary", async () => {
    const job = {
      job_id: jobId,
      site_id: siteId,
      job_type: "CREATE",
      status: "ANALYZING",
      retry_count: 0,
      input_snapshot: {},
    };

    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        claimed: true,
        job,
      }),
    );

    const result = await client().rpc("claim_next_generation_job", {});

    expect(result).toEqual({
      data: job,
      error: null,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${baseUrl}/api/internal/generation/claim`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: `Bearer ${workerSecret}`,
        }),
      }),
    );
  });

  it("returns null data when no generation job is claimable", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        claimed: false,
        job: null,
      }),
    );

    const result = await client().rpc("claim_next_generation_job", {});

    expect(result).toEqual({
      data: null,
      error: null,
    });
  });

  it("completes analysis through the AFUZA analysis boundary", async () => {
    const analysis = {
      schema_version: "website_analysis_v1",
      job_id: jobId,
      site_id: siteId,
      sections: [],
    };

    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        job_id: jobId,
        status: "GENERATING_CONTENT",
      }),
    );

    const result = await client().rpc("complete_generation_analysis", {
      p_job_id: jobId,
      p_site_id: siteId,
      p_analysis_version: "website_analysis_v1",
      p_analysis_payload: analysis,
    });

    expect(result.error).toBeNull();

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];

    expect(JSON.parse(String(init.body))).toEqual(analysis);
  });

  it("advances lifecycle through the AFUZA advance boundary", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        jobId,
        status: "GENERATING_IMAGES",
      }),
    );

    const result = await client().rpc("advance_generation_job", {
      p_job_id: jobId,
      p_expected_status: "GENERATING_CONTENT",
      p_next_status: "GENERATING_IMAGES",
    });

    expect(result.error).toBeNull();

    expect(fetchImpl).toHaveBeenCalledWith(
      `${baseUrl}/api/internal/generation/advance`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          jobId,
          expectedStatus: "GENERATING_CONTENT",
          nextStatus: "GENERATING_IMAGES",
        }),
      }),
    );
  });

  it("records failure through the AFUZA fail boundary", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        jobId,
        status: "ERROR",
      }),
    );

    const result = await client().rpc("fail_generation_job", {
      p_job_id: jobId,
      p_expected_status: "GENERATING_CONTENT",
      p_error_code: "INVALID_SITE_CONTENT",
      p_error_message: "Generated content failed validation",
    });

    expect(result.error).toBeNull();

    expect(fetchImpl).toHaveBeenCalledWith(
      `${baseUrl}/api/internal/generation/fail`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          jobId,
          expectedStatus: "GENERATING_CONTENT",
          errorCode: "INVALID_SITE_CONTENT",
          errorMessage: "Generated content failed validation",
        }),
      }),
    );
  });

  it("reads lifecycle status through the AFUZA status boundary", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        jobId,
        status: "GENERATING_IMAGES",
      }),
    );

    const result = await client().readGenerationJobStatus(jobId);

    expect(result).toEqual({
      status: "GENERATING_IMAGES",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${baseUrl}/api/internal/generation/status`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ jobId }),
      }),
    );
  });

  it("fails closed when status boundary returns a different job id", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "GENERATING_IMAGES",
      }),
    );

    await expect(
      client().readGenerationJobStatus(jobId),
    ).rejects.toThrow(
      "AFUZA generation status boundary returned an invalid response",
    );
  });

  it("fails closed when status boundary does not confirm ok true", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: false,
        jobId,
        status: "GENERATING_IMAGES",
      }),
    );

    await expect(
      client().readGenerationJobStatus(jobId),
    ).rejects.toThrow(
      "AFUZA generation status boundary returned an invalid response",
    );
  });

  it("converts HTTP boundary rejection into the worker RPC error contract", async () => {
    const secret = "database-secret-must-not-leak";

    fetchImpl.mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          code: "GENERATION_ADVANCE_CONFLICT",
          internal: secret,
        },
        409,
      ),
    );

    const result = await client().rpc("advance_generation_job", {
      p_job_id: jobId,
      p_expected_status: "GENERATING_CONTENT",
      p_next_status: "GENERATING_IMAGES",
    });

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      code: "GENERATION_ADVANCE_CONFLICT",
      message: "AFUZA generation boundary rejected request with HTTP 409",
    });
    expect(JSON.stringify(result.error)).not.toContain(secret);
  });

  it("preserves the safe legacy error field from analysis boundary", async () => {
    const secret = "database-secret-must-not-leak";

    fetchImpl.mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: "WORKER_ANALYSIS_COMPLETION_FAILED",
          internal: secret,
        },
        409,
      ),
    );

    const result = await client().rpc("complete_generation_analysis", {
      p_job_id: jobId,
      p_site_id: siteId,
      p_analysis_version: "website_analysis_v1",
      p_analysis_payload: {
        schema_version: "website_analysis_v1",
        job_id: jobId,
        site_id: siteId,
        sections: [],
      },
    });

    expect(result).toEqual({
      data: null,
      error: {
        code: "WORKER_ANALYSIS_COMPLETION_FAILED",
        message: "AFUZA generation boundary rejected request with HTTP 409",
      },
    });

    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("fails closed when claim reports claimed without a valid job", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        claimed: true,
        job: null,
      }),
    );

    const result = await client().rpc("claim_next_generation_job", {});

    expect(result).toEqual({
      data: null,
      error: {
        code: "INVALID_GENERATION_BOUNDARY_RESPONSE",
        message: "AFUZA generation boundary returned an invalid response",
      },
    });
  });

  it("fails closed when analysis completion does not confirm GENERATING_CONTENT", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        job_id: jobId,
        status: "ANALYZING",
      }),
    );

    const result = await client().rpc("complete_generation_analysis", {
      p_job_id: jobId,
      p_analysis_payload: {
        schema_version: "website_analysis_v1",
        job_id: jobId,
        site_id: siteId,
        sections: [],
      },
    });

    expect(result).toEqual({
      data: null,
      error: {
        code: "INVALID_GENERATION_BOUNDARY_RESPONSE",
        message: "AFUZA generation boundary returned an invalid response",
      },
    });
  });

  it("fails closed when advance success does not confirm the requested state", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        jobId,
        status: "RENDERING",
      }),
    );

    const result = await client().rpc("advance_generation_job", {
      p_job_id: jobId,
      p_expected_status: "GENERATING_CONTENT",
      p_next_status: "GENERATING_IMAGES",
    });

    expect(result).toEqual({
      data: null,
      error: {
        code: "INVALID_GENERATION_BOUNDARY_RESPONSE",
        message: "AFUZA generation boundary returned an invalid response",
      },
    });
  });

  it("fails closed when fail success does not confirm ERROR", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        jobId,
        status: "RENDERING",
      }),
    );

    const result = await client().rpc("fail_generation_job", {
      p_job_id: jobId,
      p_expected_status: "GENERATING_CONTENT",
      p_error_code: "INVALID_SITE_CONTENT",
      p_error_message: "Generated content failed validation",
    });

    expect(result).toEqual({
      data: null,
      error: {
        code: "INVALID_GENERATION_BOUNDARY_RESPONSE",
        message: "AFUZA generation boundary returned an invalid response",
      },
    });
  });

  it("rejects RPC names outside the approved worker boundary", async () => {
    const result = await client().rpc("unknown_generation_rpc", {});

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      code: "UNSUPPORTED_GENERATION_RPC",
      message: "Unsupported generation worker operation",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
