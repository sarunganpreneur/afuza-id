import { NextRequest, NextResponse } from "next/server";
import {
  requireOpsApiAccess,
  requireOpsJsonMutation,
} from "@/lib/ops/api";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { APPROVAL_POLICIES } from "@/lib/ops/approvals-registry";

const VALID_RISKS = new Set([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

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

type ApprovalRow = {
  id: string;
  action_type: string;
  title: string;
  requester: string;
  requester_type: string;
  requester_id: string | null;
  idempotency_key: string | null;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  payload_summary: Record<string, unknown>;
  execution_reference: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  execution_enabled: boolean;
};

type ApprovalEventRow = {
  id: string;
  approval_id: string;
  event_type: "CREATED" | "APPROVED" | "REJECTED" | "EXPIRED";
  actor_type: string;
  actor_id: string | null;
  actor_user_id: string | null;
  previous_status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | null;
  new_status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function GET() {
  const gate = await requireOpsApiAccess();

  if (gate.response) {
    return gate.response;
  }

  const supabase = await getServiceRoleClient();

  if (!supabase) {
    return jsonError(
      "SERVICE_ROLE_UNAVAILABLE",
      503,
    );
  }

  const [
    approvalsResult,
    eventsResult,
  ] = await Promise.all([
    supabase
      .from("ops_approval_requests")
      .select(
        [
          "id",
          "action_type",
          "title",
          "requester",
          "requester_type",
          "requester_id",
          "idempotency_key",
          "risk",
          "status",
          "payload_summary",
          "execution_reference",
          "created_by",
          "created_at",
          "expires_at",
          "decided_at",
          "decided_by",
          "decision_reason",
          "execution_enabled",
        ].join(","),
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(250),

    supabase
      .from("ops_approval_events")
      .select(
        [
          "id",
          "approval_id",
          "event_type",
          "actor_type",
          "actor_id",
          "actor_user_id",
          "previous_status",
          "new_status",
          "reason",
          "metadata",
          "created_at",
        ].join(","),
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(500),
  ]);

  if (approvalsResult.error) {
    return jsonError(
      "APPROVAL_READ_FAILED",
      500,
      approvalsResult.error.message,
    );
  }

  if (eventsResult.error) {
    return jsonError(
      "APPROVAL_EVENT_READ_FAILED",
      500,
      eventsResult.error.message,
    );
  }

  const approvals =
    (approvalsResult.data ?? []) as unknown as ApprovalRow[];

  const events =
    (eventsResult.data ?? []) as unknown as ApprovalEventRow[];

  const pending = approvals.filter(
    (approval) =>
      approval.status === "PENDING",
  );

  return NextResponse.json(
    {
      summary: {
        total: approvals.length,

        pending: pending.length,

        high_risk_pending:
          pending.filter(
            (approval) =>
              approval.risk === "HIGH" ||
              approval.risk === "CRITICAL",
          ).length,

        approved:
          approvals.filter(
            (approval) =>
              approval.status === "APPROVED",
          ).length,

        rejected:
          approvals.filter(
            (approval) =>
              approval.status === "REJECTED",
          ).length,

        expired:
          approvals.filter(
            (approval) =>
              approval.status === "EXPIRED",
          ).length,
      },

      approvals,
      events,
      policies: APPROVAL_POLICIES,

      control: {
        persistence_enabled: true,
        decisions_enabled: true,

        // CRITICAL SAFETY LOCK
        execution_enabled: false,

        mode:
          "PERSISTED_APPROVALS_NO_EXECUTION",

        note:
          "Approval state is persisted and auditable. APPROVED does not execute external actions.",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(
  request: NextRequest,
) {
  const gate = await requireOpsApiAccess();

  if (gate.response) {
    return gate.response;
  }

  const mutationError =
    requireOpsJsonMutation(request);

  if (mutationError) {
    return mutationError;
  }

  const access = gate.access;

  if (!access?.userId || !access?.email) {
    return jsonError(
      "OPS_IDENTITY_UNAVAILABLE",
      401,
    );
  }

  const idempotencyKey =
    request.headers
      .get("idempotency-key")
      ?.trim() ?? "";

  if (!idempotencyKey) {
    return jsonError(
      "IDEMPOTENCY_KEY_REQUIRED",
      400,
    );
  }

  if (
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
  ) {
    return jsonError(
      "INVALID_IDEMPOTENCY_KEY",
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

  const actionType =
    typeof body.action_type === "string"
      ? body.action_type.trim()
      : "";

  const title =
    typeof body.title === "string"
      ? body.title.trim()
      : "";

  const risk =
    typeof body.risk === "string"
      ? body.risk
          .trim()
          .toUpperCase()
      : "";

  const payloadSummary =
    body.payload_summary &&
    typeof body.payload_summary ===
      "object" &&
    !Array.isArray(body.payload_summary)
      ? body.payload_summary
      : {};

  const executionReference =
    body.execution_reference === null ||
    body.execution_reference ===
      undefined
      ? null
      : body.execution_reference;

  const expiresAt =
    typeof body.expires_at === "string" &&
    body.expires_at.trim()
      ? body.expires_at
      : null;

  if (!actionType || !title) {
    return jsonError(
      "APPROVAL_IDENTITY_REQUIRED",
      400,
    );
  }

  if (!VALID_RISKS.has(risk)) {
    return jsonError(
      "INVALID_APPROVAL_RISK",
      400,
    );
  }

  if (
    executionReference !== null &&
    (typeof executionReference !==
      "object" ||
      Array.isArray(executionReference))
  ) {
    return jsonError(
      "INVALID_EXECUTION_REFERENCE",
      400,
    );
  }

  if (
    expiresAt &&
    Number.isNaN(
      new Date(expiresAt).getTime(),
    )
  ) {
    return jsonError(
      "INVALID_EXPIRY",
      400,
    );
  }

  const policy =
    APPROVAL_POLICIES.find(
      (entry) =>
        entry.action_type ===
        actionType,
    );

  /*
   * Do not allow a browser request to
   * downgrade a registered policy's
   * risk classification.
   */
  const riskOrder = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  } as const;

  let effectiveRisk =
    risk as keyof typeof riskOrder;

  if (
    policy &&
    riskOrder[
      policy.default_risk
    ] > riskOrder[effectiveRisk]
  ) {
    effectiveRisk =
      policy.default_risk;
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
      "ops_create_approval",
      {
        p_action_type: actionType,
        p_title: title,

        // requester is derived from
        // authenticated OPS identity,
        // not trusted from browser body.
        p_requester: access.email,
        p_requester_type: "USER",
        p_requester_id:
          access.userId,

        p_risk: effectiveRisk,
        p_idempotency_key:
          idempotencyKey,
        p_payload_summary:
          payloadSummary,
        p_execution_reference:
          executionReference,
        p_expires_at: expiresAt,
        p_created_by:
          access.userId,
      },
    );

  if (error) {
    const message =
      error.message ?? "";

    if (
      message.includes(
        "Approval idempotency key conflict",
      )
    ) {
      return jsonError(
        "IDEMPOTENCY_CONFLICT",
        409,
        message,
      );
    }

    return jsonError(
      "APPROVAL_CREATE_FAILED",
      500,
      message,
    );
  }

  const rpcData =
    data as unknown;

  const rpcResult =
    Array.isArray(rpcData)
      ? rpcData[0]
      : rpcData;

  const result =
    rpcResult &&
    typeof rpcResult === "object"
      ? (rpcResult as Record<string, unknown>)
      : null;

  const approvalId =
    typeof result?.approval_id === "string"
      ? result.approval_id
      : null;

  const createdNew =
    result?.created_new === true;

  if (!approvalId) {
    return jsonError(
      "APPROVAL_CREATE_RESULT_INVALID",
      500,
    );
  }

  return NextResponse.json(
    {
      approval_id: approvalId,

      status: "PENDING",

      created_new:
        createdNew,

      replayed:
        !createdNew,

      idempotency_key:
        idempotencyKey,

      execution_enabled: false,

      safety:
        "Approval persistence only. No external action was executed.",
    },
    {
      status:
        createdNew
          ? 201
          : 200,

      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
