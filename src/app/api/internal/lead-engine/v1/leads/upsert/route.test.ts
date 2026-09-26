import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getServiceRoleClient } from "@/lib/supabase/service-role";

import { authenticateLeadEngineRequest, LEAD_ENGINE_AUTH_RESULT } from "../../_lib/auth";
import { upsertCommercialLead } from "../../_lib/store";
import { POST } from "./route";

vi.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: vi.fn(),
}));

vi.mock("../../_lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../../_lib/auth")>("../../_lib/auth");
  return {
    ...actual,
    authenticateLeadEngineRequest: vi.fn(),
  };
});

vi.mock("../../_lib/store", async () => {
  const actual = await vi.importActual<typeof import("../../_lib/store")>("../../_lib/store");
  return {
    ...actual,
    upsertCommercialLead: vi.fn(),
  };
});

function request(
  body: unknown,
  options: {
    authorization?: string;
    idempotencyKey?: string;
    raw?: string;
  } = {},
) {
  return new Request("http://localhost/api/internal/lead-engine/v1/leads/upsert", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.authorization ? { authorization: options.authorization } : {}),
      ...(options.idempotencyKey
        ? { "idempotency-key": options.idempotencyKey }
        : {}),
    },
    body: options.raw ?? JSON.stringify(body),
  });
}

const validPayload = () => ({
  lead_id: "EX-001",
  business_name: "Contoh Madrasah",
  category: "Madrasah",
  city: "Kendal",
  whatsapp: "081234567890",
  source: "Google Maps",
  has_no_website: true,
  has_public_whatsapp: true,
  public_contact_verified: true,
  business_active: true,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticateLeadEngineRequest).mockReturnValue(
    LEAD_ENGINE_AUTH_RESULT.AUTHORIZED,
  );
  vi.mocked(getServiceRoleClient).mockResolvedValue({} as never);
});

describe("WF-01 lead upsert route", () => {
  it("rejects unauthorized internal requests", async () => {
    vi.mocked(authenticateLeadEngineRequest).mockReturnValue(
      LEAD_ENGINE_AUTH_RESULT.UNAUTHORIZED,
    );

    const response = await POST(request(validPayload(), { idempotencyKey: "k1" }) as never);
    expect(response.status).toBe(401);
  });

  it("requires an idempotency key", async () => {
    const response = await POST(request(validPayload()) as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      request(validPayload(), { idempotencyKey: "k1", raw: "{" }) as never,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "MALFORMED_JSON" });
  });

  it("rejects invalid lead payloads", async () => {
    const response = await POST(
      request({ lead_id: "EX-001" }, { idempotencyKey: "k1" }) as never,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_LEAD_PAYLOAD" });
  });

  it("returns CREATED and normalized data for a new lead", async () => {
    vi.mocked(upsertCommercialLead).mockResolvedValue({
      kind: "SUCCESS",
      createdNew: true,
      replayed: false,
      changedFields: ["business_name", "whatsapp"],
      lead: {
        id: "00000000-0000-4000-8000-000000000001",
        lead_id: "EX-001",
        business_name: "Contoh Madrasah",
        category: "Madrasah",
        city: "Kendal",
        phone: null,
        whatsapp: "6281234567890",
        website: null,
        instagram: null,
        google_maps_url: null,
        source: "Google Maps",
        raw_source_id: null,
        notes: null,
        observation: null,
        rating: null,
        review_count: null,
        has_no_website: true,
        website_low_quality: false,
        has_public_whatsapp: true,
        public_contact_verified: true,
        google_maps_active: false,
        instagram_active: false,
        recent_reviews: false,
        clear_offer: false,
        business_active: true,
        do_not_contact: false,
        score: 0,
        score_rule_version: "lead-score-v1",
        priority: "LOW",
        pipeline_stage: "DISCOVERED",
        qualified_at: null,
        last_contacted_at: null,
        followup_count: 0,
        next_followup_at: null,
        converted_business_id: null,
        converted_order_id: null,
        metadata: {},
        created_at: "2026-09-25T00:00:00Z",
        updated_at: "2026-09-25T00:00:00Z",
      },
    });

    const response = await POST(
      request(validPayload(), { idempotencyKey: "wf01-create-1" }) as never,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      ok: true,
      created_new: true,
      replayed: false,
      next_action: "SCORE",
      lead: { whatsapp: "6281234567890" },
    });
  });

  it("returns a safe replay without creating a second action", async () => {
    vi.mocked(upsertCommercialLead).mockResolvedValue({
      kind: "SUCCESS",
      createdNew: true,
      replayed: true,
      changedFields: [],
      lead: {
        id: "00000000-0000-4000-8000-000000000001",
        lead_id: "EX-001",
        business_name: "Contoh Madrasah",
        category: null,
        city: null,
        phone: null,
        whatsapp: "6281234567890",
        website: null,
        instagram: null,
        google_maps_url: null,
        source: "Google Maps",
        raw_source_id: null,
        notes: null,
        observation: null,
        rating: null,
        review_count: null,
        has_no_website: false,
        website_low_quality: false,
        has_public_whatsapp: true,
        public_contact_verified: true,
        google_maps_active: false,
        instagram_active: false,
        recent_reviews: false,
        clear_offer: false,
        business_active: true,
        do_not_contact: false,
        score: 0,
        score_rule_version: "lead-score-v1",
        priority: "LOW",
        pipeline_stage: "DISCOVERED",
        qualified_at: null,
        last_contacted_at: null,
        followup_count: 0,
        next_followup_at: null,
        converted_business_id: null,
        converted_order_id: null,
        metadata: {},
        created_at: "2026-09-25T00:00:00Z",
        updated_at: "2026-09-25T00:00:00Z",
      },
    });

    const response = await POST(
      request(validPayload(), { idempotencyKey: "wf01-create-1" }) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ replayed: true });
  });

  it("returns deterministic duplicate-contact conflict", async () => {
    vi.mocked(upsertCommercialLead).mockResolvedValue({
      kind: "DUPLICATE_CONTACT",
      existingLeadId: "EX-000",
    });

    const response = await POST(
      request(validPayload(), { idempotencyKey: "wf01-contact-conflict" }) as never,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "DUPLICATE_CONTACT",
      existing_lead_id: "EX-000",
    });
  });

  it("returns 409 when an idempotency key is reused for different material input", async () => {
    vi.mocked(upsertCommercialLead).mockResolvedValue({ kind: "IDEMPOTENCY_CONFLICT" });

    const response = await POST(
      request(validPayload(), { idempotencyKey: "reused-key" }) as never,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("fails closed when service role is unavailable", async () => {
    vi.mocked(getServiceRoleClient).mockResolvedValue(null);

    const response = await POST(
      request(validPayload(), { idempotencyKey: "k1" }) as never,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "SERVICE_ROLE_UNAVAILABLE" });
  });
});
