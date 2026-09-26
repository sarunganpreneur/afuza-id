import { requestHash } from "./normalize";
import {
  evaluateFirstContactEligibility,
  FIRST_CONTACT_APPROVAL_ACTION,
  FIRST_CONTACT_APPROVAL_RISK,
  FIRST_CONTACT_CHANNEL,
  type FirstContactEligibilityBlocker,
} from "./approval";
import type { CommercialLeadRow } from "./store";

// Commercial-domain and Ops approval tables are newer than the current
// generated Supabase types. Keep the escape local until generated types refresh.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommercialDb = any;

type OpsApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

type OpsApprovalRow = {
  id: string;
  action_type: string;
  title: string;
  requester: string;
  requester_type: string;
  requester_id: string | null;
  idempotency_key: string | null;
  risk: string;
  status: OpsApprovalStatus;
  payload_summary: Record<string, unknown>;
  execution_reference: Record<string, unknown> | null;
  created_at: string;
  expires_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  execution_enabled: boolean;
};

export type ApprovalCreateSuccess = {
  kind: "SUCCESS";
  lead: CommercialLeadRow;
  approval: OpsApprovalRow;
  createdNew: boolean;
  replayed: boolean;
  nextAction: "WAIT_APPROVAL";
};

export type ApprovalCreateFailure =
  | { kind: "NOT_FOUND" }
  | { kind: "NOT_ELIGIBLE"; blocker: FirstContactEligibilityBlocker }
  | { kind: "IDEMPOTENCY_CONFLICT" }
  | { kind: "DATABASE_ERROR"; operation: string; code?: string };

export type ApprovalCreateResult = ApprovalCreateSuccess | ApprovalCreateFailure;

export type ApprovalSyncSuccess = {
  kind: "SUCCESS";
  lead: CommercialLeadRow;
  approval: OpsApprovalRow;
  replayed: boolean;
  suppressed: boolean;
  changedFields: string[];
  previousStage: string;
  nextAction: "WAIT_APPROVAL" | "DRAFT_MESSAGE" | "SUPPRESSED" | "END" | "NONE";
};

export type ApprovalSyncFailure =
  | { kind: "NOT_FOUND"; resource: "LEAD" | "APPROVAL" }
  | { kind: "APPROVAL_MISMATCH" }
  | { kind: "IDEMPOTENCY_CONFLICT" }
  | { kind: "DATABASE_ERROR"; operation: string; code?: string };

export type ApprovalSyncResult = ApprovalSyncSuccess | ApprovalSyncFailure;

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

const APPROVAL_SELECT = [
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
  "created_at",
  "expires_at",
  "decided_at",
  "decided_by",
  "decision_reason",
  "execution_enabled",
].join(",");

async function readLead(db: CommercialDb, externalLeadId: string) {
  return db
    .from("commercial_leads")
    .select(LEAD_SELECT)
    .eq("lead_id", externalLeadId)
    .maybeSingle();
}

async function readApproval(db: CommercialDb, approvalId: string) {
  return db
    .from("ops_approval_requests")
    .select(APPROVAL_SELECT)
    .eq("id", approvalId)
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
    .eq("channel", FIRST_CONTACT_CHANNEL)
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
    .eq("channel", FIRST_CONTACT_CHANNEL)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (byContact.error) {
    return { suppressed: false, errorCode: byContact.error.code };
  }

  return { suppressed: Boolean(byContact.data) };
}

function approvalSnapshot(lead: CommercialLeadRow) {
  return {
    lead_db_id: lead.id,
    lead_id: lead.lead_id,
    business_name: lead.business_name,
    source: lead.source,
    whatsapp: lead.whatsapp,
    score: lead.score,
    score_rule_version: lead.score_rule_version,
    priority: lead.priority,
    action_type: FIRST_CONTACT_APPROVAL_ACTION,
    risk: FIRST_CONTACT_APPROVAL_RISK,
    channel: FIRST_CONTACT_CHANNEL,
  };
}

