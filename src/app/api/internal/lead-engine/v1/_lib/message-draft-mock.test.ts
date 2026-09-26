import { describe, expect, it } from "vitest";

import {
  validateDraftOutput,
  type MessageDraftInput,
} from "./message-draft";
import {
  createStagingMockMessageDraftProvider,
  resolveMessageDraftProviderMode,
  WF04_STAGING_APP_ROOT,
  WF04_STAGING_MOCK_RISK_FLAG,
} from "./message-draft-mock";

const input: MessageDraftInput = {
  lead: {
    lead_id: "STAGE-WF04-MOCK-001",
    business_name: "Madrasah Synthetic",
    category: "Madrasah",
    city: "Kendal",
    source: "STAGING_MOCK_TEST",
    observation: "Belum memiliki website yang terdeteksi pada data publik yang digunakan.",
    has_no_website: true,
    website_low_quality: false,
    google_maps_active: true,
    recent_reviews: true,
  },
  template_code: "WA-EDU-001",
  observation: "Belum memiliki website yang terdeteksi pada data publik yang digunakan.",
  offer: {
    name: "Landing Page 100K",
    description: "Landing page satu halaman.",
    price_text: "Rp100.000",
  },
  cta: "Kirim contoh",
};

describe("WF-04 staging mock provider", () => {
  it("defaults to OpenAI mode", () => {
    expect(resolveMessageDraftProviderMode({
      cwd: WF04_STAGING_APP_ROOT,
    })).toEqual({ ok: true, mode: "openai" });
  });

  it("rejects mock mode without the explicit staging enable flag", () => {
    expect(resolveMessageDraftProviderMode({
      mode: "mock",
      mockEnabled: "false",
      cwd: WF04_STAGING_APP_ROOT,
    })).toEqual({ ok: false, code: "WF04_STAGING_MOCK_SCOPE_DENIED" });
  });

  it("rejects mock mode outside the exact staging app root", () => {
    expect(resolveMessageDraftProviderMode({
      mode: "mock",
      mockEnabled: "true",
      cwd: "/home/afuzaid/apps/afuza-id",
    })).toEqual({ ok: false, code: "WF04_STAGING_MOCK_SCOPE_DENIED" });
  });

  it("rejects unknown provider modes", () => {
    expect(resolveMessageDraftProviderMode({
      mode: "anything-else",
      mockEnabled: "true",
      cwd: WF04_STAGING_APP_ROOT,
    })).toEqual({ ok: false, code: "MESSAGE_DRAFT_PROVIDER_MISCONFIGURED" });
  });

  it("generates a deterministic policy-valid draft with send disabled", async () => {
    const selection = resolveMessageDraftProviderMode({
      mode: "mock",
      mockEnabled: "true",
      cwd: WF04_STAGING_APP_ROOT,
    });
    expect(selection).toEqual({ ok: true, mode: "mock" });

    const provider = createStagingMockMessageDraftProvider(WF04_STAGING_APP_ROOT);
    const first = await provider.generate(input);
    const second = await provider.generate(input);

    expect(first).toEqual(second);

    const validation = validateDraftOutput(first, {
      template_code: input.template_code,
      observation: input.observation,
      offer: input.offer,
      cta: input.cta,
    });

    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.draft.risk_flags).toContain(WF04_STAGING_MOCK_RISK_FLAG);
      expect(validation.draft.recommended_send).toBe(false);
      expect(validation.draft.personalized_message).toContain("Rp100.000");
      expect(validation.draft.personalized_message).toContain(input.observation);
    }
  });
});
