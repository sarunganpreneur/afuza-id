import type { LeadUpsertInput } from "./schemas";

//
// Commercial-domain tables are newer than the current generated
// Supabase Database types. Keep this escape local to this module.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommercialDb = any;

export type CommercialLeadRow = {
  id: string;
  lead_id: string;
  business_name: string;
  category: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  google_maps_url: string | null;
  source: string;
  raw_source_id: string | null;
  notes: string | null;
  observation: string | null;
  rating: number | null;
  review_count: number | null;
  has_no_website: boolean;
  website_low_quality: boolean;
  has_public_whatsapp: boolean;
  public_contact_verified: boolean;
  google_maps_active: boolean;
  instagram_active: boolean;
  recent_reviews: boolean;
  clear_offer: boolean;
  business_active: boolean;
  do_not_contact: boolean;
  score: number;
  score_rule_version: string;
  priority: string;
  pipeline_stage: string;
  qualified_at: string | null;
  last_contacted_at: string | null;
  followup_count: number;
  next_followup_at: string | null;
  converted_business_id: string | null;
  converted_order_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LeadStoreSuccess = {
  kind: "SUCCESS";
  lead: CommercialLeadRow;
  createdNew: boolean;
  replayed: boolean;
  changedFields: string[];
};

export type LeadStoreFailure =
  | { kind: "DUPLICATE_CONTACT"; existingLeadId: string }
  | { kind: "IDEMPOTENCY_CONFLICT" }
  | { kind: "DATABASE_ERROR"; operation: string; code?: string };

export type LeadStoreResult = LeadStoreSuccess | LeadStoreFailure;

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

const MUTABLE_INPUT_FIELDS = [
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
  "metadata",
] as const;

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function buildInsertRow(input: LeadUpsertInput) {
  const doNotContact = input.do_not_contact === true;

  return {
    lead_id: input.lead_id,
    business_name: input.business_name,
    category: input.category ?? null,
    city: input.city ?? null,
    phone: input.phone ?? null,
    whatsapp: input.whatsapp ?? null,
    website: input.website ?? null,
    instagram: input.instagram ?? null,
    google_maps_url: input.google_maps_url ?? null,
    source: input.source,
    raw_source_id: input.raw_source_id ?? null,
    notes: input.notes ?? null,
    observation: input.observation ?? null,
    rating: input.rating ?? null,
    review_count: input.review_count ?? null,
    has_no_website: input.has_no_website ?? false,
    website_low_quality: input.website_low_quality ?? false,
    has_public_whatsapp: input.has_public_whatsapp ?? false,
    public_contact_verified: input.public_contact_verified ?? false,
    google_maps_active: input.google_maps_active ?? false,
    instagram_active: input.instagram_active ?? false,
    recent_reviews: input.recent_reviews ?? false,
    clear_offer: input.clear_offer ?? false,
    business_active: input.business_active ?? false,
    do_not_contact: doNotContact,
    pipeline_stage: doNotContact ? "DO_NOT_CONTACT" : "DISCOVERED",
    metadata: input.metadata ?? {},
  };
}

function buildUpdateRow(existing: CommercialLeadRow, input: LeadUpsertInput) {
  const row: Record<string, unknown> = {};
  const changedFields: string[] = [];

  for (const field of MUTABLE_INPUT_FIELDS) {
    if (!(field in input)) continue;

    let nextValue = input[field];

    if (field === "do_not_contact") {
      nextValue = existing.do_not_contact || input.do_not_contact === true;
    }

    const currentValue = existing[field as keyof CommercialLeadRow];

    if (!valuesEqual(currentValue, nextValue)) {
      row[field] = nextValue;
      changedFields.push(field);
    }
  }

  if (existing.do_not_contact || input.do_not_contact === true) {
    if (existing.pipeline_stage !== "DO_NOT_CONTACT") {
      row.pipeline_stage = "DO_NOT_CONTACT";
      changedFields.push("pipeline_stage");
    }
  }

  return { row, changedFields };
}

async function readEventByIdempotency(db: CommercialDb, eventKey: string) {
  return db
    .from("commercial_events")
    .select("id, lead_id, event_type, payload")
    .eq("idempotency_key", eventKey)
    .maybeSingle();
}

export async function upsertCommercialLead(
  db: CommercialDb,
  input: LeadUpsertInput,
  options: {
    eventKey: string;
    requestHash: string;
    actorReference: string;
  },
): Promise<LeadStoreResult> {
  const replayCheck = await readEventByIdempotency(db, options.eventKey);

  if (replayCheck.error) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_idempotency_event",
      code: replayCheck.error.code,
    };
  }

  if (replayCheck.data) {
    const storedHash = replayCheck.data.payload?.request_hash;
    if (storedHash !== options.requestHash) {
      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    const replayLead = await db
      .from("commercial_leads")
      .select(LEAD_SELECT)
      .eq("id", replayCheck.data.lead_id)
      .maybeSingle();

    if (replayLead.error || !replayLead.data) {
      return {
        kind: "DATABASE_ERROR",
        operation: "read_replayed_lead",
        code: replayLead.error?.code,
      };
    }

    return {
      kind: "SUCCESS",
      lead: replayLead.data as CommercialLeadRow,
      createdNew: replayCheck.data.event_type === "LEAD_CREATED",
      replayed: true,
      changedFields: [],
    };
  }

  const existingResult = await db
    .from("commercial_leads")
    .select(LEAD_SELECT)
    .eq("lead_id", input.lead_id)
    .maybeSingle();

  if (existingResult.error) {
    return {
      kind: "DATABASE_ERROR",
      operation: "read_existing_lead",
      code: existingResult.error.code,
    };
  }

  const existing = (existingResult.data ?? null) as CommercialLeadRow | null;

  if (input.whatsapp) {
    const duplicateResult = await db
      .from("commercial_leads")
      .select("id, lead_id")
      .eq("whatsapp", input.whatsapp)
      .neq("lead_id", input.lead_id)
      .limit(1)
      .maybeSingle();

    if (duplicateResult.error) {
      return {
        kind: "DATABASE_ERROR",
        operation: "check_duplicate_contact",
        code: duplicateResult.error.code,
      };
    }

    if (duplicateResult.data) {
      return {
        kind: "DUPLICATE_CONTACT",
        existingLeadId: duplicateResult.data.lead_id,
      };
    }
  }

  let lead: CommercialLeadRow;
  let createdNew = false;
  let changedFields: string[] = [];

  if (!existing) {
    const insertRow = buildInsertRow(input);
    const insertResult = await db
      .from("commercial_leads")
      .insert(insertRow)
      .select(LEAD_SELECT)
      .single();

    if (insertResult.error || !insertResult.data) {
      return {
        kind: "DATABASE_ERROR",
        operation: "insert_lead",
        code: insertResult.error?.code,
      };
    }

    lead = insertResult.data as CommercialLeadRow;
    createdNew = true;
    changedFields = Object.keys(insertRow);
  } else {
    const update = buildUpdateRow(existing, input);
    changedFields = update.changedFields;

    if (Object.keys(update.row).length === 0) {
      lead = existing;
    } else {
      const updateResult = await db
        .from("commercial_leads")
        .update(update.row)
        .eq("id", existing.id)
        .select(LEAD_SELECT)
        .single();

      if (updateResult.error || !updateResult.data) {
        return {
          kind: "DATABASE_ERROR",
          operation: "update_lead",
          code: updateResult.error?.code,
        };
      }

      lead = updateResult.data as CommercialLeadRow;
    }
  }

  const eventType = createdNew ? "LEAD_CREATED" : "LEAD_UPDATED";
  const eventResult = await db.from("commercial_events").insert({
    lead_id: lead.id,
    event_type: eventType,
    actor_type: "INTERNAL_API",
    actor_reference: options.actorReference,
    idempotency_key: options.eventKey,
    payload: {
      request_hash: options.requestHash,
      lead_id: lead.lead_id,
      source: lead.source,
      created_new: createdNew,
      changed_fields: changedFields,
    },
  });

  if (eventResult.error) {
    if (eventResult.error.code === "23505") {
      const racedReplay = await readEventByIdempotency(db, options.eventKey);
      if (
        !racedReplay.error &&
        racedReplay.data?.payload?.request_hash === options.requestHash
      ) {
        return {
          kind: "SUCCESS",
          lead,
          createdNew,
          replayed: true,
          changedFields,
        };
      }

      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    return {
      kind: "DATABASE_ERROR",
      operation: "insert_commercial_event",
      code: eventResult.error.code,
    };
  }

  return {
    kind: "SUCCESS",
    lead,
    createdNew,
    replayed: false,
    changedFields,
  };
}
