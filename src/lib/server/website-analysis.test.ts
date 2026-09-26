import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

import { POST as POSTComplete } from "@/app/api/internal/generation/analysis/complete/route";
import { POST as POSTInput } from "@/app/api/internal/generation/analysis/input/route";
import { parseWebsiteAnalysisV1, validateHalalAnalysisSafety, HALAL_STATUS_VALUES, buildWebsiteAnalysisInput, validateWebsiteAnalysisGrounding, getWebsiteAnalysisGroundingDiagnostic, getTestimonialSectionDiagnostic, buildWebsiteAnalysisSystemPrompt, normalizeWebsiteAnalysisAllowedClaims, normalizeWebsiteAnalysisAllowedClaimsOutput, normalizeUnsupportedTestimonialClaims, normalizeProductServiceTokens, type WebsiteAnalysisV1 } from "@/lib/server/website-analysis";
import { AUTH_RESULT } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { authenticateWorkerRequest } from "@/lib/server/worker/auth";

vi.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/server/worker/auth", async () => ({
  AUTH_RESULT: {
    AUTHORIZED: "AUTHORIZED",
    UNAUTHORIZED: "UNAUTHORIZED",
    MISCONFIGURED: "MISCONFIGURED",
  },
  authenticateWorkerRequest: vi.fn(),
}));

const validAnalysis = {
  schema_version: "website_analysis_v1" as const,
  job_id: "03137715-b9f0-41eb-8072-9e0135de32a8",
  site_id: "61c79c23-690a-4f5d-8eca-4d3588362c7c",
  business_summary: {
    business_name: "Toko Jaya",
    business_type: "Retail",
    target_market: "Pemuda keluarga di Bandung",
    products_services: "Kue dan kebutuhan sehari-hari",
    usp: "Rasa autentik dan pengiriman cepat",
    whatsapp: "6281234567890",
    address: null,
    website_goal: "Meningkatkan penjualan online",
    primary_cta: "Hubungi kami",
    style_preference: "Modern",
    color_preference: "#1F2937",
    reference_urls: ["https://example.com"],
    notes: "Ada kebutuhan konten adaptif",
    image_mode: "AI",
  },
  audience: {
    primary: "Pemilik rumah",
    needs: ["Cepat", "Tersedia"],
    objections: ["Harga tinggi"],
  },
  offer: {
    products_services_summary: "Kue dan kebutuhan harian",
    usp_summary: "Rasa autentik",
    value_proposition: "Pengiriman cepat",
  },
  conversion: {
    website_goal: "Meningkatkan konversi",
    primary_cta: "Pesan sekarang",
    strategy: "Lead capture via WhatsApp",
  },
  design_direction: {
    style: "Modern",
    color_direction: "Netral gelap",
    image_mode: "AI",
    image_direction: "Clean editorial",
  },
  section_plan: [{ section_type: "Hero", purpose: "Intro", key_points: ["Fokus"], cta: "Pesan sekarang" }],
  content_guardrails: {
    halal_status: "CERTIFIED" as const,
    allowed_claims: ["Rasa halal"],
    prohibited_claims: ["Kami nomor satu"],
  },
  missing_information: [],
};

