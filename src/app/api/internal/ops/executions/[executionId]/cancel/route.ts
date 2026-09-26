import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  executionRpcError,
  isValidUuid,
  jsonError,
  readJsonObject,
  requireControlPlaneMode,
  requireExecutionMutation,
  safeRpcRow,
} from "@/lib/ops/execution-mutation-api";


export async function POST(
  request:
    NextRequest,

  context: {
    params:
      Promise<{
        executionId:
          string;
      }>;
  },
) {
  const mutation =
    await requireExecutionMutation(
      request,
    );

  if (!mutation.ok) {
    return mutation.response;
  }


  const {
    executionId,
  } =
    await context.params;


  if (
    !isValidUuid(
      executionId,
    )
  ) {
    return jsonError(
      "INVALID_EXECUTION_ID",
      400,
    );
  }


  const body =
    await readJsonObject(
      request,
    );

  if (!body) {
    return jsonError(
      "INVALID_REQUEST",
      400,
    );
  }


  const modeError =
    requireControlPlaneMode(
      body,
    );

  if (modeError) {
    return modeError;
  }


  const reason =
    typeof body.reason ===
      "string"
      ? body.reason.trim()
      : "";


  if (!reason) {
    return jsonError(
      "CANCELLATION_REASON_REQUIRED",
      400,
    );
  }


  if (
    reason.length >
      500
  ) {
    return jsonError(
      "CANCELLATION_REASON_TOO_LONG",
      413,
    );
  }


  const {
    data,
    error,
  } =
    await mutation.db.rpc(
      "ops_cancel_execution",
      {
        p_execution_id:
          executionId,

        p_idempotency_key:
          mutation.idempotencyKey,

        p_actor_user_id:
          mutation.access.userId,

        p_reason:
          reason,
      },
    );


  if (error) {
    return executionRpcError(
      error.message ?? "",
      "EXECUTION_CANCEL_FAILED",
    );
  }


  const execution =
    safeRpcRow(data);


  if (!execution) {
    return jsonError(
      "EXECUTION_CANCEL_RESULT_INVALID",
      500,
    );
  }


  return NextResponse.json(
    {
      execution,

      external_executor_cancelled:
        false,

      external_action_triggered:
        false,

      safety:
        "Control-plane cancellation only. External executor handoff is not enabled.",
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
