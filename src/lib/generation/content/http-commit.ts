import type { ClaimedGenerationJob } from "../worker";
import type { SiteContentV1 } from "../../site-content/schema";

type FetchLike = typeof fetch;

interface AfuzaContentHttpCommitterOptions {
  url: string;
  workerSecret: string;
  fetchImpl?: FetchLike;
}

type ContentCommitResponse = {
  ok?: unknown;
  jobId?: unknown;
  versionNumber?: unknown;
  siteContentId?: unknown;
  siteVersionId?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function readJsonSafely(response: Response): Promise<ContentCommitResponse | null> {
  try {
    const body = await response.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body as ContentCommitResponse;
  } catch {
    return null;
  }
}

function isConfirmedCommit(
  body: ContentCommitResponse | null,
  expectedJobId: string,
): boolean {
  return (
    body !== null &&
    body.ok === true &&
    body.jobId === expectedJobId &&
    typeof body.versionNumber === "number" &&
    Number.isInteger(body.versionNumber) &&
    body.versionNumber > 0 &&
    isNonEmptyString(body.siteContentId) &&
    isNonEmptyString(body.siteVersionId)
  );
}

export function createAfuzaContentHttpCommitter(
  options: AfuzaContentHttpCommitterOptions,
): (job: ClaimedGenerationJob, content: SiteContentV1) => Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (
    job: ClaimedGenerationJob,
    content: SiteContentV1,
  ): Promise<void> => {
    let response: Response;

    try {
      response = await fetchImpl(options.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.workerSecret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jobId: job.job_id,
          content,
        }),
      });
    } catch {
      throw new Error("Content adapter request failed");
    }

    if (!response.ok) {
      throw new Error(
        `Content adapter rejected commit with HTTP ${response.status}`,
      );
    }

    const body = await readJsonSafely(response);

    if (!isConfirmedCommit(body, job.job_id)) {
      throw new Error("Content adapter returned an invalid response");
    }
  };
}