function approvalPayload(lead: CommercialLeadRow) {
  return {
    lead_db_id: lead.id,
    lead_id: lead.lead_id,
    business_name: lead.business_name,
    category: lead.category,
    city: lead.city,
    source: lead.source,
    whatsapp: lead.whatsapp,
    score: lead.score,
    score_rule_version: lead.score_rule_version,
    priority: lead.priority,
    channel: FIRST_CONTACT_CHANNEL,
    purpose: "FIRST_CONTACT",
  };
}

async function readCommercialEvent(db: CommercialDb, eventKey: string) {
  return db
    .from("commercial_events")
    .select("id, lead_id, event_type, payload")
    .eq("idempotency_key", eventKey)
    .maybeSingle();
}

function approvalBelongsToLead(
  approval: OpsApprovalRow,
  lead: CommercialLeadRow,
): boolean {
  if (approval.action_type !== FIRST_CONTACT_APPROVAL_ACTION) {
    return false;
  }

  const payload = approval.payload_summary ?? {};
  return (
    payload.lead_id === lead.lead_id &&
    (payload.lead_db_id === undefined || payload.lead_db_id === lead.id)
  );
}

export async function createFirstContactApproval(
  db: CommercialDb,
  externalLeadId: string,
  options: {
    eventKey: string;
    actorReference: string;
  },
): Promise<ApprovalCreateResult> {
  const leadResult = await readLead(db, externalLeadId);

  if (leadResult.error) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_lead_for_approval",
      code: leadResult.error.code,
    };
  }

  if (!leadResult.data) {
    return { kind: "NOT_FOUND" };
  }

  const lead = leadResult.data as CommercialLeadRow;
  const hash = requestHash(approvalSnapshot(lead));
  const replayCheck = await readCommercialEvent(db, options.eventKey);

  if (replayCheck.error) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_approval_idempotency_event",
      code: replayCheck.error.code,
    };
  }

  if (replayCheck.data) {
    if (replayCheck.data.payload?.request_hash !== hash) {
      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    const approvalId = replayCheck.data.payload?.approval_id;
    if (typeof approvalId !== "string") {
      return {
        kind: "DATABASE_ERROR",
        operation: "read_replayed_approval_reference",
      };
    }

    const approvalResult = await readApproval(db, approvalId);
    if (approvalResult.error || !approvalResult.data) {
      return {
        kind: "DATABASE_ERROR",
        operation: "read_replayed_approval",
        code: approvalResult.error?.code,
      };
    }

    return {
      kind: "SUCCESS",
      lead,
      approval: approvalResult.data as OpsApprovalRow,
      createdNew: false,
      replayed: true,
      nextAction: "WAIT_APPROVAL",
    };
  }

  const suppression = await hasActiveWhatsappSuppression(db, lead);
  if (suppression.errorCode) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_contact_suppression_before_approval",
      code: suppression.errorCode,
    };
  }

  const eligibility = evaluateFirstContactEligibility(lead, {
    contactSuppressed: suppression.suppressed,
  });

  if (!eligibility.eligible) {
    return { kind: "NOT_ELIGIBLE", blocker: eligibility.blocker };
  }

  const opsIdempotencyKey = options.eventKey;
  const title = `Approve first contact — ${lead.business_name}`;
  const payloadSummary = approvalPayload(lead);
  const executionReference = {
    lead_db_id: lead.id,
    lead_id: lead.lead_id,
    channel: FIRST_CONTACT_CHANNEL,
    normalized_contact: lead.whatsapp,
    purpose: "FIRST_CONTACT",
  };

  const rpcResult = await db.rpc("ops_create_approval", {
    p_action_type: FIRST_CONTACT_APPROVAL_ACTION,
    p_title: title,
    p_requester: "AFUZA Lead Engine",
    p_requester_type: "SYSTEM",
    p_requester_id: "WF-03",
    p_risk: FIRST_CONTACT_APPROVAL_RISK,
    p_idempotency_key: opsIdempotencyKey,
    p_payload_summary: payloadSummary,
    p_execution_reference: executionReference,
    p_expires_at: null,
    p_created_by: null,
  });

  if (rpcResult.error) {
    const message = rpcResult.error.message ?? "";
    if (message.includes("Approval idempotency key conflict")) {
      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    return {
      kind: "DATABASE_ERROR",
      operation: "ops_create_approval",
      code: rpcResult.error.code,
    };
  }

  const rawRpc = Array.isArray(rpcResult.data)
    ? rpcResult.data[0]
    : rpcResult.data;
  const rpcRecord =
    rawRpc && typeof rawRpc === "object"
      ? (rawRpc as Record<string, unknown>)
      : null;
  const approvalId =
    typeof rpcRecord?.approval_id === "string"
      ? rpcRecord.approval_id
      : null;
  const createdNew = rpcRecord?.created_new === true;

  if (!approvalId) {
    return {
      kind: "DATABASE_ERROR",
      operation: "ops_create_approval_result",
    };
  }

  const approvalResult = await readApproval(db, approvalId);
  if (approvalResult.error || !approvalResult.data) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_created_approval",
      code: approvalResult.error?.code,
    };
  }

  const eventInsert = await db.from("commercial_events").insert({
    lead_id: lead.id,
    event_type: "APPROVAL_REQUESTED",
    actor_type: "INTERNAL_API",
    actor_reference: options.actorReference,
    idempotency_key: options.eventKey,
    payload: {
      request_hash: hash,
      lead_id: lead.lead_id,
      approval_id: approvalId,
      action_type: FIRST_CONTACT_APPROVAL_ACTION,
      risk: FIRST_CONTACT_APPROVAL_RISK,
      channel: FIRST_CONTACT_CHANNEL,
      approval_created_new: createdNew,
      approval_status: "PENDING",
      pipeline_stage: lead.pipeline_stage,
      next_action: "WAIT_APPROVAL",
    },
  });

  if (eventInsert.error) {
    if (eventInsert.error.code === "23505") {
      const racedReplay = await readCommercialEvent(db, options.eventKey);
      if (
        !racedReplay.error &&
        racedReplay.data?.payload?.request_hash === hash
      ) {
        return {
          kind: "SUCCESS",
          lead,
          approval: approvalResult.data as OpsApprovalRow,
          createdNew,
          replayed: true,
          nextAction: "WAIT_APPROVAL",
        };
      }

      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    return {
      kind: "DATABASE_ERROR",
      operation: "insert_approval_requested_event",
      code: eventInsert.error.code,
    };
  }

  return {
    kind: "SUCCESS",
    lead,
    approval: approvalResult.data as OpsApprovalRow,
    createdNew,
    replayed: !createdNew,
    nextAction: "WAIT_APPROVAL",
  };
}

