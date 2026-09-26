import { requestHash } from "./normalize";
import {
  calculateLeadScore,
  type LeadScoreResult,
} from "./scoring";
import type { CommercialLeadRow } from "./store";

// Commercial-domain tables are newer than the current generated Supabase types.
// Keep this escape local to this module until generated DB types are refreshed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommercialDb = any;

export type ScoreStoreSuccess = {
  kind: "SUCCESS";
  lead: CommercialLeadRow;
  scoreResult: LeadScoreResult;
  replayed: boolean;
  changedFields: string[];
  previousStage: string;
  nextAction: "CREATE_APPROVAL" | "SUPPRESSED" | "END" | "NONE";
};

export type ScoreStoreFailure =
  | { kind: "NOT_FOUND" }
  | { kind: "IDEMPOTENCY_CONFLICT" }
  | { kind: "DATABASE_ERROR"; operation: string; code?: string };

export type ScoreStoreResult = ScoreStoreSuccess | ScoreStoreFailure;

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

const EARLY_SCORING_STAGES = new Set(["DISCOVERED", "QUALIFIED"]);

function scoreSnapshot(lead: CommercialLeadRow, contactSuppressed: boolean) {
  return {
    lead_id: lead.lead_id,
    rule_version: "lead-score-v1",
    has_no_website: lead.has_no_website,
    website_low_quality: lead.website_low_quality,
    has_public_whatsapp: lead.has_public_whatsapp,
    public_contact_verified: lead.public_contact_verified,
    google_maps_active: lead.google_maps_active,
    instagram_active: lead.instagram_active,
    recent_reviews: lead.recent_reviews,
    clear_offer: lead.clear_offer,
    business_active: lead.business_active,
    do_not_contact: lead.do_not_contact,
    whatsapp: lead.whatsapp,
    contact_suppressed: contactSuppressed,
  };
}

function nextPipelineStage(
  lead: CommercialLeadRow,
  scoreResult: LeadScoreResult,
): string {
  if (lead.do_not_contact || lead.pipeline_stage === "DO_NOT_CONTACT") {
    return "DO_NOT_CONTACT";
  }

  if (!EARLY_SCORING_STAGES.has(lead.pipeline_stage)) {
    return lead.pipeline_stage;
  }

  return scoreResult.qualified ? "QUALIFIED" : "DISCOVERED";
}

function nextAction(
  lead: CommercialLeadRow,
  scoreResult: LeadScoreResult,
  nextStage: string,
): ScoreStoreSuccess["nextAction"] {
  if (scoreResult.suppressed || nextStage === "DO_NOT_CONTACT") {
    return "SUPPRESSED";
  }

  if (scoreResult.qualified && nextStage === "QUALIFIED") {
    return "CREATE_APPROVAL";
  }

  if (!scoreResult.qualified && EARLY_SCORING_STAGES.has(lead.pipeline_stage)) {
    return "END";
  }

  return "NONE";
}

async function readScoreEvent(db: CommercialDb, eventKey: string) {
  return db
    .from("commercial_events")
    .select("id, lead_id, event_type, payload")
    .eq("idempotency_key", eventKey)
    .maybeSingle();
}

async function hasActiveWhatsappSuppression(
  db: CommercialDb,
  lead: CommercialLeadRow,
): Promise<{ suppressed: boolean; errorCode?: string }> {
  const byLead = await db
    .from("contact_suppression")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("channel", "WHATSAPP")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (byLead.error) {
    return { suppressed: false, errorCode: byLead.error.code };
  }

  if (byLead.data) {
    return { suppressed: true };
  }

  if (!lead.whatsapp) {
    return { suppressed: false };
  }

  const byContact = await db
    .from("contact_suppression")
    .select("id")
    .eq("normalized_contact", lead.whatsapp)
    .eq("channel", "WHATSAPP")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (byContact.error) {
    return { suppressed: false, errorCode: byContact.error.code };
  }

  return { suppressed: Boolean(byContact.data) };
}

