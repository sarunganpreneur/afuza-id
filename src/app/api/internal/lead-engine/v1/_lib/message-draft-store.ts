import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  factualObservation,
  FIRST_CONTACT_MESSAGE_TYPE,
  MESSAGE_CHANNEL,
  MESSAGE_DRAFT_SCHEMA_VERSION,
  selectTemplateCode,
  stableHash,
  type DraftOffer,
  type MessageDraftProvider,
  validateDraftOutput,
} from "./message-draft";

type DbError = { code?: string; message?: string };

export type DraftRequest = {
  lead_id: string;
  offer: DraftOffer;
  cta: string;
  template_code?: string | null;
  idempotency_key: string;
  workflow_id: string;
};

type Lead = {
  id: string;
  lead_id: string;
  business_name: string;
  category: string | null;
  city: string | null;
  whatsapp: string | null;
  source: string;
  observation: string | null;
  has_no_website: boolean;
  website_low_quality: boolean;
  has_public_whatsapp: boolean;
  public_contact_verified: boolean;
  google_maps_active: boolean;
  recent_reviews: boolean;
  business_active: boolean;
  do_not_contact: boolean;
  score: number;
  priority: string;
  pipeline_stage: string;
};

type Outbound = {
  id: string;
  lead_id: string;
  channel: string;
  message_type: string;
  template_code: string | null;
  draft_payload: Record<string, unknown>;
  rendered_text: string;
  idempotency_key: string;
  status: string;
  drafted_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export class DraftStoreError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
    this.name = "DraftStoreError";
  }
}

const LEAD_SELECT = [
  "id",
  "lead_id",
  "business_name",
  "category",
  "city",
  "whatsapp",
  "source",
  "observation",
  "has_no_website",
  "website_low_quality",
  "has_public_whatsapp",
  "public_contact_verified",
  "google_maps_active",
  "recent_reviews",
  "business_active",
  "do_not_contact",
  "score",
  "priority",
  "pipeline_stage",
].join(",");

