import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  executionRpcError,
  isPlainObject,
  isValidUuid,
  jsonError,
  jsonPayloadWithinLimit,
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
        approvalId:
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
    approvalId,
  } =
    await context.params;


  if (
    !isValidUuid(
      approvalId,
    )
  ) {
    return jsonError(
      "INVALID_APPROVAL_ID",
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


  let executionInput:
    Record<
      string,
      unknown
    > = {};


  if (
    body.execution_input !==
      undefined
  ) {
    if (
      !isPlainObject(
        body.execution_input,
      )
    ) {
      return jsonError(
        "INVALID_EXECUTION_INPUT",
        400,
      );
    }

    executionInput =
      body.execution_input;
  }


  if (
    !jsonPayloadWithinLimit(
      executionInput,
    )
  ) {
    return jsonError(
      "EXECUTION_INPUT_TOO_LARGE",
      413,
    );
  }


  const {
    data,
    error,
  } =
    await mutation.db.rpc(
      "ops_prepare_execution",
      {
        p_approval_id:
          approvalId,

        p_idempotency_key:
          mutation.idempotencyKey,

        p_actor_user_id:
          mutation.access.userId,

        p_execution_input:
          executionInput,
      },
    );


  if (error) {
    return executionRpcError(
      error.message ?? "",
      "EXECUTION_PREPARE_FAILED",
    );
  }


  const execution =
    safeRpcRow(data);


  if (!execution) {
    return jsonError(
      "EXECUTION_PREPARE_RESULT_INVALID",
      500,
    );
  }


  return NextResponse.json(
    {
      execution,

      external_action_triggered:
        false,

      safety:
        "Execution authorization only. No external action was executed.",
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
