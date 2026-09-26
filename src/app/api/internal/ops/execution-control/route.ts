import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireOpsApiAccess,
  requireOpsApiPermission,
  requireOpsJsonMutation,
} from "@/lib/ops/api";

import {
  getServiceRoleClient,
} from "@/lib/supabase/service-role";


type ControlAction =
  | "ARM_MASTER"
  | "OPEN_GATE"
  | "SAFE_LOCK"
  | "EMERGENCY_STOP";


type AtomicControlResult = {
  request_id: string;
  outcome_code: string;
  replayed: boolean;
  changed: boolean;

  master_execution_enabled: boolean;
  emergency_stop: boolean;
  gate_open: boolean;

  reason: string | null;
  updated_by: string | null;
  updated_at: string | null;
  version: number | string;

  idempotency_key: string;
};


function jsonError(
  error: string,
  status: number,
  detail?: string,
) {
  return NextResponse.json(
    {
      error,
      ...(detail
        ? {
            detail,
          }
        : {}),
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}


function isControlAction(
  value: string,
): value is ControlAction {
  return (
    value ===
      "ARM_MASTER" ||
    value ===
      "OPEN_GATE" ||
    value ===
      "SAFE_LOCK" ||
    value ===
      "EMERGENCY_STOP"
  );
}


function outcomeHttpStatus(
  outcome: string,
) {
  switch (outcome) {
    case "APPLIED":
    case "NO_CHANGE":
      return 200;

    case "EXPECTED_VERSION_REQUIRED":
      return 400;

    case "CONTROL_VERSION_CONFLICT":
    case "INVALID_TRANSITION":
    case "IDEMPOTENCY_KEY_CONFLICT":
      return 409;

    default:
      return 500;
  }
}


export async function GET() {
  const gate =
    await requireOpsApiAccess();

  if (gate.response) {
    return gate.response;
  }


  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return jsonError(
      "SERVICE_ROLE_UNAVAILABLE",
      503,
    );
  }


  // Execution Gate schema is newer than
  // generated Supabase Database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;


  const {
    data,
    error,
  } =
    await db
      .from(
        "ops_execution_controls",
      )
      .select(
        [
          "master_execution_enabled",
          "emergency_stop",
          "reason",
          "updated_by",
          "updated_at",
          "version",
        ].join(","),
      )
      .eq(
        "singleton_id",
        true,
      )
      .maybeSingle();


  if (
    error ||
    !data
  ) {
    return jsonError(
      "OPS_EXECUTION_CONTROL_QUERY_FAILED",
      500,
      error?.message,
    );
  }


  return NextResponse.json(
    {
      control: {
        master_execution_enabled:
          data
            .master_execution_enabled,

        emergency_stop:
          data
            .emergency_stop,

        gate_open:
          data
            .master_execution_enabled ===
              true &&
          data
            .emergency_stop !==
              true,

        reason:
          data.reason,

        updated_by:
          data.updated_by,

        updated_at:
          data.updated_at,

        version:
          data.version,

        changed:
          false,
      },
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}


export async function POST(
  request: NextRequest,
) {
  /*
   * Master / emergency execution control
   * requires the highest Ops permission.
   */
  const gate =
    await requireOpsApiPermission(
      "OPS_ADMIN",
    );

  if (gate.response) {
    return gate.response;
  }


  /*
   * CSRF / origin / content-type gate.
   */
  const mutationError =
    requireOpsJsonMutation(
      request,
    );

  if (mutationError) {
    return mutationError;
  }


  const actorUserId =
    gate.access?.userId;

  if (!actorUserId) {
    return jsonError(
      "OPS_IDENTITY_UNAVAILABLE",
      401,
    );
  }


  /*
   * Durable idempotency begins here.
   *
   * The key is no longer merely a
   * transport-level requirement.
   * It is persisted by the atomic DB RPC.
   */
  const idempotencyKey =
    (
      request.headers.get(
        "idempotency-key",
      ) ?? ""
    ).trim();


  if (
    idempotencyKey.length <
      8 ||
    idempotencyKey.length >
      200
  ) {
    return jsonError(
      "IDEMPOTENCY_KEY_REQUIRED",
      400,
    );
  }


  if (
    !/^[A-Za-z0-9._:-]+$/.test(
      idempotencyKey,
    )
  ) {
    return jsonError(
      "IDEMPOTENCY_KEY_INVALID",
      400,
    );
  }


  const body =
    await request
      .json()
      .catch(
        () => null,
      );


  if (
    !body ||
    typeof body !==
      "object"
  ) {
    return jsonError(
      "INVALID_REQUEST",
      400,
    );
  }


  const mode =
    typeof body.mode ===
      "string"
      ? body.mode
          .trim()
          .toUpperCase()
      : "";


  if (
    mode !==
    "CONTROL_PLANE_ONLY"
  ) {
    return jsonError(
      "INVALID_EXECUTION_MODE",
      400,
    );
  }


  const rawAction =
    typeof body.action ===
      "string"
      ? body.action
          .trim()
          .toUpperCase()
      : "";


  if (
    !isControlAction(
      rawAction,
    )
  ) {
    return jsonError(
      "INVALID_CONTROL_ACTION",
      400,
    );
  }


  const action =
    rawAction;


  const reason =
    typeof body.reason ===
      "string"
      ? body.reason.trim()
      : "";


  if (!reason) {
    return jsonError(
      "CONTROL_REASON_REQUIRED",
      400,
    );
  }


  if (
    reason.length >
    500
  ) {
    return jsonError(
      "CONTROL_REASON_TOO_LONG",
      400,
    );
  }


  /*
   * Enabling transitions still require
   * explicit typed confirmation.
   *
   * Safety transitions deliberately do
   * not require confirmation.
   */
  const confirmation =
    typeof body.confirmation ===
      "string"
      ? body.confirmation.trim()
      : "";


  if (
    action ===
      "ARM_MASTER" &&
    confirmation !==
      "ARM MASTER"
  ) {
    return jsonError(
      "ARM_MASTER_CONFIRMATION_REQUIRED",
      400,
    );
  }


  if (
    action ===
      "OPEN_GATE" &&
    confirmation !==
      "OPEN EXECUTION GATE"
  ) {
    return jsonError(
      "OPEN_GATE_CONFIRMATION_REQUIRED",
      400,
    );
  }


  /*
   * expected_version is only required for
   * enabling actions.
   *
   * SAFE_LOCK and EMERGENCY_STOP pass NULL
   * into the canonical DB request so stale
   * browser state can never block fail-close.
   */
  let expectedVersion:
    | number
    | null =
    null;


  if (
    action ===
      "ARM_MASTER" ||
    action ===
      "OPEN_GATE"
  ) {
    const rawExpected =
      body.expected_version;


    if (
      typeof rawExpected !==
        "number" ||
      !Number.isSafeInteger(
        rawExpected,
      ) ||
      rawExpected < 0
    ) {
      return jsonError(
        "EXPECTED_VERSION_REQUIRED",
        400,
      );
    }


    expectedVersion =
      rawExpected;
  }


  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return jsonError(
      "SERVICE_ROLE_UNAVAILABLE",
      503,
    );
  }


  // Atomic control RPC is newer than
  // generated database typings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;


  /*
   * CRITICAL V1D-0 INVARIANT:
   *
   * No pre-read/version comparison occurs
   * here.
   *
   * Idempotency claim, row lock,
   * expected_version check, state-machine
   * validation, mutation, audit event and
   * durable result are performed inside one
   * database transaction by:
   *
   * ops_apply_execution_control_action()
   */
  const {
    data,
    error,
  } =
    await db.rpc(
      "ops_apply_execution_control_action",
      {
        p_action:
          action,

        p_expected_version:
          expectedVersion,

        p_reason:
          reason,

        p_actor_user_id:
          actorUserId,

        p_idempotency_key:
          idempotencyKey,
      },
    );


  if (error) {
    const message =
      error.message ??
      "";


    if (
      message.includes(
        "OPS_ADMIN permission required",
      )
    ) {
      return jsonError(
        "FORBIDDEN",
        403,
      );
    }


    return jsonError(
      "EXECUTION_CONTROL_ATOMIC_RPC_FAILED",
      500,
      message,
    );
  }


  const result:
    | AtomicControlResult
    | null =
    Array.isArray(data)
      ? (
          data[0] ??
          null
        )
      : (
          data ??
          null
        );


  if (!result) {
    return jsonError(
      "EXECUTION_CONTROL_RESULT_MISSING",
      500,
    );
  }


  const status =
    outcomeHttpStatus(
      result
        .outcome_code,
    );


  const control = {
    master_execution_enabled:
      result
        .master_execution_enabled,

    emergency_stop:
      result
        .emergency_stop,

    gate_open:
      result.gate_open,

    reason:
      result.reason,

    updated_by:
      result.updated_by,

    updated_at:
      result.updated_at,

    version:
      result.version,

    changed:
      result.changed,
  };


  return NextResponse.json(
    {
      ...(status >= 400
        ? {
            error:
              result
                .outcome_code,
          }
        : {}),

      action,

      outcome_code:
        result
          .outcome_code,

      request_id:
        result
          .request_id,

      idempotency_key:
        result
          .idempotency_key,

      replayed:
        result.replayed,

      changed:
        result.changed,

      control,

      safety: {
        atomic_database_control:
          true,

        durable_idempotency:
          true,

        external_action_triggered:
          false,

        executor_handoff:
          false,
      },
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