describe("WebsiteAnalysisV1 schema", () => {
  it("accepts valid analysis", () => {
    expect(parseWebsiteAnalysisV1(validAnalysis).success).toBe(true);
  });
  it("rejects wrong schema_version", () => {
    const input = { ...validAnalysis, schema_version: "website_analysis_v2" };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
  it("rejects malformed audience", () => {
    const input = { ...validAnalysis, audience: { primary: "" } };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
  it("rejects audience needs as a string", () => {
    const input = { ...validAnalysis, audience: { ...validAnalysis.audience, needs: "Makanan" } };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
  it("rejects too many audience needs", () => {
    const input = { ...validAnalysis, audience: { ...validAnalysis.audience, needs: Array.from({ length: 9 }, () => "Kebutuhan") } };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
  it("rejects audience objections as a string", () => {
    const input = { ...validAnalysis, audience: { ...validAnalysis.audience, objections: "Harga" } };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
  it("rejects section key_points as a string", () => {
    const input = { ...validAnalysis, section_plan: [{ ...validAnalysis.section_plan[0], key_points: "Fokus" }] };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
  it("accepts a valid structured analysis output", () => {
    expect(parseWebsiteAnalysisV1(validAnalysis).success).toBe(true);
  });
  it("rejects malformed section_plan", () => {
    const input = { ...validAnalysis, section_plan: [{ purpose: "Missing type" }] };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
  it("rejects invalid image_mode", () => {
    const input = { ...validAnalysis, business_summary: { ...validAnalysis.business_summary, image_mode: "INVALID" } };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
  it("rejects invalid halal_status", () => {
    const input = { ...validAnalysis, content_guardrails: { ...validAnalysis.content_guardrails, halal_status: "INVALID" } };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
  it("rejects oversized arrays", () => {
    const input = { ...validAnalysis, section_plan: Array.from({ length: 13 }, (_, index) => ({ section_type: `S${index}`, purpose: "P", key_points: ["x"], cta: "C" })) };
    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
});

describe("Halal safety", () => {
  it("accepts a valid certified claim without invented metadata", () => {
    expect(validateHalalAnalysisSafety(validAnalysis).ok).toBe(true);
  });

  it("rejects a positive certificate claim when status is IN_PROCESS", () => {
    const input = {
      ...validAnalysis,
      content_guardrails: { ...validAnalysis.content_guardrails, halal_status: "IN_PROCESS" as const },
      offer: { ...validAnalysis.offer, value_proposition: "Produk kami sudah bersertifikat halal" },
    } as Parameters<typeof validateHalalAnalysisSafety>[0];
    expect(validateHalalAnalysisSafety(input).ok).toBe(false);
  });

  it("rejects a positive certificate claim when status is NOT_CERTIFIED", () => {
    const input = {
      ...validAnalysis,
      content_guardrails: { ...validAnalysis.content_guardrails, halal_status: "NOT_CERTIFIED" as const },
      business_summary: { ...validAnalysis.business_summary, notes: "Produk kami sudah bersertifikat halal" },
    } as Parameters<typeof validateHalalAnalysisSafety>[0];
    expect(validateHalalAnalysisSafety(input).ok).toBe(false);
  });

  for (const status of ["UNSURE", "NOT_RELEVANT"] as const) {
    it(`rejects certificate marketing for ${status}`, () => {
      const input = {
        ...validAnalysis,
        content_guardrails: { ...validAnalysis.content_guardrails, halal_status: status },
        offer: { ...validAnalysis.offer, value_proposition: "Halal certified by authority" },
      } as Parameters<typeof validateHalalAnalysisSafety>[0];
      expect(validateHalalAnalysisSafety(input).ok).toBe(false);
    });
  }

  for (const status of HALAL_STATUS_VALUES) {
    it(`accepts valid enum for ${status}`, () => {
      const input = {
        ...validAnalysis,
        content_guardrails: { ...validAnalysis.content_guardrails, halal_status: status },
      } as typeof validAnalysis;
      expect(parseWebsiteAnalysisV1(input).success).toBe(true);
    });
  }

  it("rejects invented product claims not grounded in source", () => {
    const input = {
      ...validAnalysis,
      offer: {
        ...validAnalysis.offer,
        products_services_summary: "Bakso sapi dan bakso goreng",
      },
      content_guardrails: {
        ...validAnalysis.content_guardrails,
        allowed_claims: ["Bakso goreng"],
      },
    } as typeof validAnalysis;

    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });

  it("trims USP summaries before enforcing the minimum length", () => {
    const input = {
      ...validAnalysis,
      offer: { ...validAnalysis.offer, usp_summary: "   " },
    } as typeof validAnalysis;

    expect(parseWebsiteAnalysisV1(input).success).toBe(false);

    const padded = {
      ...validAnalysis,
      offer: { ...validAnalysis.offer, usp_summary: "   Bakso dan mie ayam sebagai menu utama   " },
    } as typeof validAnalysis;
    const parsed = parseWebsiteAnalysisV1(padded);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.offer.usp_summary).toBe("Bakso dan mie ayam sebagai menu utama");
  });

  it("rejects fabricated testimonial and customer satisfaction claims", () => {
    const input = {
      ...validAnalysis,
      section_plan: [{
        section_type: "Testimoni",
        purpose: "Menampilkan review pelanggan",
        key_points: ["Pelanggan puas", "Pelayanan ramah"],
        cta: "Lihat review",
      }],
    } as typeof validAnalysis;

    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });

  it("accepts a semantic plan without testimonial evidence or a testimonial section", () => {
    const result = parseWebsiteAnalysisV1(validAnalysis);

    expect(result.success).toBe(true);
    expect(validAnalysis.section_plan.some((section) => /testimoni|review|ulasan|rating/i.test(section.section_type))).toBe(false);
    expect(validAnalysis.content_guardrails.allowed_claims.some((claim) => /testimoni|review|ulasan|rating|pelanggan puas/i.test(claim))).toBe(false);
  });

  it("requires all design direction fields to be non-empty", () => {
    const input = {
      ...validAnalysis,
      design_direction: { ...validAnalysis.design_direction, style: "" },
    } as typeof validAnalysis;

    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });

  it("rejects unsupported pricing and superlative language", () => {
    const priceInput = {
      ...validAnalysis,
      content_guardrails: {
        ...validAnalysis.content_guardrails,
        allowed_claims: ["Harga terjangkau"],
      },
    } as typeof validAnalysis;

    const bestInput = {
      ...validAnalysis,
      offer: {
        ...validAnalysis.offer,
        value_proposition: "Bakso sapi terbaik di kota",
      },
    } as typeof validAnalysis;

    expect(parseWebsiteAnalysisV1(priceInput).success).toBe(false);
    expect(parseWebsiteAnalysisV1(bestInput).success).toBe(false);
    const bestResult = parseWebsiteAnalysisV1(bestInput);
    expect(bestResult.success).toBe(false);
    if (!bestResult.success) {
      expect(bestResult.error.issues).toContainEqual(expect.objectContaining({
        path: ["offer", "value_proposition"],
        code: "custom",
        message: "UNSUPPORTED_SUPERLATIVE_CLAIM",
      }));
    }
  });

  it("rejects unsupported service-speed claims", () => {
    const input = {
      ...validAnalysis,
      content_guardrails: {
        ...validAnalysis.content_guardrails,
        allowed_claims: ["Pelayanan cepat"],
      },
    } as typeof validAnalysis;

    expect(parseWebsiteAnalysisV1(input).success).toBe(false);
  });
});

describe("Immutable source grounding", () => {
  const baksoInput = buildWebsiteAnalysisInput({
    schema_version: 1,
    site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
    business: {
      name: "Bakso Marem",
      business_type: "Warung Bakso",
      target_market: "Keluarga",
      products_services: "Bakso sapi",
      usp: "Rasa khas",
      whatsapp: null,
      address: null,
    },
    brief: {
      primary_cta: "Pesan Sekarang",
      website_goal: "Meningkatkan penjualan",
      style_preference: "Modern",
      color_preference: null,
      reference_urls: null,
      notes: null,
      image_mode: "AI",
      halal_status: "UNSURE",
    },
  });

  it("accepts a safe Bakso Marem analysis", () => {
    expect(baksoInput.success).toBe(true);
    if (!baksoInput.success) return;
    const safeAnalysis = {
      ...validAnalysis,
      business_summary: { ...validAnalysis.business_summary, products_services: "Bakso sapi" },
      offer: { ...validAnalysis.offer, products_services_summary: "Bakso sapi" },
      content_guardrails: { ...validAnalysis.content_guardrails, allowed_claims: [] },
    } as unknown as WebsiteAnalysisV1;
    expect(validateWebsiteAnalysisGrounding(safeAnalysis, baksoInput.data).ok).toBe(true);
  });

  it("rejects a testimonial section when source facts contain no testimonial evidence", () => {
    expect(baksoInput.success).toBe(true);
    if (!baksoInput.success) return;
    const testimonialAnalysis = {
      ...validAnalysis,
      business_summary: { ...validAnalysis.business_summary, products_services: "Bakso sapi" },
      offer: { ...validAnalysis.offer, products_services_summary: "Bakso sapi" },
      content_guardrails: { ...validAnalysis.content_guardrails, allowed_claims: [] },
      section_plan: [{ section_type: "Testimoni", purpose: "Kutipan pelanggan", key_points: ["Rasa khas"], cta: null }],
    } as unknown as WebsiteAnalysisV1;

    expect(validateWebsiteAnalysisGrounding(testimonialAnalysis, baksoInput.data)).toEqual({
      ok: false,
      error: "UNSUPPORTED_TESTIMONIAL_CLAIM:section_plan.0.section_type",
    });
    expect(getTestimonialSectionDiagnostic(testimonialAnalysis, baksoInput.data)).toMatchObject({
      ruleIdentifier: "UNSUPPORTED_TESTIMONIAL_CLAIM",
      path: "section_plan.0.section_type",
    });
  });

  it("allows a testimonial section when source facts contain testimonial evidence", () => {
    const sourceWithEvidence = buildWebsiteAnalysisInput({
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: "Bakso sapi",
        usp: "Rasa khas",
        whatsapp: null,
        address: null,
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: "Meningkatkan penjualan",
        style_preference: "Modern",
        color_preference: null,
        reference_urls: null,
        notes: "Testimoni pelanggan tersedia sebagai source fact.",
        image_mode: "AI",
        halal_status: "UNSURE",
      },
    });
    expect(sourceWithEvidence.success).toBe(true);
    if (!sourceWithEvidence.success) return;
    const testimonialAnalysis = {
      ...validAnalysis,
      business_summary: { ...validAnalysis.business_summary, products_services: "Bakso sapi" },
      offer: { ...validAnalysis.offer, products_services_summary: "Bakso sapi" },
      content_guardrails: { ...validAnalysis.content_guardrails, allowed_claims: [] },
      section_plan: [{ section_type: "Testimoni", purpose: "Kutipan pelanggan", key_points: ["Rasa khas"], cta: null }],
    } as unknown as WebsiteAnalysisV1;

    expect(validateWebsiteAnalysisGrounding(testimonialAnalysis, sourceWithEvidence.data)).toEqual({ ok: true });
  });

  it("omits testimonial sections from provider instructions when evidence is absent", () => {
    expect(buildWebsiteAnalysisSystemPrompt(baksoInput.success ? baksoInput.data : undefined)).toContain("No testimonial evidence is present in source facts");
  });

  it("rejects an invented Bakso product and unsupported claim", () => {
    expect(baksoInput.success).toBe(true);
    if (!baksoInput.success) return;
    const unsafeAnalysis = {
      ...validAnalysis,
      business_summary: { ...validAnalysis.business_summary, products_services: "Bakso sapi dan bakso special" },
      offer: { ...validAnalysis.offer, products_services_summary: "Bakso sapi dan bakso special" },
      content_guardrails: { ...validAnalysis.content_guardrails, allowed_claims: ["Harga terjangkau"] },
    } as unknown as WebsiteAnalysisV1;
    expect(validateWebsiteAnalysisGrounding(unsafeAnalysis, baksoInput.data).ok).toBe(false);
    const diagnostic = getWebsiteAnalysisGroundingDiagnostic(unsafeAnalysis, baksoInput.data);
    expect(diagnostic).toEqual({
      ruleIdentifier: "UNSUPPORTED_PRODUCT_CLAIM",
      path: "offer.products_services_summary",
      code: "grounding",
      category: "unsupported product/service claim",
    });
  });

  it("accepts equivalent compound product formatting but rejects invented products", () => {
    const sourceInput = buildWebsiteAnalysisInput({
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: { name: "Bakso Marem", business_type: "Warung Bakso", target_market: "Keluarga", products_services: "bakso sapi, mie ayam, es teler", usp: null, whatsapp: null, address: null },
      brief: { primary_cta: "Pesan", website_goal: "Penjualan", style_preference: "Modern", color_preference: null, reference_urls: null, notes: "tonjolkan menu Bakso Sapi lebih kuat pada bagian hero", image_mode: "AI", halal_status: "UNSURE" },
    });
    expect(sourceInput.success).toBe(true);
    if (!sourceInput.success) return;

    expect(normalizeProductServiceTokens("Bakso Sapi dan Mie Ayam / Es Teler")).toEqual(["bakso sapi", "es teler", "mie ayam"]);
    expect(normalizeProductServiceTokens("Bakso Sapi | Mie Ayam | Es Teler")).toEqual(["bakso sapi", "es teler", "mie ayam"]);

    const equivalent = {
      ...validAnalysis,
      business_summary: { ...validAnalysis.business_summary, products_services: "Bakso Sapi dan Mie Ayam / Es Teler" },
      offer: { ...validAnalysis.offer, products_services_summary: "Bakso Sapi, Mie Ayam, Es Teler" },
      content_guardrails: { ...validAnalysis.content_guardrails, allowed_claims: [] },
    } as unknown as WebsiteAnalysisV1;
    expect(validateWebsiteAnalysisGrounding(equivalent, sourceInput.data)).toEqual({ ok: true });

    const invented = {
      ...equivalent,
      offer: { ...equivalent.offer, products_services_summary: "Bakso Sapi, Mie Ayam, Es Teler, Bakso Premium" },
    } as unknown as WebsiteAnalysisV1;
    expect(validateWebsiteAnalysisGrounding(invented, sourceInput.data)).toEqual({ ok: false, error: "UNSUPPORTED_PRODUCT_CLAIM" });

    const removed = {
      ...equivalent,
      business_summary: { ...equivalent.business_summary, products_services: "Bakso Sapi, Mie Ayam" },
    } as unknown as WebsiteAnalysisV1;
    expect(validateWebsiteAnalysisGrounding(removed, sourceInput.data)).toEqual({ ok: false, error: "UNSUPPORTED_PRODUCT_CLAIM" });

    expect(normalizeProductServiceTokens(" bakso sapi ; MIE AYAM / es teler ")).toEqual(["bakso sapi", "es teler", "mie ayam"]);
    expect(normalizeProductServiceTokens("meatball, chicken noodles, es teler")).not.toEqual(normalizeProductServiceTokens("bakso sapi, mie ayam, es teler"));
  });

  it("normalizes unsupported allowed claims while preserving supported claims", () => {
    expect(baksoInput.success).toBe(true);
    if (!baksoInput.success) return;
    const candidate = {
      ...validAnalysis,
      business_summary: { ...validAnalysis.business_summary, products_services: "Bakso sapi" },
      offer: { ...validAnalysis.offer, products_services_summary: "Bakso sapi" },
      content_guardrails: {
        ...validAnalysis.content_guardrails,
        allowed_claims: ["Bakso sapi", "Klaim yang tidak ada"],
        prohibited_claims: ["Jangan membuat klaim baru"],
      },
    } as unknown as WebsiteAnalysisV1;
    const normalized = normalizeWebsiteAnalysisAllowedClaims(candidate, baksoInput.data);

    expect(normalized.analysis.content_guardrails.allowed_claims).toEqual(["Bakso sapi"]);
    expect(normalized.analysis.content_guardrails.prohibited_claims).toEqual(["Jangan membuat klaim baru"]);
    expect(normalized.beforeCount).toBe(2);
    expect(normalized.removedCount).toBe(1);
    expect(normalized.afterCount).toBe(1);
    expect(validateWebsiteAnalysisGrounding(normalized.analysis, baksoInput.data)).toEqual({ ok: true });
  });

  it("normalizes raw allowed claims before strict parsing", () => {
    expect(baksoInput.success).toBe(true);
    if (!baksoInput.success) return;
    const raw = structuredClone(validAnalysis);
    raw.business_summary.products_services = "Bakso sapi";
    raw.offer.products_services_summary = "Bakso sapi";
    raw.content_guardrails.allowed_claims = [" Makanan enak ", "Bakso sapi", "bakso sapi", "N/A", "Klaim yang tidak ada"];

    const normalized = normalizeWebsiteAnalysisAllowedClaimsOutput(raw, baksoInput.data) as typeof raw;

    expect(normalized.content_guardrails.allowed_claims).toEqual(["Bakso sapi"]);
    expect(normalized.offer).toEqual(raw.offer);
    expect(parseWebsiteAnalysisV1(normalized).success).toBe(true);
  });

  it("removes marketing claims before strict parsing while preserving valid claims", () => {
    expect(baksoInput.success).toBe(true);
    if (!baksoInput.success) return;
    const raw = structuredClone(validAnalysis);
    raw.business_summary.products_services = "Bakso sapi";
    raw.offer.products_services_summary = "Bakso sapi";
    raw.content_guardrails.allowed_claims = [
      "Makanan enak",
      "Bakso sapi",
      "Pesan sekarang",
      "bakso sapi",
      "Harga terjangkau",
      "Klaim yang tidak ada",
    ];

    const normalized = normalizeWebsiteAnalysisAllowedClaimsOutput(raw, baksoInput.data) as typeof raw;

    expect(normalized.content_guardrails.allowed_claims).toEqual(["Bakso sapi", "Pesan sekarang"]);
    expect(parseWebsiteAnalysisV1(normalized).success).toBe(true);
    expect(validateWebsiteAnalysisGrounding(normalized as unknown as WebsiteAnalysisV1, baksoInput.data)).toEqual({ ok: true });
  });

  it("normalizes all unsupported allowed claims to an empty array", () => {
    expect(baksoInput.success).toBe(true);
    if (!baksoInput.success) return;
    const candidate = {
      ...validAnalysis,
      business_summary: { ...validAnalysis.business_summary, products_services: "Bakso sapi" },
      offer: { ...validAnalysis.offer, products_services_summary: "Bakso sapi" },
      content_guardrails: { ...validAnalysis.content_guardrails, allowed_claims: ["Klaim yang tidak ada"] },
    } as unknown as WebsiteAnalysisV1;
    const normalized = normalizeWebsiteAnalysisAllowedClaims(candidate, baksoInput.data);

    expect(normalized.analysis.content_guardrails.allowed_claims).toEqual([]);
    expect(validateWebsiteAnalysisGrounding(normalized.analysis, baksoInput.data)).toEqual({ ok: true });
  });

  it("normalizes unsupported testimonial wording in section key_points", () => {
    expect(baksoInput.success).toBe(true);
    if (!baksoInput.success) return;
    const candidate = {
      ...validAnalysis,
      business_summary: { ...validAnalysis.business_summary, products_services: "Bakso sapi" },
      offer: { ...validAnalysis.offer, products_services_summary: "Bakso sapi" },
      content_guardrails: { ...validAnalysis.content_guardrails, allowed_claims: [] },
      section_plan: [{ ...validAnalysis.section_plan[0], key_points: ["Pelanggan puas", "Bakso sapi"] }],
    } as unknown as WebsiteAnalysisV1;
    const normalized = normalizeUnsupportedTestimonialClaims(candidate, baksoInput.data);
    expect(normalized.changedPaths).toContain("section_plan.0.key_points.0");
    expect(normalized.analysis.section_plan[0].key_points).toEqual([
      "Menjelaskan produk atau layanan berdasarkan informasi sumber",
      "Bakso sapi",
    ]);
    expect(validateWebsiteAnalysisGrounding(normalized.analysis, baksoInput.data)).toEqual({ ok: true });
  });

  it("removes unsupported social proof patterns without mutating unrelated fields", () => {
    expect(baksoInput.success).toBe(true);
    if (!baksoInput.success) return;
    const candidate = {
      ...validAnalysis,
      business_summary: { ...validAnalysis.business_summary, products_services: "Bakso sapi" },
      offer: { ...validAnalysis.offer, products_services_summary: "Bakso sapi" },
      section_plan: [{ ...validAnalysis.section_plan[0], purpose: "Favorit banyak orang", key_points: ["1000 pelanggan memilih kami"] }],
    } as unknown as WebsiteAnalysisV1;
    const normalized = normalizeUnsupportedTestimonialClaims(candidate, baksoInput.data);
    expect(normalized.analysis.section_plan[0].purpose).toBe("Menjelaskan informasi bisnis dan layanan");
    expect(normalized.analysis.section_plan[0].key_points[0]).toBe("Menjelaskan produk atau layanan berdasarkan informasi sumber");
    expect(normalized.analysis.business_summary).toEqual(candidate.business_summary);
    expect(normalized.analysis.offer).toEqual(candidate.offer);
  });

  it("preserves supported testimonial wording when source evidence exists", () => {
    const sourceWithEvidence = buildWebsiteAnalysisInput({
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: { name: "Bakso Marem", business_type: "Warung Bakso", target_market: "Keluarga", products_services: "Bakso sapi", usp: null, whatsapp: null, address: null },
      brief: { primary_cta: "Pesan", website_goal: "Penjualan", style_preference: "Modern", color_preference: null, reference_urls: null, notes: "Review pelanggan tersedia", image_mode: "AI", halal_status: "UNSURE" },
    });
    expect(sourceWithEvidence.success).toBe(true);
    if (!sourceWithEvidence.success) return;
    const candidate = { ...validAnalysis, section_plan: [{ ...validAnalysis.section_plan[0], key_points: ["Pelanggan puas"] }] } as unknown as WebsiteAnalysisV1;
    const normalized = normalizeUnsupportedTestimonialClaims(candidate, sourceWithEvidence.data);
    expect(normalized.changedPaths).toEqual([]);
    expect(normalized.analysis.section_plan[0].key_points).toEqual(["Pelanggan puas"]);
  });

  it("keeps source-dependent allowed claims out of structural parsing", () => {
    const candidate = {
      ...validAnalysis,
      content_guardrails: { ...validAnalysis.content_guardrails, allowed_claims: ["Klaim yang tidak ada"] },
    };

    expect(parseWebsiteAnalysisV1(candidate).success).toBe(true);
  });
});

describe("Analysis completion lifecycle contract", () => {
  it("moves analysis completion from ANALYZING to GENERATING_CONTENT", () => {
    const migration = readFileSync("../schema/migrations/20260911_phase5g3b_fix_analysis_completion_status.sql", "utf8");

    expect(migration).toContain("gj.status = 'ANALYZING'::public.generation_status");
    expect(migration).toContain("set status = 'GENERATING_CONTENT'::public.generation_status");
    expect(migration).not.toContain("set status = 'LIVE'::public.generation_status");
    expect(migration).not.toContain("set status = 'RENDERING'::public.generation_status");
    expect(migration).not.toContain("set status = 'DEPLOYING'::public.generation_status");
    expect(migration).not.toContain("set status = 'VERIFYING'::public.generation_status");
  });
});

describe("Route auth and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing Authorization header", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.UNAUTHORIZED, reason: "missing-header" });

    const response = await POSTComplete(new Request("http://localhost/api/internal/generation/analysis/complete", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("rejects wrong worker Authorization", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.UNAUTHORIZED, reason: "invalid-token" });

    const response = await POSTComplete(new Request("http://localhost/api/internal/generation/analysis/complete", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });

    const response = await POSTComplete(new Request("http://localhost/api/internal/generation/analysis/complete", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: "not-json",
    }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid job UUID", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });

    const response = await POSTComplete(new Request("http://localhost/api/internal/generation/analysis/complete", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ ...validAnalysis, job_id: "bad-uuid" }),
    }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid analysis schema", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });

    const response = await POSTComplete(new Request("http://localhost/api/internal/generation/analysis/complete", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ schema_version: "wrong" }),
    }));
    expect(response.status).toBe(400);
  });

  it("returns 409 for lifecycle conflict", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    vi.mocked(getServiceRoleClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "PGRST301", message: "Generation job is not available for completion" } }),
    } as never);

    const response = await POSTComplete(new Request("http://localhost/api/internal/generation/analysis/complete", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify(validAnalysis),
    }));
    expect(response.status).toBe(409);
  });

  it("returns 5xx for RPC infrastructure failure", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    vi.mocked(getServiceRoleClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "500", message: "database unavailable" } }),
    } as never);

    const response = await POSTComplete(new Request("http://localhost/api/internal/generation/analysis/complete", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify(validAnalysis),
    }));
    expect(response.status).toBe(500);
  });

  it("returns normalized success response on successful RPC", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    vi.mocked(getServiceRoleClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: [{ job_id: validAnalysis.job_id, status: "GENERATING_CONTENT" }], error: null }),
    } as never);

    const response = await POSTComplete(new Request("http://localhost/api/internal/generation/analysis/complete", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify(validAnalysis),
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.job_id).toBe(validAnalysis.job_id);
    expect(json.status).toBe("GENERATING_CONTENT");
  });
});

