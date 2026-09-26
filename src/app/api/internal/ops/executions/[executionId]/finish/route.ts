import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  executionRpcError,
  getServerLeaseToken,
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


  const outcome =
    typeof body.outcome ===
      "string"
      ? body.outcome
          .trim()
          .toUpperCase()
      : "";


  if (
    outcome !==
      "COMPLETED" &&
    outcome !==
      "FAILED"
  ) {
    return jsonError(
      "INVALID_EXECUTION_OUTCOME",
      400,
    );
  }


  let resultSummary:
    Record<
      string,
      unknown
    > | null =
    null;


  if (
    body.result_summary !==
      undefined &&
    body.result_summary !==
      null
  ) {
    if (
      !isPlainObject(
        body.result_summary,
      )
    ) {
      return jsonError(
        "INVALID_RESULT_SUMMARY",
        400,
      );
    }

    resultSummary =
      body.result_summary;
  }


  if (
    !jsonPayloadWithinLimit(
      resultSummary,
    )
  ) {
    return jsonError(
      "RESULT_SUMMARY_TOO_LARGE",
      413,
    );
  }


  const failureCode =
    typeof body.failure_code ===
      "string"
      ? body.failure_code
          .trim()
      : "";


  const failureMessage =
    typeof body.failure_message ===
      "string"
      ? body.failure_message
          .trim()
      : "";


  if (
    failureCode.length >
      120 ||
    failureMessage.length >
      1000
  ) {
    return jsonError(
      "FAILURE_DETAIL_TOO_LARGE",
      413,
    );
  }


  if (
    outcome ===
      "FAILED" &&
    !failureCode
  ) {
    return jsonError(
      "FAILURE_CODE_REQUIRED",
      400,
    );
  }


  if (
    outcome ===
      "COMPLETED" &&
    (
      failureCode ||
      failureMessage
    )
  ) {
    return jsonError(
      "COMPLETED_CANNOT_HAVE_FAILURE_DETAILS",
      400,
    );
  }


  const lease =
    await getServerLeaseToken(
      mutation.db,
      executionId,
    );


  if (!lease.ok) {
    return lease.response;
  }


  const {
    data,
    error,
  } =
    await mutation.db.rpc(
      "ops_finish_execution",
      {
        p_execution_id:
          executionId,

        p_outcome:
          outcome,

        p_idempotency_key:
          mutation.idempotencyKey,

        p_actor_user_id:
          mutation.access.userId,

        p_lease_token:
          lease.leaseToken,

        p_result_summary:
          resultSummary,

        p_failure_code:
          failureCode ||
          null,

        p_failure_message:
          failureMessage ||
          null,
      },
    );


  if (error) {
    return executionRpcError(
      error.message ?? "",
      "EXECUTION_FINISH_FAILED",
    );
  }


  const execution =
    safeRpcRow(data);


  if (!execution) {
    return jsonError(
      "EXECUTION_FINISH_RESULT_INVALID",
      500,
    );
  }


  return NextResponse.json(
    {
      execution,

      lease_token_exposed:
        false,

      external_action_triggered:
        false,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
