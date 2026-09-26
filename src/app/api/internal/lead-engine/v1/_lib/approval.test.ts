import { describe, expect, it } from "vitest";

import {
  evaluateFirstContactEligibility,
  FIRST_CONTACT_APPROVAL_ACTION,
  FIRST_CONTACT_APPROVAL_RISK,
} from "./approval";
import type { CommercialLeadRow } from "./store";

function lead(overrides: Partial<CommercialLeadRow> = {}): CommercialLeadRow {
  return {
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
    ...overrides,
  };
}

describe("WF-03 first-contact eligibility", () => {
  it("locks the FIRST_CONTACT approval contract", () => {
    expect(FIRST_CONTACT_APPROVAL_ACTION).toBe("FIRST_CONTACT");
    expect(FIRST_CONTACT_APPROVAL_RISK).toBe("MEDIUM");
  });

  it("allows a qualified, verified and unsuppressed lead", () => {
    expect(
      evaluateFirstContactEligibility(lead(), { contactSuppressed: false }),
    ).toEqual({ eligible: true, blocker: null });
  });

  it("blocks a lead that is not qualified", () => {
    expect(
      evaluateFirstContactEligibility(lead({ pipeline_stage: "DISCOVERED" }), {
        contactSuppressed: false,
      }),
    ).toEqual({ eligible: false, blocker: "LEAD_NOT_QUALIFIED" });
  });

  it("gives DNC precedence", () => {
    expect(
      evaluateFirstContactEligibility(lead({ do_not_contact: true }), {
        contactSuppressed: false,
      }),
    ).toEqual({ eligible: false, blocker: "DO_NOT_CONTACT" });
  });

  it("blocks active contact suppression", () => {
    expect(
      evaluateFirstContactEligibility(lead(), { contactSuppressed: true }),
    ).toEqual({ eligible: false, blocker: "CONTACT_SUPPRESSED" });
  });

  it("requires public and verified WhatsApp", () => {
    expect(
      evaluateFirstContactEligibility(lead({ public_contact_verified: false }), {
        contactSuppressed: false,
      }),
    ).toEqual({ eligible: false, blocker: "PUBLIC_CONTACT_NOT_VERIFIED" });
  });
});
