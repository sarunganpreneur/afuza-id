import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getServiceRoleClient } from "@/lib/supabase/service-role";

import {
  authenticateLeadEngineRequest,
  LEAD_ENGINE_AUTH_RESULT,
} from "../../../_lib/auth";
import { scoreCommercialLead } from "../../../_lib/score-store";
import { POST } from "./route";

vi.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: vi.fn(),
}));

vi.mock("../../../_lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../../../_lib/auth")>(
    "../../../_lib/auth",
  );
  return {
    ...actual,
    authenticateLeadEngineRequest: vi.fn(),
  };
});

vi.mock("../../../_lib/score-store", () => ({
  scoreCommercialLead: vi.fn(),
}));

function request(idempotencyKey?: string) {
  return new Request(
    "http://localhost/api/internal/lead-engine/v1/leads/EX-001/score",
    {
      method: "POST",
      headers: {
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
    },
  );
}

function context(leadId = "EX-001") {
  return { params: Promise.resolve({ leadId }) };
}

const scoredLead = {
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
  google_maps_active: true,
  instagram_active: false,
  recent_reviews: true,
  clear_offer: true,
  business_active: true,
  do_not_contact: false,
  score: 80,
  score_rule_version: "lead-score-v1",
  priority: "A",
  pipeline_stage: "QUALIFIED",
  qualified_at: "2026-09-25T00:00:00Z",
  last_contacted_at: null,
  followup_count: 0,
  next_followup_at: null,
  converted_business_id: null,
  converted_order_id: null,
  metadata: {},
  created_at: "2026-09-25T00:00:00Z",
  updated_at: "2026-09-25T00:00:00Z",
};

const scoreResult = {
  score: 80,
  priority: "A" as const,
  qualified: true,
  suppressed: false,
  scoreRuleVersion: "lead-score-v1",
  breakdown: [],
  qualificationBlockers: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticateLeadEngineRequest).mockReturnValue(
    LEAD_ENGINE_AUTH_RESULT.AUTHORIZED,
  );
  vi.mocked(getServiceRoleClient).mockResolvedValue({} as never);
});

describe("WF-02 score route", () => {
  it("rejects unauthorized internal requests", async () => {
    vi.mocked(authenticateLeadEngineRequest).mockReturnValue(
      LEAD_ENGINE_AUTH_RESULT.UNAUTHORIZED,
    );

    const response = await POST(request("k1"), context());
    expect(response.status).toBe(401);
  });

  it("requires an idempotency key", async () => {
    const response = await POST(request(), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("rejects an invalid lead id", async () => {
    const response = await POST(request("k1"), context(" "));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_LEAD_ID" });
  });

  it("returns 404 for an unknown lead", async () => {
    vi.mocked(scoreCommercialLead).mockResolvedValue({ kind: "NOT_FOUND" });

    const response = await POST(request("k1"), context("MISSING"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "LEAD_NOT_FOUND" });
  });

  it("returns deterministic score and qualification output", async () => {
    vi.mocked(scoreCommercialLead).mockResolvedValue({
      kind: "SUCCESS",
      lead: scoredLead,
      scoreResult,
      replayed: false,
      changedFields: ["score", "priority", "pipeline_stage", "qualified_at"],
      previousStage: "DISCOVERED",
      nextAction: "CREATE_APPROVAL",
    });

    const response = await POST(request("score-1"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      score: 80,
      priority: "A",
      qualified: true,
      replayed: false,
      pipeline_stage: "QUALIFIED",
      next_action: "CREATE_APPROVAL",
    });
  });

  it("returns a safe replay", async () => {
    vi.mocked(scoreCommercialLead).mockResolvedValue({
      kind: "SUCCESS",
      lead: scoredLead,
      scoreResult,
      replayed: true,
      changedFields: [],
      previousStage: "DISCOVERED",
      nextAction: "CREATE_APPROVAL",
    });

    const response = await POST(request("score-1"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ replayed: true });
  });

  it("returns 409 when an idempotency key is reused after material scoring input changed", async () => {
    vi.mocked(scoreCommercialLead).mockResolvedValue({
      kind: "IDEMPOTENCY_CONFLICT",
    });

    const response = await POST(request("reused-key"), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("fails closed when service role is unavailable", async () => {
    vi.mocked(getServiceRoleClient).mockResolvedValue(null);

    const response = await POST(request("k1"), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "SERVICE_ROLE_UNAVAILABLE" });
  });

  it("maps store database failures to a safe API error", async () => {
    vi.mocked(scoreCommercialLead).mockResolvedValue({
      kind: "DATABASE_ERROR",
      operation: "update_scored_lead",
      code: "XX000",
    });

    const response = await POST(request("k1"), context());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "LEAD_SCORE_FAILED" });
  });
});
