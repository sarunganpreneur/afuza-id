import { describe, expect, it } from "vitest";

import { normalizeLeadInput, normalizeWhatsapp, requestHash } from "./normalize";

describe("Lead Engine normalization", () => {
  it("normalizes Indonesian 08 WhatsApp numbers", () => {
    expect(normalizeWhatsapp("0812-3456-7890")).toBe("6281234567890");
  });

  it("normalizes bare Indonesian mobile numbers", () => {
    expect(normalizeWhatsapp("81234567890")).toBe("6281234567890");
  });

  it("preserves international country-code digits", () => {
    expect(normalizeWhatsapp("+65 8123 4567")).toBe("6581234567");
  });

  it("rejects unusable WhatsApp values", () => {
    expect(() => normalizeWhatsapp("123")).toThrow("INVALID_WHATSAPP");
  });

  it("trims lead fields and turns blank optional text into null", () => {
    const result = normalizeLeadInput({
      lead_id: " EX-001 ",
      business_name: " Contoh Madrasah ",
      source: " Google Maps ",
      city: "   ",
      whatsapp: "081234567890",
    });

    expect(result.lead_id).toBe("EX-001");
    expect(result.business_name).toBe("Contoh Madrasah");
    expect(result.source).toBe("Google Maps");
    expect(result.city).toBeNull();
    expect(result.whatsapp).toBe("6281234567890");
  });

  it("creates stable hashes independent of object key order", () => {
    expect(requestHash({ a: 1, b: 2 })).toBe(requestHash({ b: 2, a: 1 }));
  });
});
