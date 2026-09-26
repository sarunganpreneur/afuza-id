import { describe, expect, it } from "vitest";

import {
  calculateLeadScore,
  LEAD_SCORE_RULE_VERSION,
  LEAD_SCORE_WEIGHTS,
  priorityForScore,
} from "./scoring";

function lead(overrides: Record<string, unknown> = {}) {
  return {
    has_no_website: false,
    website_low_quality: false,
    has_public_whatsapp: false,
    google_maps_active: false,
    recent_reviews: false,
    clear_offer: false,
    business_active: false,
    instagram_active: false,
    public_contact_verified: false,
    do_not_contact: false,
    whatsapp: null,
    ...overrides,
  } as never;
}

describe("Lead Score V1", () => {
  it("keeps the version and weights deterministic", () => {
    expect(LEAD_SCORE_RULE_VERSION).toBe("lead-score-v1");
    expect(Object.values(LEAD_SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("scores all positive signals to 100", () => {
    const result = calculateLeadScore(
      lead({
        has_no_website: true,
        website_low_quality: true,
        has_public_whatsapp: true,
        google_maps_active: true,
        recent_reviews: true,
        clear_offer: true,
        business_active: true,
        instagram_active: true,
        public_contact_verified: true,
        whatsapp: "6281234567890",
      }),
    );

    expect(result.score).toBe(100);
    expect(result.priority).toBe("A");
    expect(result.qualified).toBe(true);
    expect(result.qualificationBlockers).toEqual([]);
  });

  it("maps priority thresholds to DB-compatible values", () => {
    expect(priorityForScore(100)).toBe("A");
    expect(priorityForScore(80)).toBe("A");
    expect(priorityForScore(79)).toBe("B");
    expect(priorityForScore(60)).toBe("B");
    expect(priorityForScore(59)).toBe("WATCH");
    expect(priorityForScore(40)).toBe("WATCH");
    expect(priorityForScore(39)).toBe("LOW");
    expect(priorityForScore(0)).toBe("LOW");
  });

  it("requires the V1 WhatsApp qualification gates in addition to score", () => {
    const result = calculateLeadScore(
      lead({
        has_no_website: true,
        has_public_whatsapp: true,
        google_maps_active: true,
        recent_reviews: true,
        business_active: true,
        whatsapp: "6281234567890",
      }),
    );

    expect(result.score).toBe(70);
    expect(result.priority).toBe("B");
    expect(result.qualified).toBe(false);
    expect(result.qualificationBlockers).toContain("PUBLIC_CONTACT_NOT_VERIFIED");
  });

  it("blocks qualification when an active WhatsApp suppression exists", () => {
    const result = calculateLeadScore(
      lead({
        has_no_website: true,
        website_low_quality: true,
        has_public_whatsapp: true,
        google_maps_active: true,
        recent_reviews: true,
        clear_offer: true,
        business_active: true,
        instagram_active: true,
        public_contact_verified: true,
        whatsapp: "6281234567890",
      }),
      { contactSuppressed: true },
    );

    expect(result.score).toBe(100);
    expect(result.qualified).toBe(false);
    expect(result.suppressed).toBe(true);
    expect(result.qualificationBlockers).toContain("CONTACT_SUPPRESSED");
  });

  it("hard-blocks qualification when do_not_contact is true", () => {
    const result = calculateLeadScore(
      lead({
        has_no_website: true,
        website_low_quality: true,
        has_public_whatsapp: true,
        google_maps_active: true,
        recent_reviews: true,
        clear_offer: true,
        business_active: true,
        instagram_active: true,
        public_contact_verified: true,
        whatsapp: "6281234567890",
        do_not_contact: true,
      }),
    );

    expect(result.score).toBe(100);
    expect(result.priority).toBe("A");
    expect(result.qualified).toBe(false);
    expect(result.suppressed).toBe(true);
    expect(result.qualificationBlockers).toContain("DO_NOT_CONTACT");
  });
});
