import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";

import {
  authenticateLeadEngineRequest,
  LEAD_ENGINE_AUTH_RESULT,
} from "../../../_lib/auth";
import { createFirstContactApproval } from "../../../_lib/approval-store";
import { jsonError, jsonOk } from "../../../_lib/response";
import { LeadIdSchema } from "../../../_lib/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  const auth = authenticateLeadEngineRequest(request);

  if (auth === LEAD_ENGINE_AUTH_RESULT.UNAUTHORIZED) {
    return jsonError(401, "UNAUTHORIZED");
  }

  if (auth === LEAD_ENGINE_AUTH_RESULT.MISCONFIGURED) {
    return jsonError(503, "LEAD_ENGINE_AUTH_UNAVAILABLE");
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!idempotencyKey) {
    return jsonError(400, "IDEMPOTENCY_KEY_REQUIRED");
  }

  if (
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 194 ||
    !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
  ) {
    return jsonError(400, "IDEMPOTENCY_KEY_INVALID");
  }

  const params = await context.params;
  const parsedLeadId = LeadIdSchema.safeParse(params.leadId);
  if (!parsedLeadId.success) {
    return jsonError(400, "INVALID_LEAD_ID");
  }

  const supabase = await getServiceRoleClient();
  if (!supabase) {
    return jsonError(503, "SERVICE_ROLE_UNAVAILABLE");
  }

  const workflowId = request.headers.get("x-afuza-workflow-id")?.trim() || "WF-03";
  const eventKey = `wf03:${idempotencyKey}`;

  // Commercial-domain + Ops tables are newer than generated DB types.
  // Keep this server-only escape local to the route boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  try {
    const result = await createFirstContactApproval(db, parsedLeadId.data, {
      eventKey,
      actorReference: workflowId,
    });

    if (result.kind === "NOT_FOUND") {
      return jsonError(404, "LEAD_NOT_FOUND");
    }

    if (result.kind === "NOT_ELIGIBLE") {
      return jsonError(409, "APPROVAL_NOT_ELIGIBLE", undefined, {
        blocker: result.blocker,
      });
    }

    if (result.kind === "IDEMPOTENCY_CONFLICT") {
      return jsonError(409, "IDEMPOTENCY_CONFLICT");
    }

    if (result.kind === "DATABASE_ERROR") {
      console.warn(
        JSON.stringify({
          route: "/api/internal/lead-engine/v1/leads/[leadId]/approval",
          operation: result.operation,
          database_error_code: result.code ?? "UNKNOWN",
        }),
      );
      return jsonError(500, "APPROVAL_REQUEST_FAILED");
    }

    return jsonOk(
      {
        lead: result.lead,
        approval: result.approval,
        approval_id: result.approval.id,
        status: result.approval.status,
        created_new: result.createdNew,
        replayed: result.replayed,
        pipeline_stage: result.lead.pipeline_stage,
        next_action: result.nextAction,
        execution_triggered: false,
        safety: "Approval persistence only. No external action was executed.",
      },
      result.replayed ? 200 : result.createdNew ? 201 : 200,
    );
  } catch {
    console.warn(
      JSON.stringify({
        route: "/api/internal/lead-engine/v1/leads/[leadId]/approval",
        operation: "unhandled_exception",
        database_error_code: "WF03_APPROVAL_EXCEPTION",
      }),
    );
    return jsonError(500, "APPROVAL_REQUEST_FAILED");
  }
}