export async function scoreCommercialLead(
  db: CommercialDb,
  externalLeadId: string,
  options: {
    eventKey: string;
    actorReference: string;
  },
): Promise<ScoreStoreResult> {
  const leadResult = await db
    .from("commercial_leads")
    .select(LEAD_SELECT)
    .eq("lead_id", externalLeadId)
    .maybeSingle();

  if (leadResult.error) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_lead_for_scoring",
      code: leadResult.error.code,
    };
  }

  if (!leadResult.data) {
    return { kind: "NOT_FOUND" };
  }

  const lead = leadResult.data as CommercialLeadRow;
  const suppression = await hasActiveWhatsappSuppression(db, lead);

  if (suppression.errorCode) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_contact_suppression",
      code: suppression.errorCode,
    };
  }

  const scoreResult = calculateLeadScore(lead, {
    contactSuppressed: suppression.suppressed,
  });
  const hash = requestHash(scoreSnapshot(lead, suppression.suppressed));
  const replayCheck = await readScoreEvent(db, options.eventKey);

  if (replayCheck.error) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_score_idempotency_event",
      code: replayCheck.error.code,
    };
  }

  const targetStage = nextPipelineStage(lead, scoreResult);
  const action = nextAction(lead, scoreResult, targetStage);

  if (replayCheck.data) {
    if (replayCheck.data.payload?.request_hash !== hash) {
      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    return {
      kind: "SUCCESS",
      lead,
      scoreResult,
      replayed: true,
      changedFields: [],
      previousStage: replayCheck.data.payload?.previous_stage ?? lead.pipeline_stage,
      nextAction: replayCheck.data.payload?.next_action ?? action,
    };
  }

  const updateRow: Record<string, unknown> = {};
  const changedFields: string[] = [];

  const setIfChanged = (field: keyof CommercialLeadRow, value: unknown) => {
    if (lead[field] !== value) {
      updateRow[field] = value;
      changedFields.push(field);
    }
  };

  setIfChanged("score", scoreResult.score);
  setIfChanged("score_rule_version", scoreResult.scoreRuleVersion);
  setIfChanged("priority", scoreResult.priority);
  setIfChanged("pipeline_stage", targetStage);

  if (targetStage === "QUALIFIED" && !lead.qualified_at) {
    updateRow.qualified_at = new Date().toISOString();
    changedFields.push("qualified_at");
  } else if (
    targetStage === "DISCOVERED" &&
    lead.pipeline_stage === "QUALIFIED" &&
    lead.qualified_at
  ) {
    updateRow.qualified_at = null;
    changedFields.push("qualified_at");
  }

  let updatedLead = lead;

  if (Object.keys(updateRow).length > 0) {
    const updateResult = await db
      .from("commercial_leads")
      .update(updateRow)
      .eq("id", lead.id)
      .select(LEAD_SELECT)
      .single();

    if (updateResult.error || !updateResult.data) {
      return {
        kind: "DATABASE_ERROR",
        operation: "update_scored_lead",
        code: updateResult.error?.code,
      };
    }

    updatedLead = updateResult.data as CommercialLeadRow;
  }

  const eventResult = await db.from("commercial_events").insert({
    lead_id: lead.id,
    event_type: "LEAD_SCORED",
    actor_type: "INTERNAL_API",
    actor_reference: options.actorReference,
    idempotency_key: options.eventKey,
    payload: {
      request_hash: hash,
      lead_id: lead.lead_id,
      score: scoreResult.score,
      priority: scoreResult.priority,
      qualified: scoreResult.qualified,
      suppressed: scoreResult.suppressed,
      score_rule_version: scoreResult.scoreRuleVersion,
      score_breakdown: scoreResult.breakdown,
      qualification_blockers: scoreResult.qualificationBlockers,
      previous_stage: lead.pipeline_stage,
      pipeline_stage: updatedLead.pipeline_stage,
      changed_fields: changedFields,
      next_action: action,
    },
  });

  if (eventResult.error) {
    if (eventResult.error.code === "23505") {
      const racedReplay = await readScoreEvent(db, options.eventKey);
      if (
        !racedReplay.error &&
        racedReplay.data?.payload?.request_hash === hash
      ) {
        return {
          kind: "SUCCESS",
          lead: updatedLead,
          scoreResult,
          replayed: true,
          changedFields,
          previousStage: lead.pipeline_stage,
          nextAction: action,
        };
      }

      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    return {
      kind: "DATABASE_ERROR",
      operation: "insert_lead_scored_event",
      code: eventResult.error.code,
    };
  }

  return {
    kind: "SUCCESS",
    lead: updatedLead,
    scoreResult,
    replayed: false,
    changedFields,
    previousStage: lead.pipeline_stage,
    nextAction: action,
  };
}
