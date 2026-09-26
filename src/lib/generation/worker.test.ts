import { describe, expect, it, vi } from "vitest";

import { validSiteContentFixtures } from "@/lib/site-content/fixtures";
import type { GenerationProvider } from "./worker";
import { runGenerationOnce, type GenerationWorkerClient } from "./worker";

const jobId = "03137715-b9f0-41eb-8072-9e0135de32a8";
const siteId = "61c79c23-690a-4f5d-8eca-4d3588362c7c";

const input = {
  schema_version: "website_analysis_input_v1" as const,
  site: { id: siteId, name: "Bakso Marem", slug: "bakso-marem" },
  business: {
    name: "Bakso Marem",
    business_type: "Warung bakso",
    target_market: "Keluarga",
    products_services: "Bakso sapi",
    usp: "Rasa khas" as string | null,
    whatsapp: "6281234567890",
    address: null,
  },
  brief: {
    primary_cta: "Pesan sekarang",
    website_goal: "Menerima pesanan",
    style_preference: "Modern",
    color_preference: "#123456",
    reference_urls: null,
    notes: null as string | null,
    image_mode: "AI" as const,
    halal_status: "UNSURE" as const,
  },
  compatibility: { legacy_snapshot: false, defaults_applied: [] as never[] },
};

const analysis = {
  schema_version: "website_analysis_v1" as const,
  job_id: jobId,
  site_id: siteId,
  business_summary: {
    business_name: "Bakso Marem",
    business_type: "Warung bakso",
    target_market: "Keluarga",
    products_services: "Bakso sapi",
    usp: "Rasa khas" as string | null,
    whatsapp: "6281234567890",
    address: null,
    website_goal: "Menerima pesanan",
    primary_cta: "Pesan sekarang",
    style_preference: "Modern",
    color_preference: "#123456",
    reference_urls: [],
    notes: null,
    image_mode: "AI" as const,
  },
  audience: { primary: "Keluarga", needs: ["Makanan"], objections: [] },
  offer: { products_services_summary: "Bakso sapi", usp_summary: "Rasa khas", value_proposition: "Pesan sekarang" },
  conversion: { website_goal: "Menerima pesanan", primary_cta: "Pesan sekarang", strategy: "WhatsApp" },
  design_direction: { style: "Modern", color_direction: "Hijau", image_mode: "AI" as const, image_direction: "Foto makanan" },
  section_plan: [{ section_type: "Hero", purpose: "Memperkenalkan Bakso Marem", key_points: ["Bakso sapi"], cta: "Pesan sekarang" }],
  content_guardrails: { halal_status: "UNSURE" as const, allowed_claims: ["Bakso sapi", "Rasa khas"], prohibited_claims: [] },
  missing_information: [],
};

function makeClient(overrides: Record<string, unknown> = {}, inputSnapshot = input) {
  const calls: string[] = [];
  const rpcArgs: Array<[string, Record<string, unknown> | undefined]> = [];
  const client: GenerationWorkerClient = {
    async rpc(name, args) {
      calls.push(name);
      rpcArgs.push([name, args]);
      if (name === "claim_next_generation_job") return { data: [{ job_id: jobId, site_id: siteId, job_type: "CREATE", status: "ANALYZING", retry_count: 0, input_snapshot: inputSnapshot }], error: null };
      if (overrides[name]) return overrides[name] as { data: unknown; error: { message?: string; code?: string } | null };
      return { data: [{}], error: null };
    },
    async readGenerationJobStatus() {
      return { status: "GENERATING_CONTENT" };
    },
  };
  return { client, calls, rpcArgs };
}

function provider(content: unknown = validSiteContentFixtures.umkmKuliner): GenerationProvider {
  return {
    generateAnalysis: vi.fn().mockResolvedValue(analysis),
    repairAnalysis: vi.fn().mockResolvedValue(analysis),
    correctAnalysis: vi.fn().mockResolvedValue(analysis),
    generateContent: vi.fn().mockResolvedValue(content),
  };
}

