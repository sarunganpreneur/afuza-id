import { describe, expect, it } from "vitest";

import { validSiteContentFixtures } from "./fixtures";
import { invalidSiteContentFixtures } from "./fixtures.invalid";
import type { SiteContentV1 } from "./schema";
import {
  normalizeWhatsAppNumber,
  parseSiteContentV1,
  safeParseSiteContentV1,
  getSiteContentValidationDiagnostics,
  normalizeAndValidateSiteContentV1,
  normalizeSiteContentWhatsAppCtas,
  normalizeSiteContentInternalTargets,
  getSiteContentSemanticDiagnostics,
  validateSafeImageUrl,
  validateSafeCanonicalUrl,
  validateSafeTarget,
  validateSiteContentV1Semantics,
} from "./validation";

const hero = (value: SiteContentV1) => value.sections[0] as Extract<SiteContentV1["sections"][number], { type: "hero" }>;

describe("SiteContentV1 valid fixtures", () => {
  for (const [name, fixture] of Object.entries(validSiteContentFixtures)) {
    it(`accepts ${name}`, () => {
      expect(parseSiteContentV1(fixture).success).toBe(true);
    });
  }
});

describe("SiteContentV1 invalid fixtures", () => {
  for (const [name, fixture] of Object.entries(invalidSiteContentFixtures)) {
    it(`rejects ${name}`, () => {
      expect(safeParseSiteContentV1(fixture).success).toBe(false);
    });
  }
});

describe("SiteContentV1 contract diagnostics", () => {
  it("rejects root additions, missing fields, and invalid schema versions", () => {
    const extra = { ...validSiteContentFixtures.umkmKuliner, unexpected: true };
    const missing = structuredClone(validSiteContentFixtures.umkmKuliner);
    delete (missing as Partial<typeof missing>).footer;
    const invalidVersion = { ...validSiteContentFixtures.umkmKuliner, schemaVersion: "wrong" };

    expect(safeParseSiteContentV1(extra).success).toBe(false);
    expect(safeParseSiteContentV1(missing).success).toBe(false);
    expect(safeParseSiteContentV1(invalidVersion).success).toBe(false);
  });

  it("limits sanitized diagnostics to ten path/code entries", () => {
    const invalid = { unexpected: true };
    const result = safeParseSiteContentV1(invalid);
    const diagnostics = getSiteContentValidationDiagnostics(result);
    expect(diagnostics).toHaveLength(8);
    expect(diagnostics.every((issue) => issue.path && issue.code)).toBe(true);
  });
});

describe("SiteContentV1 target and image security", () => {
  it("accepts internal paths, anchors, and HTTPS targets", () => {
    expect(validateSafeTarget("/tentang", "internal").ok).toBe(true);
    expect(validateSafeTarget("#about", "anchor").ok).toBe(true);
    expect(validateSafeTarget("https://example.com", "external").ok).toBe(true);
    expect(validateSafeImageUrl("/images/hero.jpg").ok).toBe(true);
    expect(validateSafeImageUrl("https://cdn.example.com/hero.jpg").ok).toBe(true);
  });

  it("rejects unsafe schemes and protocol-relative URLs", () => {
    for (const target of ["javascript:alert(1)", "data:text/html,x", "file:///tmp/a", "//example.com"]) {
      expect(validateSafeTarget(target).ok).toBe(false);
      expect(validateSafeImageUrl(target).ok).toBe(false);
    }
    expect(validateSafeTarget("http://example.com", "external").ok).toBe(false);
  });

  it("accepts only safe canonical URLs", () => {
    expect(validateSafeCanonicalUrl("https://example.com/site").ok).toBe(true);
    expect(validateSafeCanonicalUrl("/p/example").ok).toBe(true);
    expect(validateSafeCanonicalUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateSafeCanonicalUrl("http://example.com").ok).toBe(false);
  });
});

describe("WhatsApp normalization", () => {
  it("normalizes Indonesian local and formatted numbers", () => {
    expect(normalizeWhatsAppNumber("0812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("+62 (812) 3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("006281234567890")).toBe("6281234567890");
  });

  it("rejects malformed or oversized numbers", () => {
    expect(normalizeWhatsAppNumber("not-a-phone")).toBeNull();
    expect(normalizeWhatsAppNumber("+62+81234567890")).toBeNull();
    expect(normalizeWhatsAppNumber("1234567890123456")).toBeNull();
  });

  it("keeps WhatsApp CTAs source-backed and canonical", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    fixture.sections.push({
      id: "order",
      type: "cta",
      title: "Pesan",
      cta: { label: "WhatsApp", kind: "whatsapp", target: "wa.me/62800000000" },
    });
    const normalized = normalizeSiteContentWhatsAppCtas(fixture, " +62 (812) 3456-7890 ") as SiteContentV1;
    const cta = normalized.sections[3] as Extract<SiteContentV1["sections"][number], { type: "cta" }>;
    expect(cta.cta.target).toBe("6281234567890");
    expect(parseSiteContentV1(normalized).success).toBe(true);
  });

  it("removes invalid optional WhatsApp CTAs without inventing a target", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    const heroSection = hero(fixture);
    heroSection.cta = { label: "WhatsApp", kind: "whatsapp", target: "N/A" };
    const normalized = normalizeSiteContentWhatsAppCtas(fixture, null) as SiteContentV1;
    expect(hero(normalized).cta).toBeUndefined();
    expect(parseSiteContentV1(normalized).success).toBe(true);
  });

  it("does not alter unrelated CTA kinds", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    const heroSection = hero(fixture);
    heroSection.cta = { label: "Website", kind: "external", target: "https://example.com" };
    const normalized = normalizeSiteContentWhatsAppCtas(fixture, null) as SiteContentV1;
    expect(hero(normalized).cta).toEqual(heroSection.cta);
  });
});