export async function syncFirstContactApproval(
  db: CommercialDb,
  externalLeadId: string,
  approvalId: string,
  options: { actorReference: string },
): Promise<ApprovalSyncResult> {
  const leadResult = await readLead(db, externalLeadId);
  if (leadResult.error) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_lead_for_approval_sync",
      code: leadResult.error.code,
    };
  }

  if (!leadResult.data) {
    return { kind: "NOT_FOUND", resource: "LEAD" };
  }

  const lead = leadResult.data as CommercialLeadRow;
  const approvalResult = await readApproval(db, approvalId);
  if (approvalResult.error) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_approval_for_sync",
      code: approvalResult.error.code,
    };
  }

  if (!approvalResult.data) {
    return { kind: "NOT_FOUND", resource: "APPROVAL" };
  }

  const approval = approvalResult.data as OpsApprovalRow;
  if (!approvalBelongsToLead(approval, lead)) {
    return { kind: "APPROVAL_MISMATCH" };
  }

  if (approval.status === "PENDING") {
    return {
      kind: "SUCCESS",
      lead,
      approval,
      replayed: false,
      suppressed: false,
      changedFields: [],
      previousStage: lead.pipeline_stage,
      nextAction: "WAIT_APPROVAL",
    };
  }

  const suppression = await hasActiveWhatsappSuppression(db, lead);
  if (suppression.errorCode) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_contact_suppression_before_approval_sync",
      code: suppression.errorCode,
    };
  }

  const suppressed =
    lead.do_not_contact ||
    lead.pipeline_stage === "DO_NOT_CONTACT" ||
    suppression.suppressed;

  const eventKey = `wf03sync:${approval.id}:${approval.status}`;
  const hash = requestHash({
    lead_db_id: lead.id,
    lead_id: lead.lead_id,
    approval_id: approval.id,
    status: approval.status,
    action_type: approval.action_type,
    suppressed,
  });

  const replayCheck = await readCommercialEvent(db, eventKey);
  if (replayCheck.error) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_approval_sync_event",
      code: replayCheck.error.code,
    };
  }

  if (replayCheck.data) {
    if (replayCheck.data.payload?.request_hash !== hash) {
      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    return {
      kind: "SUCCESS",
      lead,
      approval,
      replayed: true,
      suppressed: replayCheck.data.payload?.suppressed === true,
      changedFields: [],
      previousStage: replayCheck.data.payload?.previous_stage ?? lead.pipeline_stage,
      nextAction: replayCheck.data.payload?.next_action ?? "NONE",
    };
  }

  const previousStage = lead.pipeline_stage;
  const changedFields: string[] = [];
  let updatedLead = lead;
  let nextAction: ApprovalSyncSuccess["nextAction"] = "END";
  let eventType = "APPROVAL_REJECTED";

  if (approval.status === "APPROVED") {
    if (suppressed) {
      nextAction = "SUPPRESSED";
      eventType = "APPROVAL_APPROVED_BLOCKED";
    } else if (
      lead.pipeline_stage === "QUALIFIED" ||
      lead.pipeline_stage === "DISCOVERED"
    ) {
      const updateResult = await db
        .from("commercial_leads")
        .update({ pipeline_stage: "APPROVED_FOR_CONTACT" })
        .eq("id", lead.id)
        .select(LEAD_SELECT)
        .single();

      if (updateResult.error || !updateResult.data) {
        return {
          kind: "DATABASE_ERROR",
          operation: "advance_approved_lead",
          code: updateResult.error?.code,
        };
      }

      updatedLead = updateResult.data as CommercialLeadRow;
      changedFields.push("pipeline_stage");
      nextAction = "DRAFT_MESSAGE";
      eventType = "APPROVAL_APPROVED";
    } else if (lead.pipeline_stage === "APPROVED_FOR_CONTACT") {
      nextAction = "DRAFT_MESSAGE";
      eventType = "APPROVAL_APPROVED";
    } else {
      nextAction = "NONE";
      eventType = "APPROVAL_APPROVED";
    }
  } else if (approval.status === "EXPIRED") {
    nextAction = "END";
    eventType = "APPROVAL_EXPIRED";
  } else {
    nextAction = "END";
    eventType = "APPROVAL_REJECTED";
  }

  const eventInsert = await db.from("commercial_events").insert({
    lead_id: lead.id,
    event_type: eventType,
    actor_type: "INTERNAL_API",
    actor_reference: options.actorReference,
    idempotency_key: eventKey,
    payload: {
      request_hash: hash,
      lead_id: lead.lead_id,
      approval_id: approval.id,
      approval_status: approval.status,
      action_type: approval.action_type,
      risk: approval.risk,
      decision_reason: approval.decision_reason,
      execution_enabled: approval.execution_enabled,
      suppressed,
      previous_stage: previousStage,
      pipeline_stage: updatedLead.pipeline_stage,
      changed_fields: changedFields,
      next_action: nextAction,
    },
  });

  if (eventInsert.error) {
    if (eventInsert.error.code === "23505") {
      const racedReplay = await readCommercialEvent(db, eventKey);
      if (
        !racedReplay.error &&
        racedReplay.data?.payload?.request_hash === hash
      ) {
        return {
          kind: "SUCCESS",
          lead: updatedLead,
          approval,
          replayed: true,
          suppressed,
          changedFields,
          previousStage,
          nextAction,
        };
      }

      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    return {
      kind: "DATABASE_ERROR",
      operation: "insert_approval_sync_event",
      code: eventInsert.error.code,
    };
  }

  return {
    kind: "SUCCESS",
    lead: updatedLead,
    approval,
    replayed: false,
    suppressed,
    changedFields,
    previousStage,
    nextAction,
  };
}
