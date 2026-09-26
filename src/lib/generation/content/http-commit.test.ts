import { describe, expect, it, vi } from "vitest";

import { createAfuzaContentHttpCommitter } from "./http-commit";
import type { ClaimedGenerationJob } from "../worker";
import type { SiteContentV1 } from "../../site-content/schema";

const jobId = "03137715-b9f0-41eb-8072-9e0135de32a8";
const siteId = "550e8400-e29b-41d4-a716-446655440000";
const url = "http://127.0.0.1:4100/api/internal/generation/content/commit";
const workerSecret = "worker-secret";

const job = {
  job_id: jobId,
  site_id: siteId,
  job_type: "CREATE",
  status: "ANALYZING",
  retry_count: 0,
  input_snapshot: {},
} as ClaimedGenerationJob;

const content = {} as SiteContentV1;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AFUZA content HTTP committer", () => {
  it("accepts only a confirmed content commit response", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        jobId,
        versionNumber: 3,
        siteContentId: "content-id",
        siteVersionId: "version-id",
      }),
    );

    const commitContent = createAfuzaContentHttpCommitter({
      url,
      workerSecret,
      fetchImpl,
    });

    await expect(commitContent(job, content)).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ jobId, content }),
      }),
    );
  });

  it("fails closed on a malformed 200 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        jobId,
      }),
    );

    const commitContent = createAfuzaContentHttpCommitter({
      url,
      workerSecret,
      fetchImpl,
    });

    await expect(commitContent(job, content)).rejects.toThrow(
      "Content adapter returned an invalid response",
    );
  });

  it("fails closed when a 200 response confirms a different job", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        versionNumber: 3,
        siteContentId: "content-id",
        siteVersionId: "version-id",
      }),
    );

    const commitContent = createAfuzaContentHttpCommitter({
      url,
      workerSecret,
      fetchImpl,
    });

    await expect(commitContent(job, content)).rejects.toThrow(
      "Content adapter returned an invalid response",
    );
  });

  it("does not leak response payloads when the boundary rejects the commit", async () => {
    const secret = "database-secret-must-not-leak";
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          code: "CONTENT_COMMIT_FAILED",
          internal: secret,
        },
        500,
      ),
    );

    const commitContent = createAfuzaContentHttpCommitter({
      url,
      workerSecret,
      fetchImpl,
    });

    let message = "";

    try {
      await commitContent(job, content);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe("Content adapter rejected commit with HTTP 500");
    expect(message).not.toContain(secret);
  });
});
