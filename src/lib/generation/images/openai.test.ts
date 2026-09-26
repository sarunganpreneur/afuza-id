import { afterEach, describe, expect, it, vi } from "vitest";

import { createOpenAiImageGenerationProvider, OPENAI_IMAGE_TIMEOUT_DEFAULT_MS, openAiImageSizeForAspectRatio, OpenAiImageProviderError, resolveOpenAiImageTimeoutMs, webpDimensions } from "./openai";

const request = {
  id: "hero-1",
  siteId: "site",
  generationJobId: "job",
  retryCount: 0,
  role: "hero" as const,
  sourcePath: "sections[0].image",
  prompt: "Create a hero image",
  aspectRatio: "16:9" as const,
  alt: "Hero",
  optional: true as const,
};

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

function webpFixture(chunkType: "VP8 " | "VP8L" | "VP8X", width = 1536, height = 1024): Uint8Array {
  const data = chunkType === "VP8 "
    ? Uint8Array.from([0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, width >> 8, height & 0xff, height >> 8])
    : chunkType === "VP8L"
      ? Uint8Array.from([0x2f, (width - 1) & 0xff, ((width - 1) >> 8 & 0x3f) | (((height - 1) & 0x03) << 6), (height - 1) >> 2 & 0xff, (height - 1) >> 10 & 0x0f])
      : Uint8Array.from([0, 0, 0, 0, (width - 1) & 0xff, (width - 1) >> 8 & 0xff, (width - 1) >> 16 & 0xff, (height - 1) & 0xff, (height - 1) >> 8 & 0xff, (height - 1) >> 16 & 0xff]);
  const bytes = new Uint8Array(20 + data.length);
  bytes.set(Array.from("RIFF", (character) => character.charCodeAt(0)), 0);
  bytes.set(Array.from("WEBP", (character) => character.charCodeAt(0)), 8);
  bytes.set(Array.from(chunkType, (character) => character.charCodeAt(0)), 12);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  new DataView(bytes.buffer).setUint32(16, data.length, true);
  bytes.set(data, 20);
  return bytes;
}

