import "server-only";

import { NextResponse } from "next/server";

import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function jsonError(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
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

  const supabase = await getServiceRoleClient();
  if (!supabase) {
    console.warn(
      JSON.stringify({
        route: "/api/internal/generation/claim",
        operation: "claim",
        database_error_code: "SERVICE_ROLE_UNAVAILABLE",
      }),
    );

    return jsonError(503, "WORKER_AUTH_UNAVAILABLE");
  }

  try {
    const { data, error } = await supabase.rpc("claim_next_generation_job");

    if (error) {
      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/claim",
          operation: "claim",
          database_error_code: "CLAIM_RPC_ERROR",
        }),
      );

      return jsonError(500, "WORKER_CLAIM_FAILED");
    }

    const rows = Array.isArray(data) ? data : data == null ? [] : [data];

    if (rows.length === 0) {
      return NextResponse.json(
        { claimed: false, job: null },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    if (rows.length > 1) {
      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/claim",
          operation: "claim",
          database_error_code: "CLAIM_RPC_UNEXPECTED_ROWS",
        }),
      );

      return jsonError(500, "WORKER_CLAIM_FAILED");
    }

    const job = rows[0];
    if (!job || typeof job !== "object") {
      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/claim",
          operation: "claim",
          database_error_code: "CLAIM_RPC_BAD_ROW",
        }),
      );

      return jsonError(500, "WORKER_CLAIM_FAILED");
    }

    const requiredFields = [
      "job_id",
      "site_id",
      "job_type",
      "status",
      "retry_count",
      "input_snapshot",
    ];

    const hasAllFields = requiredFields.every((field) => Object.prototype.hasOwnProperty.call(job, field));
    if (!hasAllFields) {
      console.warn(
        JSON.stringify({
          route: "/api/internal/generation/claim",
          operation: "claim",
          database_error_code: "CLAIM_RPC_MISSING_FIELDS",
        }),
      );

      return jsonError(500, "WORKER_CLAIM_FAILED");
    }

    return NextResponse.json(
      {
        claimed: true,
        job: {
          job_id: job.job_id,
          site_id: job.site_id,
          job_type: job.job_type,
          status: job.status,
          retry_count: Number(job.retry_count ?? 0),
          input_snapshot: job.input_snapshot ?? {},
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
        route: "/api/internal/generation/claim",
        operation: "claim",
        database_error_code: "CLAIM_RPC_EXCEPTION",
      }),
    );

    return jsonError(500, "WORKER_CLAIM_FAILED");
  }
}
