import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  executionRpcError,
  getServerLeaseToken,
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


  const leaseMinutes =
    body.lease_minutes ===
      undefined
      ? 15
      : body.lease_minutes;


  if (
    !Number.isInteger(
      leaseMinutes,
    ) ||
    Number(leaseMinutes) <
      1 ||
    Number(leaseMinutes) >
      60
  ) {
    return jsonError(
      "INVALID_LEASE_MINUTES",
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
      "ops_renew_execution_lease",
      {
        p_execution_id:
          executionId,

        p_idempotency_key:
          mutation.idempotencyKey,

        p_actor_user_id:
          mutation.access.userId,

        p_lease_token:
          lease.leaseToken,

        p_lease_minutes:
          Number(
            leaseMinutes,
          ),
      },
    );


  if (error) {
    return executionRpcError(
      error.message ?? "",
      "EXECUTION_RENEW_FAILED",
    );
  }


  const execution =
    safeRpcRow(data);


  if (!execution) {
    return jsonError(
      "EXECUTION_RENEW_RESULT_INVALID",
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