describe("OpenAI image provider", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.OPENAI_IMAGE_TIMEOUT_MS;
  });

  it("uses a 120-second default and bounded environment overrides", () => {
    expect(resolveOpenAiImageTimeoutMs(undefined)).toBe(OPENAI_IMAGE_TIMEOUT_DEFAULT_MS);
    expect(resolveOpenAiImageTimeoutMs("180000")).toBe(180000);
    expect(resolveOpenAiImageTimeoutMs("9999")).toBe(OPENAI_IMAGE_TIMEOUT_DEFAULT_MS);
    expect(resolveOpenAiImageTimeoutMs("300001")).toBe(OPENAI_IMAGE_TIMEOUT_DEFAULT_MS);
    expect(resolveOpenAiImageTimeoutMs("not-a-number")).toBe(OPENAI_IMAGE_TIMEOUT_DEFAULT_MS);
  });

  it.each([
    ["VP8 ", webpFixture("VP8 ")],
    ["VP8L", webpFixture("VP8L")],
    ["VP8X", webpFixture("VP8X")],
  ] as const)("reads 1536x1024 from WebP %s", (_chunkType, bytes) => {
    expect(webpDimensions(bytes)).toMatchObject({ width: 1536, height: 1024 });
  });

  it("rejects truncated and malformed WebP headers", () => {
    expect(() => webpDimensions(webpFixture("VP8 ").slice(0, 25))).toThrow("IMAGE_PROVIDER_INVALID_IMAGE");
    expect(() => webpDimensions(webpFixture("VP8L").slice(0, 22))).toThrow("IMAGE_PROVIDER_INVALID_IMAGE");
    expect(() => webpDimensions(webpFixture("VP8X").slice(0, 25))).toThrow("IMAGE_PROVIDER_INVALID_IMAGE");
    const invalidRiff = webpFixture("VP8 ");
    invalidRiff[0] = 0;
    expect(() => webpDimensions(invalidRiff)).toThrow("IMAGE_PROVIDER_INVALID_IMAGE");
    const invalidWebp = webpFixture("VP8 ");
    invalidWebp[8] = 0;
    expect(() => webpDimensions(invalidWebp)).toThrow("IMAGE_PROVIDER_INVALID_IMAGE");
    const invalidChunk = webpFixture("VP8 ");
    invalidChunk[12] = 0;
    expect(() => webpDimensions(invalidChunk)).toThrow("IMAGE_PROVIDER_UNSUPPORTED_IMAGE_CHUNK");
  });

  it("rejects zero dimensions and invalid WebP signatures", () => {
    const zeroWidth = webpFixture("VP8 ");
    zeroWidth[26] = 0;
    zeroWidth[27] = 0;
    expect(() => webpDimensions(zeroWidth)).toThrow("IMAGE_PROVIDER_INVALID_DIMENSIONS");
    const invalidLossless = webpFixture("VP8L");
    invalidLossless[20] = 0;
    expect(() => webpDimensions(invalidLossless)).toThrow("IMAGE_PROVIDER_INVALID_IMAGE");
    const invalidLossy = webpFixture("VP8 ");
    invalidLossy[23] = 0;
    expect(() => webpDimensions(invalidLossy)).toThrow("IMAGE_PROVIDER_INVALID_IMAGE");
  });

  it("aborts with the configured timeout and reports sanitized elapsed time", async () => {
    vi.useFakeTimers();
    const provider = createOpenAiImageGenerationProvider({
      apiKey: "test-key",
      timeoutMs: 10_000,
      fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("abort");
          error.name = "AbortError";
          reject(error);
        });
      }),
    });
    const result = provider.generateImage(request);
    const rejection = expect(result).rejects.toMatchObject({ diagnostic: { stage: "timeout", elapsed_ms: expect.any(Number) } });
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
  });

  it.each([
    ["1:1", "1024x1024"],
    ["16:9", "1536x1024"],
    ["3:2", "1536x1024"],
    ["9:16", "1024x1536"],
    ["2:3", "1024x1536"],
    ["unsupported", "auto"],
  ] as const)("maps %s to supported OpenAI size %s", (aspectRatio, expected) => {
    expect(openAiImageSizeForAspectRatio(aspectRatio)).toBe(expected);
  });

  it("sends the supported landscape size for a hero request", async () => {
    let payload: { size?: string } = {};
    const provider = createOpenAiImageGenerationProvider({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        payload = JSON.parse(String(init?.body)) as { size?: string };
        return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(png).toString("base64") }] }), { status: 200 });
      },
    });
    await provider.generateImage(request);
    expect(payload.size).toBe("1536x1024");
    expect(payload.size).not.toBe("1792x1024");
  });

  it("converts b64 image output into bounded validated bytes", async () => {
    const calls: RequestInit[] = [];
    const provider = createOpenAiImageGenerationProvider({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        calls.push(init ?? {});
        return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(png).toString("base64") }] }), { status: 200 });
      },
    });
    const result = await provider.generateImage(request);
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.bytes).toEqual(png);
    expect(calls[0]?.method).toBe("POST");
  });

  it("sanitizes provider failures and never returns external URLs", async () => {
    const provider = createOpenAiImageGenerationProvider({
      apiKey: "test-key",
      fetch: async () => new Response(JSON.stringify({ error: { message: "Bearer sk-secret" } }), { status: 400 }),
    });
    await expect(provider.generateImage(request)).rejects.toThrow("Bearer [redacted]");
    await expect(provider.generateImage(request)).rejects.not.toThrow("sk-secret");
  });

  it("preserves sanitized HTTP metadata without prompt or secret", async () => {
    const prompt = request.prompt;
    const provider = createOpenAiImageGenerationProvider({
      apiKey: "sk-secret-key",
      fetch: async () => new Response(JSON.stringify({ error: { type: "invalid_request_error", code: "invalid_value", param: "size", message: `bad ${prompt} Bearer sk-secret-key` } }), { status: 400 }),
    });
    await expect(provider.generateImage(request)).rejects.toMatchObject({
      diagnostic: { status: 400, type: "invalid_request_error", code: "invalid_value", param: "size", stage: "response-json" },
    });
    try { await provider.generateImage(request); } catch (error) {
      expect(error).toBeInstanceOf(OpenAiImageProviderError);
      expect((error as Error).message).not.toContain(prompt);
      expect((error as Error).message).not.toContain("sk-secret-key");
    }
  });

  it("classifies timeout and invalid response stages", async () => {
    const timeoutProvider = createOpenAiImageGenerationProvider({
      apiKey: "test-key",
      fetch: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; },
    });
    await expect(timeoutProvider.generateImage(request)).rejects.toMatchObject({ diagnostic: { stage: "timeout" } });

    const invalidProvider = createOpenAiImageGenerationProvider({
      apiKey: "test-key",
      fetch: async () => new Response("not-json", { status: 200 }),
    });
    await expect(invalidProvider.generateImage(request)).rejects.toMatchObject({ diagnostic: { stage: "response-json" } });
  });

  it("classifies MIME, size, and dimension failures", async () => {
    const mimeProvider = createOpenAiImageGenerationProvider({
      apiKey: "test-key",
      fetch: async (input) => input.toString().includes("api.openai.com")
        ? new Response(JSON.stringify({ data: [{ url: "https://images.example.test/result" }] }), { status: 200 })
        : new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "text/plain" } }),
    });
    await expect(mimeProvider.generateImage(request)).rejects.toMatchObject({ diagnostic: { stage: "mime-validation" } });

    const sizeProvider = createOpenAiImageGenerationProvider({
      apiKey: "test-key",
      maxResponseBytes: 2,
      fetch: async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(png).toString("base64") }] }), { status: 200 }),
    });
    await expect(sizeProvider.generateImage(request)).rejects.toMatchObject({ diagnostic: { stage: "size-validation" } });

    const dimensionProvider = createOpenAiImageGenerationProvider({
      apiKey: "test-key",
      fetch: async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toString("base64") }] }), { status: 200 }),
    });
    await expect(dimensionProvider.generateImage(request)).rejects.toMatchObject({ diagnostic: { stage: "dimension-validation" } });
  });
});