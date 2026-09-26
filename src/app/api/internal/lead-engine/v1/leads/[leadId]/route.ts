import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";

import {
  authenticateLeadEngineRequest,
  LEAD_ENGINE_AUTH_RESULT,
} from "../../_lib/auth";
import { jsonError, jsonOk } from "../../_lib/response";
import { LeadIdSchema } from "../../_lib/schemas";

export const runtime = "nodejs";

const LEAD_SELECT = [
  "id",
  "lead_id",
  "business_name",
  "category",
  "city",
  "phone",
  "whatsapp",
  "website",
  "instagram",
  "google_maps_url",
  "source",
  "raw_source_id",
  "notes",
  "observation",
  "rating",
  "review_count",
  "has_no_website",
  "website_low_quality",
  "has_public_whatsapp",
  "public_contact_verified",
  "google_maps_active",
  "instagram_active",
  "recent_reviews",
  "clear_offer",
  "business_active",
  "do_not_contact",
  "score",
  "score_rule_version",
  "priority",
  "pipeline_stage",
  "qualified_at",
  "last_contacted_at",
  "followup_count",
  "next_followup_at",
  "converted_business_id",
  "converted_order_id",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

export async function GET(
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

  const params = await context.params;
  const parsedLeadId = LeadIdSchema.safeParse(params.leadId);
  if (!parsedLeadId.success) {
    return jsonError(400, "INVALID_LEAD_ID");
  }

  const supabase = await getServiceRoleClient();
  if (!supabase) {
    return jsonError(503, "SERVICE_ROLE_UNAVAILABLE");
  }

  // Local escape until generated Supabase types include the commercial domain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const result = await db
    .from("commercial_leads")
    .select(LEAD_SELECT)
    .eq("lead_id", parsedLeadId.data)
    .maybeSingle();

  if (result.error) {
    return jsonError(500, "LEAD_READ_FAILED");
  }

  if (!result.data) {
    return jsonError(404, "LEAD_NOT_FOUND");
  }

  return jsonOk({ lead: result.data });
}
