import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const GenerationStageSchema = z.enum([
  "GENERATING_CONTENT",
  "GENERATING_IMAGES",
  "RENDERING",
]);

const AdvanceEnvelopeSchema = z
  .object({
    jobId: z.string().uuid(),
    expectedStatus: GenerationStageSchema,
    nextStatus: GenerationStageSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed =
      (value.expectedStatus === "GENERATING_CONTENT" &&
        value.nextStatus === "GENERATING_IMAGES") ||
      (value.expectedStatus === "GENERATING_CONTENT" &&
        value.nextStatus === "RENDERING") ||
      (value.expectedStatus === "GENERATING_IMAGES" &&
        value.nextStatus === "RENDERING");

    if (!allowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextStatus"],
        message: "Unsupported Generation V1 lifecycle transition",
      });
    }
  });

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
    message.includes("generation job is not available")
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

  const envelope = AdvanceEnvelopeSchema.safeParse(payload);

  if (!envelope.success) {
    return jsonError(400, "INVALID_ADVANCE_ENVELOPE");
  }

  const supabase = await getServiceRoleClient();

  if (!supabase) {
    return jsonError(503, "GENERATION_ADVANCE_UNAVAILABLE");
  }

  try {
    const { error } = await supabase.rpc("advance_generation_job", {
      p_job_id: envelope.data.jobId,
      p_expected_status: envelope.data.expectedStatus,
      p_next_status: envelope.data.nextStatus,
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
          current.status === envelope.data.nextStatus
        ) {
          return NextResponse.json(
            {
              ok: true,
              jobId: envelope.data.jobId,
              status: envelope.data.nextStatus,
            },
            {
              status: 200,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }

        return jsonError(409, "GENERATION_ADVANCE_CONFLICT");
      }

      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/advance",
          operation: "advance",
          database_error_code: "ADVANCE_RPC_ERROR",
          code: error.code,
        }),
      );

      return jsonError(500, "GENERATION_ADVANCE_FAILED");
    }

    return NextResponse.json(
      {
        ok: true,
        jobId: envelope.data.jobId,
        status: envelope.data.nextStatus,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/advance",
        operation: "advance",
        database_error_code: "ADVANCE_RPC_EXCEPTION",
      }),
    );

    return jsonError(500, "GENERATION_ADVANCE_FAILED");
  }
}