const OUTBOUND_SELECT = [
  "id",
  "lead_id",
  "channel",
  "message_type",
  "template_code",
  "draft_payload",
  "rendered_text",
  "idempotency_key",
  "status",
  "drafted_at",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

async function readActiveSuppression(
  supabase: Awaited<ReturnType<typeof getServiceRoleClient>>,
  lead: Lead,
): Promise<boolean> {
  if (!supabase) return true;

  let query = supabase
    .from("contact_suppression")
    .select("id")
    .eq("channel", MESSAGE_CHANNEL)
    .eq("active", true)
    .limit(1);

  if (lead.whatsapp) {
    query = query.eq("normalized_contact", lead.whatsapp);
  } else {
    query = query.eq("lead_id", lead.id);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new DraftStoreError("SUPPRESSION_CHECK_FAILED", 500);
  return Boolean(data);
}

async function readMessageByKey(
  supabase: NonNullable<Awaited<ReturnType<typeof getServiceRoleClient>>>,
  key: string,
): Promise<Outbound | null> {
  const { data, error } = await supabase
    .from("outbound_messages")
    .select(OUTBOUND_SELECT)
    .eq("idempotency_key", key)
    .maybeSingle();

  if (error) throw new DraftStoreError("OUTBOUND_READ_FAILED", 500);
  return (data as Outbound | null) ?? null;
}

async function ensureDraftEvent(
  supabase: NonNullable<Awaited<ReturnType<typeof getServiceRoleClient>>>,
  args: {
    eventKey: string;
    workflowId: string;
    lead: Lead;
    message: Outbound;
  },
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from("commercial_events")
    .select("id")
    .eq("idempotency_key", args.eventKey)
    .eq("event_type", "MESSAGE_DRAFTED")
    .limit(1)
    .maybeSingle();

  if (readError) throw new DraftStoreError("MESSAGE_EVENT_READ_FAILED", 500);
  if (existing) return;

  const payload = args.message.draft_payload ?? {};

  const { error } = await supabase
    .from("commercial_events")
    .insert({
      lead_id: args.lead.id,
      event_type: "MESSAGE_DRAFTED",
      actor_type: "INTERNAL_API",
      actor_reference: args.workflowId,
      idempotency_key: args.eventKey,
      payload: {
        request_hash: payload.request_hash ?? null,
        lead_id: args.lead.lead_id,
        message_id: args.message.id,
        message_type: args.message.message_type,
        template_code: args.message.template_code,
        status: args.message.status,
        risk_flags: payload.risk_flags ?? [],
        recommended_send: payload.recommended_send ?? false,
        next_action: "REQUEST_SEND_APPROVAL",
        execution_triggered: false,
      },
    });

  if (error && (error as DbError).code !== "23505") {
    throw new DraftStoreError("MESSAGE_EVENT_INSERT_FAILED", 500);
  }
}

export async function createMessageDraft(
  request: DraftRequest,
  provider: MessageDraftProvider,
) {
  const supabase = await getServiceRoleClient();
  if (!supabase) throw new DraftStoreError("SERVICE_ROLE_UNAVAILABLE", 503);

  const eventKey = `wf04:${request.idempotency_key}`;

  const { data: leadData, error: leadError } = await supabase
    .from("commercial_leads")
    .select(LEAD_SELECT)
    .eq("lead_id", request.lead_id)
    .maybeSingle();

  if (leadError) throw new DraftStoreError("LEAD_READ_FAILED", 500);
  if (!leadData) throw new DraftStoreError("LEAD_NOT_FOUND", 404);

  const lead = leadData as unknown as Lead;

  const requestHash = stableHash({
    lead_id: request.lead_id,
    offer: request.offer,
    cta: request.cta,
    template_code: request.template_code ?? null,
  });

  const replay = await readMessageByKey(supabase, eventKey);
  if (replay) {
    const existingHash = String(replay.draft_payload?.request_hash ?? "");
    if (existingHash !== requestHash) {
      throw new DraftStoreError("IDEMPOTENCY_CONFLICT", 409);
    }
    await ensureDraftEvent(supabase, {
      eventKey,
      workflowId: request.workflow_id,
      lead,
      message: replay,
    });
    return {
      lead,
      message: replay,
      replayed: true,
      suppressed: false,
      nextAction: "REQUEST_SEND_APPROVAL" as const,
      executionTriggered: false,
    };
  }

  if (
    lead.do_not_contact ||
    lead.pipeline_stage === "DO_NOT_CONTACT"
  ) {
    throw new DraftStoreError("DO_NOT_CONTACT", 409);
  }

  if (await readActiveSuppression(supabase, lead)) {
    throw new DraftStoreError("CONTACT_SUPPRESSED", 409);
  }

  if (lead.pipeline_stage !== "APPROVED_FOR_CONTACT") {
    throw new DraftStoreError("LEAD_NOT_APPROVED_FOR_CONTACT", 409);
  }

  if (
    !lead.business_active ||
    !lead.has_public_whatsapp ||
    !lead.public_contact_verified ||
    !lead.whatsapp
  ) {
    throw new DraftStoreError("LEAD_CONTACT_NOT_ELIGIBLE", 409);
  }

  const templateCode = selectTemplateCode(lead.category, request.template_code);
  const observation = factualObservation({
    lead_id: lead.lead_id,
    business_name: lead.business_name,
    category: lead.category,
    city: lead.city,
    source: lead.source,
    observation: lead.observation,
    has_no_website: lead.has_no_website,
    website_low_quality: lead.website_low_quality,
    google_maps_active: lead.google_maps_active,
    recent_reviews: lead.recent_reviews,
  });

  const raw = await provider.generate({
    lead: {
      lead_id: lead.lead_id,
      business_name: lead.business_name,
      category: lead.category,
      city: lead.city,
      source: lead.source,
      observation: lead.observation,
      has_no_website: lead.has_no_website,
      website_low_quality: lead.website_low_quality,
      google_maps_active: lead.google_maps_active,
      recent_reviews: lead.recent_reviews,
    },
    template_code: templateCode,
    observation,
    offer: request.offer,
    cta: request.cta,
  });

  const validation = validateDraftOutput(raw, {
    template_code: templateCode,
    observation,
    offer: request.offer,
    cta: request.cta,
  });

  if (!validation.ok) {
    throw new DraftStoreError(validation.code, 422, validation.issues);
  }

  const draft = validation.draft;

  const draftPayload = {
    schema_version: MESSAGE_DRAFT_SCHEMA_VERSION,
    request_hash: requestHash,
    template_id: draft.template_id,
    message_type: draft.message_type,
    personalized_message: draft.personalized_message,
    observed_fact_used: draft.observed_fact_used,
    cta: draft.cta,
    risk_flags: draft.risk_flags,
    recommended_send: draft.recommended_send,
    offer: request.offer,
  };

  const insertRow = {
    lead_id: lead.id,
    channel: MESSAGE_CHANNEL,
    message_type: FIRST_CONTACT_MESSAGE_TYPE,
    template_code: draft.template_id,
    draft_payload: draftPayload,
    rendered_text: draft.personalized_message,
    idempotency_key: eventKey,
    status: "DRAFT",
    metadata: {
      workflow_id: request.workflow_id,
      safety: "DRAFT_ONLY_NO_TRANSPORT",
    },
  };

  const { data: inserted, error: insertError } = await supabase
    .from("outbound_messages")
    .insert(insertRow)
    .select(OUTBOUND_SELECT)
    .single();

  if (insertError) {
    const db = insertError as DbError;
    if (db.code === "23505") {
      const raced = await readMessageByKey(supabase, eventKey);
      if (raced && String(raced.draft_payload?.request_hash ?? "") === requestHash) {
        await ensureDraftEvent(supabase, {
          eventKey,
          workflowId: request.workflow_id,
          lead,
          message: raced,
        });
        return {
          lead,
          message: raced,
          replayed: true,
          suppressed: false,
          nextAction: "REQUEST_SEND_APPROVAL" as const,
          executionTriggered: false,
        };
      }
      throw new DraftStoreError("IDEMPOTENCY_CONFLICT", 409);
    }
    throw new DraftStoreError("OUTBOUND_INSERT_FAILED", 500);
  }

  const message = inserted as unknown as Outbound;

  await ensureDraftEvent(supabase, {
    eventKey,
    workflowId: request.workflow_id,
    lead,
    message,
  });

  return {
    lead,
    message,
    replayed: false,
    suppressed: false,
    nextAction: "REQUEST_SEND_APPROVAL" as const,
    executionTriggered: false,
  };
}
