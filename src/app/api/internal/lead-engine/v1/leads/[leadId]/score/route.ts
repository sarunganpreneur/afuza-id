import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";

import {
  authenticateLeadEngineRequest,
  LEAD_ENGINE_AUTH_RESULT,
} from "../../../_lib/auth";
import { jsonError, jsonOk } from "../../../_lib/response";
import { LeadIdSchema } from "../../../_lib/schemas";
import { scoreCommercialLead } from "../../../_lib/score-store";

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

  if (idempotencyKey.length > 200) {
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

  const workflowId = request.headers.get("x-afuza-workflow-id")?.trim() || "WF-02";
  const eventKey = `wf02:${idempotencyKey}`;

  // Commercial-domain tables are newer than the current generated Supabase types.
  // Keep the escape local to this route boundary; do not alter the shared client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  try {
    const result = await scoreCommercialLead(db, parsedLeadId.data, {
      eventKey,
      actorReference: workflowId,
    });

    if (result.kind === "NOT_FOUND") {
      return jsonError(404, "LEAD_NOT_FOUND");
    }

    if (result.kind === "IDEMPOTENCY_CONFLICT") {
      return jsonError(409, "IDEMPOTENCY_CONFLICT");
    }

    if (result.kind === "DATABASE_ERROR") {
      console.warn(
        JSON.stringify({
          route: "/api/internal/lead-engine/v1/leads/[leadId]/score",
          operation: result.operation,
          database_error_code: result.code ?? "UNKNOWN",
        }),
      );

      return jsonError(500, "LEAD_SCORE_FAILED");
    }

    return jsonOk({
      lead: result.lead,
      score: result.scoreResult.score,
      priority: result.scoreResult.priority,
      qualified: result.scoreResult.qualified,
      suppressed: result.scoreResult.suppressed,
      score_rule_version: result.scoreResult.scoreRuleVersion,
      score_breakdown: result.scoreResult.breakdown,
      qualification_blockers: result.scoreResult.qualificationBlockers,
      previous_stage: result.previousStage,
      pipeline_stage: result.lead.pipeline_stage,
      replayed: result.replayed,
      changed_fields: result.changedFields,
      next_action: result.nextAction,
    });
  } catch {
    console.warn(
      JSON.stringify({
        route: "/api/internal/lead-engine/v1/leads/[leadId]/score",
        operation: "unhandled_exception",
        database_error_code: "LEAD_SCORE_EXCEPTION",
      }),
    );

    return jsonError(500, "LEAD_SCORE_FAILED");
  }
}