describe("Legacy compatibility mapper", () => {
  it("normalizes a legacy snapshot with missing image_mode and halal_status", () => {
    const legacySnapshot = {
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: "Bakso sapi",
        usp: null,
        whatsapp: null,
        address: null,
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: null,
        style_preference: null,
        color_preference: null,
        reference_urls: null,
        notes: null,
      },
    };

    const normalized = buildWebsiteAnalysisInput(legacySnapshot);
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(normalized.data.schema_version).toBe("website_analysis_input_v1");
    expect(normalized.data.brief.image_mode).toBe("AI");
    expect(normalized.data.brief.halal_status).toBe("UNSURE");
    expect(normalized.data.compatibility.legacy_snapshot).toBe(true);
    expect(normalized.data.compatibility.defaults_applied).toEqual(["image_mode", "halal_status"]);
  });

  it("preserves a complete future snapshot without fallback", () => {
    const futureSnapshot = {
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: "Bakso sapi",
        usp: "Rasa khas",
        whatsapp: "6281234567890",
        address: "Bandung",
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: "Meningkatkan penjualan",
        style_preference: "Modern",
        color_preference: "#1F2937",
        reference_urls: ["https://example.com"],
        notes: "Catatan",
        image_mode: "MIXED",
        halal_status: "CERTIFIED",
      },
    };

    const normalized = buildWebsiteAnalysisInput(futureSnapshot);
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(normalized.data.brief.image_mode).toBe("MIXED");
    expect(normalized.data.brief.halal_status).toBe("CERTIFIED");
    expect(normalized.data.compatibility.legacy_snapshot).toBe(false);
    expect(normalized.data.compatibility.defaults_applied).toEqual([]);
  });

  it("fails closed when required core fields are missing", () => {
    const invalid = {
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: null,
        usp: null,
        whatsapp: null,
        address: null,
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: null,
        style_preference: null,
        color_preference: null,
        reference_urls: null,
        notes: null,
        image_mode: "AI",
        halal_status: "UNSURE",
      },
    };

    expect(buildWebsiteAnalysisInput(invalid).success).toBe(false);
  });

  it("fails closed for invalid image_mode and invalid halal_status when supplied", () => {
    expect(buildWebsiteAnalysisInput({
      ...{
        schema_version: 1,
        site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
        business: {
          name: "Bakso Marem",
          business_type: "Warung Bakso",
          target_market: "Keluarga",
          products_services: "Bakso sapi",
          usp: null,
          whatsapp: null,
          address: null,
        },
        brief: {
          primary_cta: "Pesan Sekarang",
          website_goal: null,
          style_preference: null,
          color_preference: null,
          reference_urls: null,
          notes: null,
          image_mode: "INVALID",
          halal_status: "UNSURE",
        },
      },
    }).success).toBe(false);

    expect(buildWebsiteAnalysisInput({
      ...{
        schema_version: 1,
        site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
        business: {
          name: "Bakso Marem",
          business_type: "Warung Bakso",
          target_market: "Keluarga",
          products_services: "Bakso sapi",
          usp: null,
          whatsapp: null,
          address: null,
        },
        brief: {
          primary_cta: "Pesan Sekarang",
          website_goal: null,
          style_preference: null,
          color_preference: null,
          reference_urls: null,
          notes: null,
          image_mode: "AI",
          halal_status: "INVALID",
        },
      },
    }).success).toBe(false);
  });

  it("keeps the deterministic UNSURE halal guardrail intact for normalized legacy input", () => {
    const normalized = buildWebsiteAnalysisInput({
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: "Bakso sapi",
        usp: null,
        whatsapp: null,
        address: null,
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: null,
        style_preference: null,
        color_preference: null,
        reference_urls: null,
        notes: "Kami sudah bersertifikat halal",
        image_mode: "AI",
      },
    });

    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(normalized.data.brief.halal_status).toBe("UNSURE");
    expect(validateHalalAnalysisSafety({ content_guardrails: { halal_status: normalized.data.brief.halal_status, allowed_claims: [], prohibited_claims: [] } } as never).ok).toBe(true);
    const unsafeClaim = {
      ...validAnalysis,
      content_guardrails: { ...validAnalysis.content_guardrails, halal_status: "UNSURE" },
      offer: { ...validAnalysis.offer, value_proposition: "Produk kami sudah bersertifikat halal" },
    } as Parameters<typeof validateHalalAnalysisSafety>[0];
    expect(validateHalalAnalysisSafety(unsafeClaim).ok).toBe(false);
  });
});

