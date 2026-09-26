import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOpenAiMessageDraftProvider,
  MessageDraftProviderError,
} from "./message-draft-openai";

const input = {
  lead: {
    lead_id: "L-1",
    business_name: "Madrasah A",
    category: "Madrasah",
    city: "Kendal",
    source: "STAGING_TEST",
    observation: null,
    has_no_website: true,
    website_low_quality: false,
    google_maps_active: true,
    recent_reviews: true,
  },
  template_code: "WA-EDU-001" as const,
  observation: "Belum memiliki website yang terdeteksi pada data publik yang digunakan.",
  offer: {
    name: "Landing Page 100K",
    description: "Landing page satu halaman.",
    price_text: "Rp100.000",
  },
  cta: "Kirim contoh",
};

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  vi.restoreAllMocks();
});

describe("WF-04 OpenAI provider", () => {
  it("fails closed without API key", async () => {
    await expect(
      createOpenAiMessageDraftProvider({ fetch: vi.fn() as never }).generate(input),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
  });

  it("parses strict JSON response", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            template_id: "WA-EDU-001",
            message_type: "FIRST_CONTACT",
            personalized_message: "Halo",
            observed_fact_used: input.observation,
            cta: "Kirim contoh",
            risk_flags: [],
            recommended_send: true,
          }),
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await createOpenAiMessageDraftProvider({
      apiKey: "test-key",
      fetch: fetcher as never,
    }).generate(input);

    expect(result).toMatchObject({
      template_id: "WA-EDU-001",
      message_type: "FIRST_CONTACT",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sanitizes provider errors", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "Bearer sk-secret-123 failed", code: "bad" },
    }), { status: 400, headers: { "content-type": "application/json" } }));

    try {
      await createOpenAiMessageDraftProvider({
        apiKey: "sk-secret-123",
        fetch: fetcher as never,
      }).generate(input);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(MessageDraftProviderError);
      expect(String((error as Error).message)).not.toContain("sk-secret-123");
    }
  });
});
