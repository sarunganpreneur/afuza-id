import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { buildWebsiteAnalysisInput } from "@/lib/server/website-analysis";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const UuidSchema = z.string().uuid();
const InputRequestSchema = z.object({
  job_id: z.string().uuid(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json(
    { success: false, error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  const auth = authenticateWorkerRequest(request);

  if (auth.status === AUTH_RESULT.UNAUTHORIZED) {
    return jsonError(401, "UNAUTHORIZED");
  }

  if (auth.status === AUTH_RESULT.MISCONFIGURED) {
    return jsonError(503, "WORKER_AUTH_UNAVAILABLE");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "INVALID_JOB_PAYLOAD");
  }

  const parsed = InputRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(400, "INVALID_JOB_ID");
  }

  const jobId = parsed.data.job_id;
  const supabase = await getServiceRoleClient();
  if (!supabase) {
    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/analysis/input",
        operation: "get_analysis_input",
        database_error_code: "SERVICE_ROLE_UNAVAILABLE",
      }),
    );

    return jsonError(503, "WORKER_ANALYSIS_INPUT_UNAVAILABLE");
  }

  try {
    const { data, error } = await supabase
      .from("generation_jobs")
      .select("id, site_id, status, job_type, input_snapshot")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/analysis/input",
          operation: "get_analysis_input",
          database_error_code: "GENERATION_JOB_QUERY_ERROR",
          details: error.message,
        }),
      );

      return jsonError(500, "WORKER_ANALYSIS_INPUT_FAILED");
    }

    if (!data || typeof data !== "object") {
      return jsonError(404, "JOB_NOT_FOUND");
    }

    const job = data as {
      id?: string;
      site_id?: string;
      status?: string;
      job_type?: string;
      input_snapshot?: unknown;
    };

    if (!UuidSchema.safeParse(job.id).success || !UuidSchema.safeParse(job.site_id).success) {
      return jsonError(500, "WORKER_ANALYSIS_INPUT_FAILED");
    }

    if (job.status !== "ANALYZING") {
      return jsonError(409, "JOB_STATUS_NOT_ANALYZING");
    }

    if (job.job_type !== "CREATE") {
      return jsonError(409, "JOB_TYPE_NOT_ALLOWED");
    }

    if (!job.input_snapshot || typeof job.input_snapshot !== "object") {
      return jsonError(500, "WORKER_ANALYSIS_INPUT_FAILED");
    }

    const normalized = buildWebsiteAnalysisInput(job.input_snapshot);
    if (!normalized.success) {
      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/analysis/input",
          operation: "get_analysis_input",
          database_error_code: "ANALYSIS_INPUT_INVALID",
          details: normalized.error,
        }),
      );

      return jsonError(422, "ANALYSIS_INPUT_INVALID");
    }

    return NextResponse.json(
      {
        success: true,
        job: {
          job_id: job.id,
          site_id: job.site_id,
          job_type: job.job_type,
          status: job.status,
          input_snapshot: job.input_snapshot,
          analysis_input: normalized.data,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/analysis/input",
        operation: "get_analysis_input",
        database_error_code: "GENERATION_JOB_QUERY_EXCEPTION",
      }),
    );

    return jsonError(500, "WORKER_ANALYSIS_INPUT_FAILED");
  }
}
