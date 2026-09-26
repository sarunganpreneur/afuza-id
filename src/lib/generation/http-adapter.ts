import type { GenerationWorkerClient } from "./worker";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type WorkerRpcResult = Awaited<ReturnType<GenerationWorkerClient["rpc"]>>;

type BoundaryJson = Record<string, unknown> | null;

export type AfuzaGenerationHttpClientOptions = {
  baseUrl: string;
  workerSecret: string;
  fetchImpl?: FetchLike;
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

async function readJsonSafely(response: Response): Promise<BoundaryJson> {
  try {
    const value: unknown = await response.json();

    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function boundaryError(
  response: Response,
  body: BoundaryJson,
): WorkerRpcResult {
  const code =
    body && typeof body.code === "string"
      ? body.code
      : body && typeof body.error === "string"
        ? body.error
        : "AFUZA_GENERATION_BOUNDARY_REJECTED";

  return {
    data: null,
    error: {
      code,
      message: `AFUZA generation boundary rejected request with HTTP ${response.status}`,
    },
  };
}

function unavailableError(): WorkerRpcResult {
  return {
    data: null,
    error: {
      code: "AFUZA_GENERATION_BOUNDARY_UNAVAILABLE",
      message: "AFUZA generation boundary request failed",
    },
  };
}

function invalidBoundaryResponse(): WorkerRpcResult {
  return {
    data: null,
    error: {
      code: "INVALID_GENERATION_BOUNDARY_RESPONSE",
      message: "AFUZA generation boundary returned an invalid response",
    },
  };
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isClaimedGenerationJob(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const job = value as Record<string, unknown>;

  return (
    isUuid(job.job_id) &&
    isUuid(job.site_id) &&
    typeof job.job_type === "string" &&
    job.status === "ANALYZING" &&
    typeof job.retry_count === "number" &&
    Number.isInteger(job.retry_count) &&
    job.retry_count >= 0 &&
    Object.prototype.hasOwnProperty.call(job, "input_snapshot")
  );
}

export function createAfuzaGenerationHttpClient(
  options: AfuzaGenerationHttpClientOptions,
): GenerationWorkerClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;

  const post = async (
    path: string,
    body: unknown,
  ): Promise<{ response: Response; body: BoundaryJson } | null> => {
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.workerSecret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      return {
        response,
        body: await readJsonSafely(response),
      };
    } catch {
      return null;
    }
  };

  return {
    async rpc(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<WorkerRpcResult> {
      let path: string;
      let requestBody: unknown;

      switch (name) {
        case "claim_next_generation_job":
          path = "/api/internal/generation/claim";
          requestBody = {};
          break;

        case "complete_generation_analysis":
          path = "/api/internal/generation/analysis/complete";
          requestBody = args.p_analysis_payload;
          break;

        case "advance_generation_job":
          path = "/api/internal/generation/advance";
          requestBody = {
            jobId: args.p_job_id,
            expectedStatus: args.p_expected_status,
            nextStatus: args.p_next_status,
          };
          break;

        case "fail_generation_job":
          path = "/api/internal/generation/fail";
          requestBody = {
            jobId: args.p_job_id,
            expectedStatus: args.p_expected_status,
            errorCode: args.p_error_code,
            errorMessage: args.p_error_message,
          };
          break;

        default:
          return {
            data: null,
            error: {
              code: "UNSUPPORTED_GENERATION_RPC",
              message: "Unsupported generation worker operation",
            },
          };
      }

      const result = await post(path, requestBody);

      if (!result) {
        return unavailableError();
      }

      if (!result.response.ok) {
        return boundaryError(result.response, result.body);
      }

      if (name === "claim_next_generation_job") {
        if (
          !result.body ||
          typeof result.body.claimed !== "boolean"
        ) {
          return invalidBoundaryResponse();
        }

        if (!result.body.claimed) {
          if (result.body.job !== null) {
            return invalidBoundaryResponse();
          }

          return {
            data: null,
            error: null,
          };
        }

        if (!isClaimedGenerationJob(result.body.job)) {
          return invalidBoundaryResponse();
        }

        return {
          data: result.body.job,
          error: null,
        };
      }

      if (name === "complete_generation_analysis") {
        if (
          !result.body ||
          result.body.success !== true ||
          result.body.job_id !== args.p_job_id ||
          result.body.status !== "GENERATING_CONTENT"
        ) {
          return invalidBoundaryResponse();
        }
      }

      if (name === "advance_generation_job") {
        if (
          !result.body ||
          result.body.ok !== true ||
          result.body.jobId !== args.p_job_id ||
          result.body.status !== args.p_next_status
        ) {
          return invalidBoundaryResponse();
        }
      }

      if (name === "fail_generation_job") {
        if (
          !result.body ||
          result.body.ok !== true ||
          result.body.jobId !== args.p_job_id ||
          result.body.status !== "ERROR"
        ) {
          return invalidBoundaryResponse();
        }
      }

      return {
        data: result.body,
        error: null,
      };
    },

    async readGenerationJobStatus(
      jobId: string,
    ): Promise<{ status: string } | null> {
      const result = await post(
        "/api/internal/generation/status",
        { jobId },
      );

      if (!result) {
        throw new Error("AFUZA generation status boundary unavailable");
      }

      if (result.response.status === 404) {
        return null;
      }

      if (!result.response.ok) {
        throw new Error(
          `AFUZA generation status boundary rejected request with HTTP ${result.response.status}`,
        );
      }

      if (
        !result.body ||
        result.body.ok !== true ||
        result.body.jobId !== jobId ||
        typeof result.body.status !== "string"
      ) {
        throw new Error(
          "AFUZA generation status boundary returned an invalid response",
        );
      }

      return {
        status: result.body.status,
      };
    },
  };
}
