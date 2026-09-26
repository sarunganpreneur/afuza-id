import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const StatusEnvelopeSchema = z
  .object({
    jobId: z.string().uuid(),
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

  const envelope = StatusEnvelopeSchema.safeParse(payload);

  if (!envelope.success) {
    return jsonError(400, "INVALID_STATUS_ENVELOPE");
  }

  const supabase = await getServiceRoleClient();

  if (!supabase) {
    return jsonError(503, "GENERATION_STATUS_UNAVAILABLE");
  }

  try {
    const { data, error } = await supabase
      .from("generation_jobs")
      .select("id, status")
      .eq("id", envelope.data.jobId)
      .maybeSingle();

    if (error) {
      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/status",
          operation: "read_status",
          database_error_code: "GENERATION_STATUS_QUERY_ERROR",
          code: error.code,
        }),
      );

      return jsonError(500, "GENERATION_STATUS_FAILED");
    }

    if (!data) {
      return jsonError(404, "GENERATION_JOB_NOT_FOUND");
    }

    if (
      typeof data !== "object" ||
      typeof data.id !== "string" ||
      typeof data.status !== "string"
    ) {
      return jsonError(500, "GENERATION_STATUS_FAILED");
    }

    return NextResponse.json(
      {
        ok: true,
        jobId: data.id,
        status: data.status,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/status",
        operation: "read_status",
        database_error_code: "GENERATION_STATUS_QUERY_EXCEPTION",
      }),
    );

    return jsonError(500, "GENERATION_STATUS_FAILED");
  }
}