describe("generation worker once", () => {
  it("advances to images before the provider, commits in images, then renders", async () => {
    const { client, calls, rpcArgs } = makeClient();
    const events: string[] = [];
    const commit = vi.fn(async () => { events.push("commit"); });
    const result = await runGenerationOnce({
      client,
      provider: provider(),
      commitContent: commit,
      imageProvider: { generateImage: async () => { events.push("image"); return { bytes: new Uint8Array([1]), mimeType: "image/webp", width: 1, height: 1 }; } },
      imageStorage: { storeGeneratedImage: async () => { events.push("store"); return { storagePath: "attempt-0/hero.webp", publicUrl: "https://storage.example.test/hero.webp", mimeType: "image/webp" }; } },
    });
    expect(result).toEqual({ kind: "committed", jobId });
    expect(calls).toEqual([
      "claim_next_generation_job",
      "complete_generation_analysis",
      "advance_generation_job",
      "advance_generation_job",
    ]);
    expect(rpcArgs.filter(([name]) => name === "advance_generation_job").map(([, args]) => args)).toEqual([
      { p_job_id: jobId, p_expected_status: "GENERATING_CONTENT", p_next_status: "GENERATING_IMAGES" },
      { p_job_id: jobId, p_expected_status: "GENERATING_IMAGES", p_next_status: "RENDERING" },
    ]);
    expect(events).toEqual(["image", "store", "commit"]);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("claims, analyzes, commits, and advances one job", async () => {
    const { client, calls } = makeClient();
    const commit = vi.fn().mockResolvedValue(undefined);
    const result = await runGenerationOnce({ client, provider: provider(), commitContent: commit });
    expect(result).toEqual({ kind: "committed", jobId });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["claim_next_generation_job", "complete_generation_analysis", "advance_generation_job"]);
  });

  it("returns no work without invoking the provider", async () => {
    const calls: string[] = [];
    const client: GenerationWorkerClient = {
      async rpc(name) { calls.push(name); return { data: [], error: null }; },
      async readGenerationJobStatus() { return null; },
    };
    const generationProvider = provider();
    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });
    expect(result).toEqual({ kind: "no_work" });
    expect(generationProvider.generateAnalysis).not.toHaveBeenCalled();
  });

  it("fails the analysis stage when provider analysis is invalid", async () => {
    const { client, calls } = makeClient();
    const generationProvider = provider();
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue({ bad: true });
    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });
    expect(result).toEqual({ kind: "failed", jobId, errorCode: "INVALID_ANALYSIS_OUTPUT" });
    expect(calls).toContain("fail_generation_job");
    expect(calls).not.toContain("commit_generated_site_version");
  });

  it("normalizes unsupported allowed claims before strict analysis parsing", async () => {
    const { client, calls, rpcArgs } = makeClient();
    const invalidAnalysis = structuredClone(analysis);
    invalidAnalysis.content_guardrails.allowed_claims = ["Makanan enak", "Bakso sapi", "bakso sapi"];
    const generationProvider = provider();
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalidAnalysis);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "committed", jobId });
    expect(calls).toContain("complete_generation_analysis");
    const completion = rpcArgs.find(([name]) => name === "complete_generation_analysis");
    expect(completion?.[1]).toMatchObject({
      p_analysis_payload: { content_guardrails: { allowed_claims: ["Bakso sapi"] } },
    });
  });

  it("records a safe schema path for invalid analysis output", async () => {
    const { client, rpcArgs } = makeClient();
    const generationProvider = provider();
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue({ bad: true });
    await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });
    const failCall = rpcArgs.find(([name]) => name === "fail_generation_job");
    expect(failCall?.[1]).toMatchObject({
      p_error_code: "INVALID_ANALYSIS_OUTPUT",
      p_error_message: expect.stringContaining("schema_version:invalid_value"),
    });
  });

  it("repairs empty required fields once and completes the analysis", async () => {
    const { client, calls } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.offer.usp_summary = "";
    invalid.offer.value_proposition = "";
    invalid.conversion.website_goal = "";
    invalid.conversion.strategy = "";
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "committed", jobId });
    expect(generationProvider.repairAnalysis).toHaveBeenCalledTimes(1);
    expect(calls).not.toContain("fail_generation_job");
  });

  it("routes whitespace-only USP summaries through the existing repair path", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.offer.usp_summary = "   ";
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "committed", jobId });
    expect(generationProvider.repairAnalysis).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generationProvider.repairAnalysis!).mock.calls[0]?.[0].validationIssues).toContain("offer.usp_summary:too_small");
  });

  it("repairs an absent source USP with a neutral source-grounded summary", async () => {
    const sourceWithoutUsp = structuredClone(input);
    sourceWithoutUsp.business.usp = null;
    sourceWithoutUsp.brief.notes = "tonjolkan menu Bakso Sapi lebih kuat pada bagian hero";
    const { client, calls, rpcArgs } = makeClient({}, sourceWithoutUsp);
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.business_summary.usp = null;
    invalid.offer.usp_summary = "";
    const repaired = structuredClone(analysis);
    repaired.business_summary.usp = null;
    repaired.offer.usp_summary = "Warung bakso dengan bakso sapi";
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);
    vi.mocked(generationProvider.repairAnalysis!).mockResolvedValue(repaired);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "committed", jobId });
    expect(calls).not.toContain("fail_generation_job");
    expect(rpcArgs.find(([name]) => name === "complete_generation_analysis")?.[1]).toMatchObject({
      p_analysis_payload: { offer: { usp_summary: "Warung bakso dengan bakso sapi" } },
    });
    expect(repaired.offer.usp_summary).not.toBe(sourceWithoutUsp.brief.notes);
  });

  it("rejects an invented USP during repair instead of weakening validation", async () => {
    const sourceWithoutUsp = structuredClone(input);
    sourceWithoutUsp.business.usp = null;
    const { client } = makeClient({}, sourceWithoutUsp);
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.offer.usp_summary = "";
    const repaired = structuredClone(analysis);
    repaired.offer.usp_summary = "Bakso sapi terbaik di kota";
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);
    vi.mocked(generationProvider.repairAnalysis!).mockResolvedValue(repaired);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "failed", jobId, errorCode: "INVALID_ANALYSIS_OUTPUT" });
  });

  it("repairs an invalid color_preference using only the whitelisted path", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.business_summary.color_preference = "green";
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result.kind).toBe("committed");
    const repairAnalysis = vi.mocked(generationProvider.repairAnalysis!);
    expect(repairAnalysis.mock.calls[0]?.[0].validationIssues).toContain("business_summary.color_preference:invalid_format");
  });

  it("repairs empty needs into a non-empty audience", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.audience.needs = [];
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result.kind).toBe("committed");
    expect(generationProvider.repairAnalysis).toHaveBeenCalledTimes(1);
    const repairAnalysis = vi.mocked(generationProvider.repairAnalysis!);
    expect(repairAnalysis.mock.calls[0]?.[0].validationIssues).toContain("audience.needs:too_small");
  });

  it("repairs an empty section plan", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.section_plan = [];
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result.kind).toBe("committed");
    expect(generationProvider.repairAnalysis).toHaveBeenCalledTimes(1);
  });

  it("repairs empty section key points using the exact nested validation path", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.section_plan[0].key_points = [];
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result.kind).toBe("committed");
    const repairAnalysis = vi.mocked(generationProvider.repairAnalysis!);
    expect(repairAnalysis.mock.calls[0]?.[0].validationIssues).toContain("section_plan.0.key_points:too_small");
  });

  it("repairs empty semantic design fields without repairing structural fields", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.design_direction.image_direction = "";
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result.kind).toBe("committed");
    expect(generationProvider.repairAnalysis).toHaveBeenCalledTimes(1);
    const repairAnalysis = vi.mocked(generationProvider.repairAnalysis!);
    expect(repairAnalysis.mock.calls[0]?.[0].validationIssues).toContain("design_direction.image_direction:too_small");
  });

  it("fails cleanly when the single repair remains invalid", async () => {
    const { client, calls } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.audience.needs = [];
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);
    vi.mocked(generationProvider.repairAnalysis!).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "failed", jobId, errorCode: "INVALID_ANALYSIS_OUTPUT" });
    expect(generationProvider.repairAnalysis).toHaveBeenCalledTimes(1);
    expect(calls).toContain("fail_generation_job");
  });

  it("does not repair a valid first response", async () => {
    const { client } = makeClient();
    const generationProvider = provider();

    await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(generationProvider.repairAnalysis).not.toHaveBeenCalled();
  });

  it("keeps grounding validation active after repair", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.audience.needs = [];
    const repaired = structuredClone(analysis);
    repaired.business_summary.products_services = "Produk yang tidak ada";
    repaired.offer.products_services_summary = "Produk yang tidak ada";
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);
    vi.mocked(generationProvider.repairAnalysis!).mockResolvedValue(repaired);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "failed", jobId, errorCode: "UNSUPPORTED_PRODUCT_CLAIM" });
  });

  it("keeps halal safety validation active after repair", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.audience.needs = [];
    const repaired = structuredClone(analysis);
    (repaired.content_guardrails.prohibited_claims as unknown as string[]).push("Sertifikat halal nomor 123");
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);
    vi.mocked(generationProvider.repairAnalysis!).mockResolvedValue(repaired);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "failed", jobId, errorCode: "HALAL_STATUS_REQUIRES_NO_POSITIVE_CERTIFICATION_CLAIM" });
  });

  it("does not repair a content guardrail custom refinement failure", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.offer.value_proposition = "Bakso sapi terbaik di kota";
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "failed", jobId, errorCode: "INVALID_ANALYSIS_OUTPUT" });
    expect(generationProvider.repairAnalysis).not.toHaveBeenCalled();
  });

  it("corrects one unsupported testimonial section without creating testimonial content", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.section_plan = [{ section_type: "Testimoni", purpose: "Kutipan pelanggan", key_points: ["Rasa khas"], cta: "Pesan sekarang" }];
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "committed", jobId });
    expect(generationProvider.correctAnalysis).toHaveBeenCalledTimes(1);
    expect(generationProvider.repairAnalysis).not.toHaveBeenCalled();
  });

  it("normalizes testimonial wording when correction remains invalid", async () => {
    const { client } = makeClient();
    const generationProvider = provider();
    const invalid = structuredClone(analysis);
    invalid.section_plan = [{ section_type: "Testimoni", purpose: "Kutipan pelanggan", key_points: ["Rasa khas"], cta: "Pesan sekarang" }];
    vi.mocked(generationProvider.generateAnalysis).mockResolvedValue(invalid);
    vi.mocked(generationProvider.correctAnalysis!).mockResolvedValue(invalid);

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });

    expect(result).toEqual({ kind: "committed", jobId });
    expect(generationProvider.correctAnalysis).toHaveBeenCalledTimes(1);
  });

  it("fails the content stage when SiteContentV1 is invalid", async () => {
    const { client, calls, rpcArgs } = makeClient();
    const generateImage = vi.fn();
    const storeGeneratedImage = vi.fn();
    const result = await runGenerationOnce({
      client,
      provider: provider({ schemaVersion: "wrong" }),
      commitContent: vi.fn(),
      imageProvider: { generateImage },
      imageStorage: { storeGeneratedImage },
    });
    expect(result).toEqual({ kind: "failed", jobId, errorCode: "INVALID_SITE_CONTENT" });
    expect(calls).toContain("complete_generation_analysis");
    expect(calls).toContain("fail_generation_job");
    expect(rpcArgs.find(([name]) => name === "fail_generation_job")?.[1]).toMatchObject({
      p_expected_status: "GENERATING_CONTENT",
    });
    expect(calls).not.toContain("commit_generated_site_version");
    expect(generateImage).not.toHaveBeenCalled();
    expect(storeGeneratedImage).not.toHaveBeenCalled();
  });

  it("normalizes section[3] WhatsApp CTA from the authoritative source", async () => {
    const { client } = makeClient();
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    content.sections.push({
      id: "order",
      type: "cta",
      title: "Pesan",
      cta: { label: "WhatsApp", kind: "whatsapp", target: "wa.me/62800000000" },
    });
    const commit = vi.fn().mockResolvedValue(undefined);
    const result = await runGenerationOnce({ client, provider: provider(content), commitContent: commit });

    expect(result).toEqual({ kind: "committed", jobId });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[1].sections[3]).toMatchObject({
      cta: { kind: "whatsapp", target: "6281234567890" },
    });
  });

  it("rereads the actual active status before retrying failure recording", async () => {
    const base = makeClient();
    let failureCalls = 0;
    const client: GenerationWorkerClient = {
      async rpc(name, args) {
        if (name === "fail_generation_job") {
          failureCalls += 1;
          if (failureCalls === 1) {
            base.calls.push(name);
            base.rpcArgs.push([name, args]);
            return { data: null, error: { code: "PGRST301", message: "status mismatch" } };
          }
        }
        return base.client.rpc(name, args);
      },
      async readGenerationJobStatus() {
        return { status: "GENERATING_IMAGES" };
      },
    };

    const result = await runGenerationOnce({ client, provider: provider({ schemaVersion: "wrong" }), commitContent: vi.fn() });

    expect(result).toEqual({ kind: "failed", jobId, errorCode: "INVALID_SITE_CONTENT" });
    expect(base.rpcArgs.filter(([name]) => name === "fail_generation_job").map(([, args]) => args?.p_expected_status)).toEqual([
      "GENERATING_CONTENT",
      "GENERATING_IMAGES",
    ]);
  });

  it("does not retry mutation when the first ambiguous failure already recorded ERROR", async () => {
    const base = makeClient();
    const client: GenerationWorkerClient = {
      async rpc(name, args) {
        if (name === "fail_generation_job") {
          base.calls.push(name);
          base.rpcArgs.push([name, args]);
          return { data: null, error: { code: "NETWORK", message: "response lost" } };
        }
        return base.client.rpc(name, args);
      },
      async readGenerationJobStatus() {
        return { status: "ERROR" };
      },
    };

    await runGenerationOnce({ client, provider: provider({ schemaVersion: "wrong" }), commitContent: vi.fn() });

    expect(base.rpcArgs.filter(([name]) => name === "fail_generation_job")).toHaveLength(1);
  });

  it("retries failure recording and reports the recorder error", async () => {
    const { client, calls } = makeClient({
      fail_generation_job: {
        data: null,
        error: { code: "42883", message: "function does not exist" },
      },
    });
    const generationProvider = provider({ schemaVersion: "wrong" });
    const log = vi.fn();

    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn(), log });

    expect(result).toEqual({ kind: "failed", jobId, errorCode: "INVALID_SITE_CONTENT" });
    expect(calls.filter((name) => name === "fail_generation_job")).toHaveLength(2);
    expect(log).toHaveBeenCalledWith("failure_recording_failed", expect.objectContaining({
      jobId,
      errorCode: "INVALID_SITE_CONTENT",
      recorderErrorCode: "FAIL_GENERATION_JOB_FAILED",
      recorderMessage: expect.stringContaining("function does not exist"),
    }));
    expect(calls).not.toContain("requeue_failed_generation_job");
    expect(calls).not.toContain("commit_generated_site_version");
    expect(log).toHaveBeenCalledWith("generation_failed", expect.objectContaining({
      diagnostics: expect.stringContaining("schemaVersion"),
    }));
  });

  it("uses the official failure lifecycle when the provider throws", async () => {
    const { client, calls } = makeClient();
    const generationProvider = provider();
    vi.mocked(generationProvider.generateAnalysis).mockRejectedValue(new Error("provider unavailable"));
    const result = await runGenerationOnce({ client, provider: generationProvider, commitContent: vi.fn() });
    expect(result).toEqual({ kind: "failed", jobId, errorCode: "GENERATION_WORKER_FAILED" });
    expect(calls).toContain("fail_generation_job");
  });

  it("does not call commit more than once per claimed job", async () => {
    const { client } = makeClient();
    const commit = vi.fn().mockResolvedValue(undefined);
    await runGenerationOnce({ client, provider: provider(), commitContent: commit });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("rejects raw script content before commit", async () => {
    const { client } = makeClient();
    const commit = vi.fn();
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    const hero = content.sections[0] as Extract<typeof content.sections[number], { type: "hero" }>;
    hero.title = "<script>alert(1)</script>";
    const result = await runGenerationOnce({ client, provider: provider(content), commitContent: commit });
    expect(result.kind).toBe("failed");
    expect(commit).not.toHaveBeenCalled();
  });
});