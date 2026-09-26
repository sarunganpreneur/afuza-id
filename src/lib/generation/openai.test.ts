import { describe, expect, it, vi } from "vitest";

import { createOpenAiGenerationProvider, SITE_CONTENT_RESPONSE_SCHEMA } from "./openai";
import type { GenerationProvider } from "./worker";
import { validSiteContentFixtures } from "../site-content/fixtures";
import { safeParseSiteContentV1 } from "../site-content/validation";

describe("site content structured output", () => {
  it("requests strict site_content_v1 JSON schema", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validSiteContentFixtures.umkmKuliner) } }] }), { status: 200 });
    }));

    const generateContent: GenerationProvider["generateContent"] = createOpenAiGenerationProvider().generateContent;
    await generateContent({ source: {} as Parameters<GenerationProvider["generateContent"]>[0]["source"], analysis: {} as Parameters<GenerationProvider["generateContent"]>[0]["analysis"] });

    const responseFormat = requestBody?.response_format as { type: string; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } };
    expect(responseFormat.type).toBe("json_schema");
    expect(responseFormat.json_schema.name).toBe("site_content_v1");
    expect(responseFormat.json_schema.strict).toBe(true);
    expect(responseFormat.json_schema.schema).toStrictEqual(SITE_CONTENT_RESPONSE_SCHEMA);
    expect(responseFormat.json_schema.schema.additionalProperties).toBe(false);
    expect(responseFormat.json_schema.schema.required).toEqual(["schemaVersion", "site", "seo", "theme", "header", "sections", "footer"]);
  });

  it("keeps provider output as a direct valid SiteContentV1 root", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validSiteContentFixtures.umkmKuliner) } }] }), { status: 200 })));
    const provider = createOpenAiGenerationProvider();
    const content = await provider.generateContent({ source: {} as Parameters<GenerationProvider["generateContent"]>[0]["source"], analysis: {} as Parameters<GenerationProvider["generateContent"]>[0]["analysis"] });
    expect(safeParseSiteContentV1(content).success).toBe(true);
    expect(content).not.toHaveProperty("content");
    expect(content).not.toHaveProperty("website");
    expect(content).not.toHaveProperty("result");
    expect(content).not.toHaveProperty("data");
  });

  it("exposes sanitized structured-output request errors", async () => {
    process.env.OPENAI_API_KEY = "sk-secret-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: {
        type: "invalid_request_error",
        code: "invalid_json_schema",
        param: "response_format",
        message: "schema rejected sk-secret-key",
      },
    }), { status: 400 })));
    const provider = createOpenAiGenerationProvider();

    await expect(provider.generateContent({
      source: {} as Parameters<GenerationProvider["generateContent"]>[0]["source"],
      analysis: {} as Parameters<GenerationProvider["generateContent"]>[0]["analysis"],
    })).rejects.toMatchObject({
      status: 400,
      type: "invalid_request_error",
      code: "invalid_json_schema",
      param: "response_format",
      message: "schema rejected [redacted]",
    });
  });

  it("requires a source-grounded USP fallback and isolates presentation notes", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    let systemPrompt = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> };
      systemPrompt = body.messages[0]?.content ?? "";
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
    }));

    const source = {
      schema_version: "website_analysis_input_v1",
      site: { id: "61c79c23-690a-4f5d-8eca-4d3588362c7c", name: "Bakso Marem", slug: "bakso-marem" },
      business: { name: "Bakso Marem", business_type: "Warung bakso", target_market: "Keluarga", products_services: "Bakso sapi", usp: null, whatsapp: null, address: null },
      brief: { primary_cta: "Pesan", website_goal: "Pesanan", style_preference: "Modern", color_preference: null, reference_urls: null, notes: "tonjolkan menu Bakso Sapi lebih kuat pada bagian hero", image_mode: "AI", halal_status: "UNSURE" },
      compatibility: { legacy_snapshot: false, defaults_applied: [] },
    } as Parameters<GenerationProvider["generateAnalysis"]>[0];

    await createOpenAiGenerationProvider().generateAnalysis(source);

    expect(systemPrompt).toContain("offer.usp_summary must be a source-grounded summary");
    expect(systemPrompt).toContain("Never use brief.notes or presentation guidance as USP evidence");
    expect(systemPrompt).toContain("neutral summary using only supplied business_type and products_services");
  });
});
