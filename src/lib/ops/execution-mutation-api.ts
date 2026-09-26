import "server-only";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireOpsApiPermission,
  requireOpsJsonMutation,
} from "@/lib/ops/api";

import {
  getServiceRoleClient,
} from "@/lib/supabase/service-role";


const IDEMPOTENCY_PATTERN =
  /^[A-Za-z0-9._:-]+$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/*
 * V1C uses a local untyped server-only view because
 * Execution Gate schema/RPCs are newer than the current
 * generated Supabase Database type snapshot.
 *
 * This NEVER crosses into Client Components.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExecutionDb = any;


export function jsonError(
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


export function isValidUuid(
  value: string,
) {
  return UUID_PATTERN.test(
    value,
  );
}


export function isPlainObject(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}


export function jsonPayloadWithinLimit(
  value: unknown,
  limit = 32_768,
) {
  try {
    return (
      JSON.stringify(value)
        .length <= limit
    );
  } catch {
    return false;
  }
}


export async function readJsonObject(
  request: NextRequest,
) {
  const body =
    await request
      .json()
      .catch(
        () => null,
      );

  return isPlainObject(body)
    ? body
    : null;
}


export function requireControlPlaneMode(
  body: Record<
    string,
    unknown
  >,
) {
  if (
    body.mode !==
    "CONTROL_PLANE_ONLY"
  ) {
    return jsonError(
      "CONTROL_PLANE_MODE_REQUIRED",
      400,
      "mode must be CONTROL_PLANE_ONLY",
    );
  }

  return null;
}


export async function requireExecutionMutation(
  request: NextRequest,
) {
  const gate =
    await requireOpsApiPermission(
      "OPS_CONTROL",
    );

  if (gate.response) {
    return {
      ok: false as const,
      response:
        gate.response,
    };
  }


  const mutationError =
    requireOpsJsonMutation(
      request,
    );

  if (mutationError) {
    return {
      ok: false as const,
      response:
        mutationError,
    };
  }


  if (
    !gate.access?.userId
  ) {
    return {
      ok: false as const,

      response:
        jsonError(
          "OPS_IDENTITY_UNAVAILABLE",
          401,
        ),
    };
  }


  const idempotencyKey =
    request.headers
      .get(
        "idempotency-key",
      )
      ?.trim() ??
    "";


  if (!idempotencyKey) {
    return {
      ok: false as const,

      response:
        jsonError(
          "IDEMPOTENCY_KEY_REQUIRED",
          400,
        ),
    };
  }


  if (
    idempotencyKey.length <
      8 ||
    idempotencyKey.length >
      200 ||
    !IDEMPOTENCY_PATTERN.test(
      idempotencyKey,
    )
  ) {
    return {
      ok: false as const,

      response:
        jsonError(
          "INVALID_IDEMPOTENCY_KEY",
          400,
        ),
    };
  }


  const supabase =
    await getServiceRoleClient();


  if (!supabase) {
    return {
      ok: false as const,

      response:
        jsonError(
          "SERVICE_ROLE_UNAVAILABLE",
          503,
        ),
    };
  }


  /*
   * Local server-only type escape.
   * Service-role credentials remain server-side.
   */
  const db =
    supabase as ExecutionDb;


  return {
    ok: true as const,

    access:
      gate.access,

    idempotencyKey,

    db,
  };
}


export function firstRpcRow(
  data: unknown,
) {
  const value =
    Array.isArray(data)
      ? data[0]
      : data;

  if (
    !isPlainObject(value)
  ) {
    return null;
  }

  return value;
}


export function safeRpcRow(
  data: unknown,
) {
  const row =
    firstRpcRow(data);

  if (!row) {
    return null;
  }

  /*
   * Defense in depth:
   * lease_token must never be returned
   * to browser clients.
   */
  const safe:
    Record<
      string,
      unknown
    > = {
      ...row,
    };

  delete safe.lease_token;

  return safe;
}


export function executionRpcError(
  message: string,
  fallback:
    string,
) {
  const upper =
    message.toUpperCase();


  if (
    upper.includes(
      "EXECUTION_NOT_FOUND",
    ) ||
    upper.includes(
      "APPROVAL_NOT_FOUND",
    )
  ) {
    return jsonError(
      upper.includes(
        "APPROVAL_NOT_FOUND",
      )
        ? "APPROVAL_NOT_FOUND"
        : "EXECUTION_NOT_FOUND",

      404,
      message,
    );
  }


  if (
    upper.includes(
      "IDEMPOTENCY",
    )
  ) {
    return jsonError(
      "IDEMPOTENCY_CONFLICT",
      409,
      message,
    );
  }


  if (
    upper.includes(
      "NOT_PREPARED",
    ) ||
    upper.includes(
      "NOT_EXECUTING",
    ) ||
    upper.includes(
      "NOT_CANCELLABLE",
    ) ||
    upper.includes(
      "ALREADY_HAS_EXECUTION",
    ) ||
    upper.includes(
      "APPROVAL_NOT_APPROVED",
    ) ||
    upper.includes(
      "APPROVAL_EXPIRED",
    ) ||
    upper.includes(
      "LEASE_TOKEN_MISMATCH",
    ) ||
    upper.includes(
      "LEASE_EXPIRED",
    )
  ) {
    return jsonError(
      "EXECUTION_STATE_CONFLICT",
      409,
      message,
    );
  }


  if (
    upper.includes(
      "OPS_CONTROL PERMISSION REQUIRED",
    )
  ) {
    return jsonError(
      "FORBIDDEN",
      403,
      message,
    );
  }


  return jsonError(
    fallback,
    500,
    message,
  );
}


export async function getServerLeaseToken(
  db: ExecutionDb,
  executionId:
    string,
) {
  const {
    data,
    error,
  } =
    await db
      .from(
        "ops_executions",
      )
      .select(
        "id, status, lease_token, lease_expires_at",
      )
      .eq(
        "id",
        executionId,
      )
      .maybeSingle();


  if (error) {
    return {
      ok: false as const,

      response:
        jsonError(
          "EXECUTION_LEASE_LOOKUP_FAILED",
          500,
          error.message,
        ),
    };
  }


  if (!data) {
    return {
      ok: false as const,

      response:
        jsonError(
          "EXECUTION_NOT_FOUND",
          404,
        ),
    };
  }


  if (
    typeof data.lease_token !==
      "string" ||
    !data.lease_token
  ) {
    return {
      ok: false as const,

      response:
        jsonError(
          "EXECUTION_LEASE_UNAVAILABLE",
          409,
        ),
    };
  }


  return {
    ok: true as const,

    leaseToken:
      data.lease_token as string,

    status:
      typeof data.status ===
        "string"
        ? data.status
        : null,

    leaseExpiresAt:
      typeof data.lease_expires_at ===
        "string"
        ? data.lease_expires_at
        : null,
  };
}
