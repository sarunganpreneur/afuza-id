import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { buildWebsiteAnalysisInput, parseWebsiteAnalysisV1, validateHalalAnalysisSafety, validateWebsiteAnalysisGrounding } from "@/lib/server/website-analysis";

export const runtime = "nodejs";

const UuidSchema = z.string().uuid();

function jsonError(status: number, error: string) {
  return NextResponse.json(
    { success: false, error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function normalizeDatabaseError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return 500;

  const message = String(error.message ?? "").toLowerCase();
  if (message.includes("not available for completion") || message.includes("generation job is not available") || message.includes("lifecycle conflict")) {
    return 409;
  }

  if (error.code === "42501") {
    return 503;
  }

  if (error.code === "PGRST116") {
    return 404;
  }

  return 500;
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
    return jsonError(400, "INVALID_ANALYSIS_PAYLOAD");
  }

  const parsed = parseWebsiteAnalysisV1(payload);
  if (!parsed.success) {
    return jsonError(400, "INVALID_ANALYSIS_PAYLOAD");
  }

  const analysis = parsed.data;
  const jobUuidResult = UuidSchema.safeParse(analysis.job_id);
  const siteUuidResult = UuidSchema.safeParse(analysis.site_id);

  if (!jobUuidResult.success || !siteUuidResult.success) {
    return jsonError(400, "INVALID_ANALYSIS_JOB_ID");
  }

  const halalCheck = validateHalalAnalysisSafety(analysis);
  if (!halalCheck.ok) {
    return jsonError(400, halalCheck.error);
  }

  const supabase = await getServiceRoleClient();
  if (!supabase) {
    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/analysis/complete",
        operation: "complete_analysis",
        database_error_code: "SERVICE_ROLE_UNAVAILABLE",
      }),
    );

    return jsonError(503, "WORKER_ANALYSIS_COMPLETION_UNAVAILABLE");
  }

  try {
    if (typeof supabase.from === "function") {
      const { data: job, error: jobError } = await supabase
        .from("generation_jobs")
        .select("id, site_id, status, input_snapshot")
        .eq("id", analysis.job_id)
        .maybeSingle();

      if (jobError || !job || job.status !== "ANALYZING") {
        return jsonError(409, "WORKER_ANALYSIS_COMPLETION_FAILED");
      }

      const normalizedInput = buildWebsiteAnalysisInput(job.input_snapshot);
      if (!normalizedInput.success) {
        return jsonError(400, "ANALYSIS_INPUT_INVALID");
      }

      const groundingCheck = validateWebsiteAnalysisGrounding(analysis, normalizedInput.data);
      if (!groundingCheck.ok) {
        return jsonError(400, groundingCheck.error);
      }
    }

    const { data, error } = await supabase.rpc("complete_generation_analysis", {
      p_job_id: analysis.job_id,
      p_site_id: analysis.site_id,
      p_analysis_version: analysis.schema_version,
      p_analysis_payload: analysis,
    });

    if (error) {
      const status = normalizeDatabaseError(error);
      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/analysis/complete",
          operation: "complete_analysis",
          database_error_code: "ANALYSIS_RPC_ERROR",
          code: error.code,
          details: error.message,
        }),
      );

      return jsonError(status, "WORKER_ANALYSIS_COMPLETION_FAILED");
    }

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json(
      {
        success: true,
        job_id: row?.job_id ?? analysis.job_id,
        status: row?.status ?? "GENERATING_CONTENT",
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/analysis/complete",
        operation: "complete_analysis",
        database_error_code: "ANALYSIS_RPC_EXCEPTION",
      }),
    );

    return jsonError(500, "WORKER_ANALYSIS_COMPLETION_FAILED");
  }
}