describe("SiteContentV1 semantics", () => {
  it("requires unique IDs, a first hero, and valid navigation anchors", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    fixture.sections[1].id = "hero";
    fixture.header.navigation[0].target = "missing";
    const result = validateSiteContentV1Semantics(fixture);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining(["DUPLICATE_SECTION_ID", "NAVIGATION_TARGET_NOT_FOUND:0"]));
  });

  it("does not allow a CTA anchor to point outside the document", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    hero(fixture).cta = { label: "Lihat", kind: "anchor", target: "#missing" };
    const result = validateSiteContentV1Semantics(fixture);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("content.sections[0].cta.ANCHOR_TARGET_NOT_FOUND");
  });
});

describe("SiteContentV1 internal target normalization", () => {
  it("keeps valid navigation and CTA targets unchanged", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    const normalized = normalizeSiteContentInternalTargets(fixture);
    expect(normalized.header.navigation).toEqual(fixture.header.navigation);
    expect(normalized.sections).toEqual(fixture.sections);
  });

  it("maps unique section types, removes unknown navigation, and does not add sections", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    fixture.header.navigation = [
      { label: "Tentang", target: "about" },
      { label: "Unknown", target: "missing" },
    ];
    const beforeSectionCount = fixture.sections.length;
    const normalized = normalizeSiteContentInternalTargets(fixture);
    expect(normalized.header.navigation).toEqual([{ label: "Tentang", target: "about" }]);
    expect(normalized.sections).toHaveLength(beforeSectionCount);
  });

  it("uses the same navigation normalizer for footer links", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    fixture.footer.links = [
      { label: "Tentang", target: "about" },
      { label: "Unknown", target: "missing" },
    ];
    const normalized = normalizeSiteContentInternalTargets(fixture);
    expect(normalized.footer.links).toEqual([{ label: "Tentang", target: "about" }]);
    expect(normalized.sections).toHaveLength(fixture.sections.length);
  });

  it("converts invalid internal CTAs to existing anchors or removes optional CTAs", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    const heroSection = fixture.sections[0] as Extract<SiteContentV1["sections"][number], { type: "hero" }>;
    heroSection.cta = { label: "Tentang", kind: "internal", target: "about" };
    fixture.header.cta = { label: "Unknown", kind: "internal", target: "missing" };
    const normalized = normalizeSiteContentInternalTargets(fixture);
    expect((normalized.sections[0] as typeof heroSection).cta).toEqual({ label: "Tentang", kind: "anchor", target: "#about" });
    expect(normalized.header.cta).toBeUndefined();
  });

  it("normalizes nested item anchors and removes unmappable optional item CTAs", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    const itemSection: Extract<SiteContentV1["sections"][number], { type: "item_grid" }> = {
      id: "items",
      type: "item_grid",
      title: "Items",
      items: [
      { title: "Satu", body: "Isi", cta: { label: "Tentang", kind: "anchor", target: "#about" } },
      { title: "Dua", body: "Isi", cta: { label: "Missing", kind: "anchor", target: "#missing" } },
      ],
    };
    fixture.sections.push(itemSection);
    const normalized = normalizeSiteContentInternalTargets(fixture);
    const normalizedItems = normalized.sections[3] as typeof itemSection;
    expect(normalizedItems.items[0].cta).toEqual({ label: "Tentang", kind: "anchor", target: "#about" });
    expect(normalizedItems.items[1].cta).toBeUndefined();
    expect(normalized.sections).toHaveLength(fixture.sections.length);
  });

  it("preserves external CTAs and keeps direct validation strict", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    const heroSection = fixture.sections[0] as Extract<SiteContentV1["sections"][number], { type: "hero" }>;
    heroSection.cta = { label: "Website", kind: "external", target: "https://example.com" };
    expect(normalizeSiteContentInternalTargets(fixture).sections[0]).toEqual(fixture.sections[0]);

    const broken = structuredClone(validSiteContentFixtures.umkmKuliner);
    const brokenHero = broken.sections[0] as Extract<SiteContentV1["sections"][number], { type: "hero" }>;
    brokenHero.cta = { label: "Missing", kind: "anchor", target: "#missing" };
    expect(safeParseSiteContentV1(broken).success).toBe(false);
    expect(normalizeAndValidateSiteContentV1(broken).success).toBe(true);
  });

  it("removes unsafe optional images while preserving safe images", () => {
    const fixture = structuredClone(validSiteContentFixtures.umkmKuliner);
    const heroSection = fixture.sections[0] as Extract<SiteContentV1["sections"][number], { type: "hero" }>;
    heroSection.image = "data:image/png;base64,unsafe";
    fixture.seo.image = "/images/og.jpg";
    const diagnostics = getSiteContentSemanticDiagnostics(fixture);
    expect(diagnostics).toEqual(expect.arrayContaining([{ path: "content.sections[0].image", code: "UNSAFE_IMAGE_URL", category: "data URL" }]));
    const normalized = normalizeSiteContentInternalTargets(fixture);
    expect((normalized.sections[0] as typeof heroSection).image).toBeUndefined();
    expect(normalized.seo.image).toBe("/images/og.jpg");
    expect(normalizeAndValidateSiteContentV1(fixture).success).toBe(true);
  });
});