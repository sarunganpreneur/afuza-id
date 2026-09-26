import { describe, expect, it } from "vitest";

import {
  factualObservation,
  selectTemplateCode,
  validateDraftOutput,
} from "./message-draft";

describe("WF-04 message draft policy", () => {
  it("selects education template for Madrasah", () => {
    expect(selectTemplateCode("Madrasah")).toBe("WA-EDU-001");
  });

  it("uses generic fallback", () => {
    expect(selectTemplateCode("Percetakan")).toBe("WA-GEN-001");
  });

  it("derives a factual no-website observation", () => {
    expect(factualObservation({
      lead_id: "X",
      business_name: "Madrasah A",
      category: "Madrasah",
      city: "Kendal",
      source: "STAGING_TEST",
      observation: null,
      has_no_website: true,
      website_low_quality: false,
      google_maps_active: true,
      recent_reviews: true,
    })).toContain("Belum memiliki website");
  });

  it("accepts grounded structured output", () => {
    const observation = "Belum memiliki website yang terdeteksi pada data publik yang digunakan.";
    const result = validateDraftOutput({
      template_id: "WA-EDU-001",
      message_type: "FIRST_CONTACT",
      personalized_message: "Assalamu'alaikum Madrasah A. Kami melihat belum memiliki website yang terdeteksi pada data publik yang digunakan. Kami menawarkan Landing Page 100K seharga Rp100.000. Kirim contoh",
      observed_fact_used: observation,
      cta: "Kirim contoh",
      risk_flags: [],
      recommended_send: true,
    }, {
      template_code: "WA-EDU-001",
      observation,
      offer: {
        name: "Landing Page 100K",
        description: "Landing page satu halaman.",
        price_text: "Rp100.000",
      },
      cta: "Kirim contoh",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects unresolved placeholders", () => {
    const observation = "Fakta";
    const result = validateDraftOutput({
      template_id: "WA-GEN-001",
      message_type: "FIRST_CONTACT",
      personalized_message: "Halo [NAMA], ada penawaran.",
      observed_fact_used: observation,
      cta: "Kirim contoh",
      risk_flags: [],
      recommended_send: true,
    }, {
      template_code: "WA-GEN-001",
      observation,
      offer: { name: "Offer", description: "Desc" },
      cta: "Kirim contoh",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain("unresolved_placeholder");
  });

  it("rejects a price not matching configured price", () => {
    const observation = "Fakta";
    const result = validateDraftOutput({
      template_id: "WA-GEN-001",
      message_type: "FIRST_CONTACT",
      personalized_message: "Halo. Penawaran ini hanya Rp250.000. Kirim contoh",
      observed_fact_used: observation,
      cta: "Kirim contoh",
      risk_flags: [],
      recommended_send: true,
    }, {
      template_code: "WA-GEN-001",
      observation,
      offer: {
        name: "Offer",
        description: "Desc",
        price_text: "Rp100.000",
      },
      cta: "Kirim contoh",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain("price_mismatch");
  });
});
