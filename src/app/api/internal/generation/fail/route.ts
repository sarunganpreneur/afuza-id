import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const ActiveFailureStageSchema = z.enum([
  "ANALYZING",
  "GENERATING_CONTENT",
  "GENERATING_IMAGES",
  "RENDERING",
]);

const FailEnvelopeSchema = z
  .object({
    jobId: z.string().uuid(),
    expectedStatus: ActiveFailureStageSchema,
    errorCode: z.string().min(1).max(100),
    errorMessage: z.string().min(1).max(2000),
  })
  .strict();

function jsonError(status: number, code: string) {
  return NextResponse.json(
    { ok: false, code },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function databaseConflict(error: { message?: string } | null | undefined) {
  const message = String(error?.message ?? "").toLowerCase();

  return (
    message.includes("lifecycle conflict") ||
    message.includes("generation job is not available") ||
    message.includes("status mismatch")
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
    return jsonError(400, "MALFORMED_JSON");
  }

  const envelope = FailEnvelopeSchema.safeParse(payload);

  if (!envelope.success) {
    return jsonError(400, "INVALID_FAIL_ENVELOPE");
  }

  const supabase = await getServiceRoleClient();

  if (!supabase) {
    return jsonError(503, "GENERATION_FAIL_UNAVAILABLE");
  }

  try {
    const { error } = await supabase.rpc("fail_generation_job", {
      p_job_id: envelope.data.jobId,
      p_expected_status: envelope.data.expectedStatus,
      p_error_code: envelope.data.errorCode,
      p_error_message: envelope.data.errorMessage,
    });

    if (error) {
      if (databaseConflict(error)) {
        const { data: current, error: statusError } = await supabase
          .from("generation_jobs")
          .select("id, status")
          .eq("id", envelope.data.jobId)
          .maybeSingle();

        if (
          !statusError &&
          current &&
          typeof current === "object" &&
          current.id === envelope.data.jobId &&
          current.status === "ERROR"
        ) {
          return NextResponse.json(
            {
              ok: true,
              jobId: envelope.data.jobId,
              status: "ERROR",
            },
            {
              status: 200,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }

        return jsonError(409, "GENERATION_FAIL_CONFLICT");
      }

      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/fail",
          operation: "fail",
          database_error_code: "FAIL_RPC_ERROR",
          code: error.code,
        }),
      );

      return jsonError(500, "GENERATION_FAIL_FAILED");
    }

    return NextResponse.json(
      {
        ok: true,
        jobId: envelope.data.jobId,
        status: "ERROR",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/fail",
        operation: "fail",
        database_error_code: "FAIL_RPC_EXCEPTION",
      }),
    );

    return jsonError(500, "GENERATION_FAIL_FAILED");
  }
}