describe("Resume-safe analysis input route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing auth", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.UNAUTHORIZED, reason: "missing-header" });

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("rejects wrong auth", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.UNAUTHORIZED, reason: "invalid-token" });

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(401);
  });

  it("rejects malformed body", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: "not-json",
    }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid UUID", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: "bad-uuid" }),
    }));
    expect(response.status).toBe(400);
  });

  it("rejects unknown job", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));
    expect(response.status).toBe(404);
  });

  it("rejects QUEUED job with 409", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnalysis.job_id, site_id: validAnalysis.site_id, status: "QUEUED", job_type: "CREATE", input_snapshot: validAnalysis }, error: null }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));
    expect(response.status).toBe(409);
  });

  it("rejects non-CREATE job type while ANALYZING", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnalysis.job_id, site_id: validAnalysis.site_id, status: "ANALYZING", job_type: "UPDATE", input_snapshot: validAnalysis }, error: null }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("JOB_TYPE_NOT_ALLOWED");
  });

  it("returns the immutable input_snapshot for an ANALYZING CREATE job", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const validInputSnapshot = {
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: "Bakso sapi",
        usp: "Rasa khas",
        whatsapp: "6281234567890",
        address: "Bandung",
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: "Meningkatkan penjualan",
        style_preference: "Modern",
        color_preference: "#1F2937",
        reference_urls: ["https://example.com"],
        notes: "Catatan",
        image_mode: "MIXED",
        halal_status: "CERTIFIED",
      },
    };
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnalysis.job_id, site_id: validAnalysis.site_id, status: "ANALYZING", job_type: "CREATE", input_snapshot: validInputSnapshot }, error: null }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.job.job_id).toBe(validAnalysis.job_id);
    expect(json.job.site_id).toBe(validAnalysis.site_id);
    expect(json.job.status).toBe("ANALYZING");
    expect(json.job.input_snapshot).toEqual(validInputSnapshot);
    expect(json.job.analysis_input.schema_version).toBe("website_analysis_input_v1");
    expect(json.job.analysis_input.brief.image_mode).toBe("MIXED");
    expect(json.job.analysis_input.brief.halal_status).toBe("CERTIFIED");
  });

  it("returns normalized legacy analysis_input for an ANALYZING CREATE job", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const legacySnapshot = {
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: "Bakso sapi",
        usp: null,
        whatsapp: null,
        address: null,
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: null,
        style_preference: null,
        color_preference: null,
        reference_urls: null,
        notes: null,
      },
    };
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnalysis.job_id, site_id: validAnalysis.site_id, status: "ANALYZING", job_type: "CREATE", input_snapshot: legacySnapshot }, error: null }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.job.input_snapshot).toEqual(legacySnapshot);
    expect(json.job.analysis_input.schema_version).toBe("website_analysis_input_v1");
    expect(json.job.analysis_input.brief.image_mode).toBe("AI");
    expect(json.job.analysis_input.brief.halal_status).toBe("UNSURE");
    expect(json.job.analysis_input.compatibility.legacy_snapshot).toBe(true);
    expect(json.job.analysis_input.compatibility.defaults_applied).toEqual(["image_mode", "halal_status"]);
  });

  it("preserves future snapshot values in normalized analysis_input", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const futureSnapshot = {
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: "Bakso sapi",
        usp: "Rasa khas",
        whatsapp: "6281234567890",
        address: "Bandung",
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: "Meningkatkan penjualan",
        style_preference: "Modern",
        color_preference: "#1F2937",
        reference_urls: ["https://example.com"],
        notes: "Catatan",
        image_mode: "MIXED",
        halal_status: "CERTIFIED",
      },
    };
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnalysis.job_id, site_id: validAnalysis.site_id, status: "ANALYZING", job_type: "CREATE", input_snapshot: futureSnapshot }, error: null }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.job.analysis_input.brief.image_mode).toBe("MIXED");
    expect(json.job.analysis_input.brief.halal_status).toBe("CERTIFIED");
    expect(json.job.analysis_input.compatibility.legacy_snapshot).toBe(false);
    expect(json.job.analysis_input.compatibility.defaults_applied).toEqual([]);
  });

  it("fails closed for missing unsupported core fields", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const invalidSnapshot = {
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: null,
        usp: null,
        whatsapp: null,
        address: null,
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: null,
        style_preference: null,
        color_preference: null,
        reference_urls: null,
        notes: null,
        image_mode: "AI",
        halal_status: "UNSURE",
      },
    };
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnalysis.job_id, site_id: validAnalysis.site_id, status: "ANALYZING", job_type: "CREATE", input_snapshot: invalidSnapshot }, error: null }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));

    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("ANALYSIS_INPUT_INVALID");
  });

  it("fails closed for invalid present image_mode", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const invalidSnapshot = {
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: "Bakso sapi",
        usp: null,
        whatsapp: null,
        address: null,
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: null,
        style_preference: null,
        color_preference: null,
        reference_urls: null,
        notes: null,
        image_mode: "INVALID",
        halal_status: "UNSURE",
      },
    };
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnalysis.job_id, site_id: validAnalysis.site_id, status: "ANALYZING", job_type: "CREATE", input_snapshot: invalidSnapshot }, error: null }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));

    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("ANALYSIS_INPUT_INVALID");
  });

  it("fails closed for invalid present halal_status", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const invalidSnapshot = {
      schema_version: 1,
      site: { id: validAnalysis.site_id, name: "Bakso Marem", slug: "bakso-marem" },
      business: {
        name: "Bakso Marem",
        business_type: "Warung Bakso",
        target_market: "Keluarga",
        products_services: "Bakso sapi",
        usp: null,
        whatsapp: null,
        address: null,
      },
      brief: {
        primary_cta: "Pesan Sekarang",
        website_goal: null,
        style_preference: null,
        color_preference: null,
        reference_urls: null,
        notes: null,
        image_mode: "AI",
        halal_status: "INVALID",
      },
    };
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnalysis.job_id, site_id: validAnalysis.site_id, status: "ANALYZING", job_type: "CREATE", input_snapshot: invalidSnapshot }, error: null }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));

    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("ANALYSIS_INPUT_INVALID");
  });

  it("returns a safe 500 on DB failure", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } }),
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    const response = await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));
    expect(response.status).toBe(500);
  });

  it("performs no mutation operation", async () => {
    vi.mocked(authenticateWorkerRequest).mockReturnValue({ status: AUTH_RESULT.AUTHORIZED });
    const update = vi.fn();
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnalysis.job_id, site_id: validAnalysis.site_id, status: "ANALYZING", job_type: "CREATE", input_snapshot: validAnalysis }, error: null }),
      update,
    };
    vi.mocked(getServiceRoleClient).mockResolvedValue({ from: vi.fn().mockReturnValue(fromMock) } as never);

    await POSTInput(new Request("http://localhost/api/internal/generation/analysis/input", {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: JSON.stringify({ job_id: validAnalysis.job_id }),
    }));

    expect(update).not.toHaveBeenCalled();
  });
});
