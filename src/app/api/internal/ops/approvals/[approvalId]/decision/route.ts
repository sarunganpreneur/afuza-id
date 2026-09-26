import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireOpsApiPermission,
  requireOpsJsonMutation,
} from "@/lib/ops/api";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

function jsonError(
  error: string,
  status: number,
  detail?: string,
) {
  return NextResponse.json(
    {
      error,
      ...(detail ? { detail } : {}),
    },
    { status },
  );
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      approvalId: string;
    }>;
  },
) {
  const gate =
    await requireOpsApiPermission(
      "OPS_APPROVE",
    );

  if (gate.response) {
    return gate.response;
  }

  const mutationError =
    requireOpsJsonMutation(request);

  if (mutationError) {
    return mutationError;
  }

  const access = gate.access;

  if (!access?.userId) {
    return jsonError(
      "OPS_IDENTITY_UNAVAILABLE",
      401,
    );
  }

  const {
    approvalId,
  } = await context.params;

  if (!approvalId) {
    return jsonError(
      "APPROVAL_ID_REQUIRED",
      400,
    );
  }

  const body = await request
    .json()
    .catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError(
      "INVALID_REQUEST",
      400,
    );
  }

  const decision =
    typeof body.decision === "string"
      ? body.decision
          .trim()
          .toUpperCase()
      : "";

  const reason =
    typeof body.reason === "string"
      ? body.reason.trim()
      : "";

  if (
    decision !== "APPROVED" &&
    decision !== "REJECTED"
  ) {
    return jsonError(
      "INVALID_DECISION",
      400,
    );
  }

  /*
   * Require a reason for rejection.
   * Approval reason is optional.
   */
  if (
    decision === "REJECTED" &&
    !reason
  ) {
    return jsonError(
      "REJECTION_REASON_REQUIRED",
      400,
    );
  }

  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return jsonError(
      "SERVICE_ROLE_UNAVAILABLE",
      503,
    );
  }

  const { data, error } =
    await supabase.rpc(
      "ops_decide_approval",
      {
        p_approval_id:
          approvalId,
        p_decision:
          decision,
        p_reason:
          reason || null,
        p_decided_by:
          access.userId,
      },
    );

  if (error) {
    const message =
      error.message ?? "";

    const conflict =
      message.includes(
        "not pending",
      );

    const notFound =
      message.includes(
        "not found",
      );

    return jsonError(
      conflict
        ? "APPROVAL_NOT_PENDING"
        : notFound
          ? "APPROVAL_NOT_FOUND"
          : "APPROVAL_DECISION_FAILED",

      conflict
        ? 409
        : notFound
          ? 404
          : 500,

      message,
    );
  }

  const result =
    Array.isArray(data)
      ? data[0]
      : data;

  return NextResponse.json(
    {
      approval:
        result ?? null,

      // Deliberately false.
      execution_triggered: false,

      safety:
        "Decision persisted only. No external action was executed.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
