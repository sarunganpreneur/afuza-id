import "server-only";

import { NextRequest } from "next/server";

import { getServiceRoleClient } from "@/lib/supabase/service-role";

import {
  authenticateLeadEngineRequest,
  LEAD_ENGINE_AUTH_RESULT,
} from "../../_lib/auth";
import { normalizeLeadInput, requestHash } from "../../_lib/normalize";
import { jsonError, jsonOk } from "../../_lib/response";
import { LeadUpsertSchema } from "../../_lib/schemas";
import { upsertCommercialLead } from "../../_lib/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return jsonError(400, "MALFORMED_JSON");
  }

  const parsed = LeadUpsertSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return jsonError(400, "INVALID_LEAD_PAYLOAD");
  }

  let normalized;
  try {
    normalized = normalizeLeadInput(parsed.data);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_WHATSAPP") {
      return jsonError(400, "INVALID_WHATSAPP");
    }
    return jsonError(400, "LEAD_NORMALIZATION_FAILED");
  }

  const supabase = await getServiceRoleClient();
  if (!supabase) {
    return jsonError(503, "SERVICE_ROLE_UNAVAILABLE");
  }

  const workflowId = request.headers.get("x-afuza-workflow-id")?.trim() || "WF-01";
  const eventKey = `wf01:${idempotencyKey}`;
  const hash = requestHash(normalized);

  // Commercial-domain tables are newer than the current generated Supabase types.
  // Keep the escape local to this route boundary; do not alter the shared client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  try {
    const result = await upsertCommercialLead(db, normalized, {
      eventKey,
      requestHash: hash,
      actorReference: workflowId,
    });

    if (result.kind === "DUPLICATE_CONTACT") {
      return jsonError(409, "DUPLICATE_CONTACT", undefined, {
        existing_lead_id: result.existingLeadId,
      });
    }

    if (result.kind === "IDEMPOTENCY_CONFLICT") {
      return jsonError(409, "IDEMPOTENCY_CONFLICT");
    }

    if (result.kind === "DATABASE_ERROR") {
      console.warn(
        JSON.stringify({
          route: "/api/internal/lead-engine/v1/leads/upsert",
          operation: result.operation,
          database_error_code: result.code ?? "UNKNOWN",
        }),
      );

      return jsonError(500, "LEAD_UPSERT_FAILED");
    }

    return jsonOk(
      {
        lead: result.lead,
        created_new: result.createdNew,
        replayed: result.replayed,
        changed_fields: result.changedFields,
        next_action: result.lead.do_not_contact ? "SUPPRESSED" : "SCORE",
      },
      result.createdNew && !result.replayed ? 201 : 200,
    );
  } catch {
    console.warn(
      JSON.stringify({
        route: "/api/internal/lead-engine/v1/leads/upsert",
        operation: "unhandled_exception",
        database_error_code: "LEAD_UPSERT_EXCEPTION",
      }),
    );

    return jsonError(500, "LEAD_UPSERT_FAILED");
  }
}
