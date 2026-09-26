import { describe, expect, it } from "vitest";

import {
  LEAD_SCORE_RULE_VERSION,
  LEAD_SCORE_WEIGHTS,
  MINIMUM_QUALIFY_SCORE,
} from "../../../_lib/scoring";

describe("WF-02 contract", () => {
  it("locks the deterministic Lead Score V1 contract", () => {
    expect(LEAD_SCORE_RULE_VERSION).toBe("lead-score-v1");
    expect(MINIMUM_QUALIFY_SCORE).toBe(60);
    expect(LEAD_SCORE_WEIGHTS).toEqual({
      has_no_website: 25,
      website_low_quality: 15,
      has_public_whatsapp: 15,
      google_maps_active: 10,
      recent_reviews: 10,
      clear_offer: 10,
      business_active: 10,
      instagram_active: 5,
    });
  });
});
