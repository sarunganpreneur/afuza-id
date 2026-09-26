import { IMAGE_MIME_TYPES, type ImageGenerationProviderV1, type ImageGenerationResultV1, type ImageMimeType } from "./contracts";

const OPENAI_IMAGES_ENDPOINT = "https://api.openai.com/v1/images/generations";
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
export const OPENAI_IMAGE_TIMEOUT_DEFAULT_MS = 120_000;
export const OPENAI_IMAGE_TIMEOUT_MIN_MS = 10_000;
export const OPENAI_IMAGE_TIMEOUT_MAX_MS = 300_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export type OpenAiImageGenerationOptionsV1 = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetch?: typeof globalThis.fetch;
};

export type OpenAiImageProviderErrorStageV1 =
  | "request"
  | "response-json"
  | "image-download"
  | "base64-decode"
  | "mime-validation"
  | "size-validation"
  | "dimension-validation"
  | "timeout"
  | "unknown";

export type OpenAiImageProviderDiagnosticV1 = {
  status: number | null;
  type: string | null;
  code: string | null;
  param: string | null;
  stage: OpenAiImageProviderErrorStageV1;
  elapsed_ms: number | null;
};

export function resolveOpenAiImageTimeoutMs(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < OPENAI_IMAGE_TIMEOUT_MIN_MS || parsed > OPENAI_IMAGE_TIMEOUT_MAX_MS) return OPENAI_IMAGE_TIMEOUT_DEFAULT_MS;
  return parsed;
}

export class OpenAiImageProviderError extends Error {
  readonly diagnostic: OpenAiImageProviderDiagnosticV1;

  constructor(message: string, diagnostic: Partial<OpenAiImageProviderDiagnosticV1> = {}, forbiddenText?: string) {
    const sanitized = String(message ?? "Image provider request failed")
      .replace(forbiddenText ? new RegExp(forbiddenText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi") : /$^/, "[redacted]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
      .replace(/[A-Za-z0-9+/]{80,}={0,2}/g, "[redacted]")
      .slice(0, 500);
    super(sanitized);
    this.diagnostic = {
      status: diagnostic.status ?? null,
      type: diagnostic.type ?? null,
      code: diagnostic.code ?? null,
      param: diagnostic.param ?? null,
      stage: diagnostic.stage ?? "unknown",
      elapsed_ms: diagnostic.elapsed_ms ?? null,
    };
    this.name = "OpenAiImageProviderError";
  }
}

function mimeType(value: string | null): ImageMimeType {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (normalized && IMAGE_MIME_TYPES.includes(normalized as ImageMimeType)) return normalized as ImageMimeType;
  throw new OpenAiImageProviderError("IMAGE_PROVIDER_UNSUPPORTED_MIME", { stage: "mime-validation" });
}

function mimeTypeFromBytes(bytes: Uint8Array): ImageMimeType {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "mime-validation" });
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new OpenAiImageProviderError("IMAGE_PROVIDER_RESPONSE_TOO_LARGE", { stage: "size-validation" });
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new OpenAiImageProviderError("IMAGE_PROVIDER_RESPONSE_TOO_LARGE", { stage: "size-validation" });
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new OpenAiImageProviderError("IMAGE_PROVIDER_RESPONSE_TOO_LARGE", { stage: "size-validation" });
    }
    chunks.push(next.value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 3 > bytes.length) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function fourCc(bytes: Uint8Array, offset: number): string {
  if (offset < 0 || offset + 4 > bytes.length) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

export function webpDimensions(bytes: Uint8Array): { width: number; height: number; chunkType: "VP8 " | "VP8L" | "VP8X" } {
  if (bytes.length < 20 || fourCc(bytes, 0) !== "RIFF" || fourCc(bytes, 8) !== "WEBP") {
    throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
  }
  const riffSize = readUint32Le(bytes, 4) >>> 0;
  if (riffSize < 4 || riffSize + 8 > bytes.length) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
  const chunkType = fourCc(bytes, 12) as "VP8 " | "VP8L" | "VP8X";
  const chunkSize = readUint32Le(bytes, 16) >>> 0;
  const dataStart = 20;
  if (dataStart + chunkSize > bytes.length) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });

  if (chunkType === "VP8X") {
    if (chunkSize < 10) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
    const width = readUint24Le(bytes, dataStart + 4) + 1;
    const height = readUint24Le(bytes, dataStart + 7) + 1;
    if (width < 1 || height < 1) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_DIMENSIONS", { stage: "dimension-validation" });
    return { width, height, chunkType };
  }

  if (chunkType === "VP8L") {
    if (chunkSize < 5 || bytes[dataStart] !== 0x2f) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
    const b1 = bytes[dataStart + 1];
    const b2 = bytes[dataStart + 2];
    const b3 = bytes[dataStart + 3];
    const b4 = bytes[dataStart + 4];
    const width = 1 + b1 + ((b2 & 0x3f) << 8);
    const height = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
    if (width < 1 || height < 1) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_DIMENSIONS", { stage: "dimension-validation" });
    return { width, height, chunkType };
  }

  if (chunkType === "VP8 ") {
    if (chunkSize < 10 || bytes[dataStart + 3] !== 0x9d || bytes[dataStart + 4] !== 0x01 || bytes[dataStart + 5] !== 0x2a) {
      throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
    }
    const width = readUint16Le(bytes, dataStart + 6) & 0x3fff;
    const height = readUint16Le(bytes, dataStart + 8) & 0x3fff;
    if (width < 1 || height < 1) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_DIMENSIONS", { stage: "dimension-validation" });
    return { width, height, chunkType };
  }

  throw new OpenAiImageProviderError("IMAGE_PROVIDER_UNSUPPORTED_IMAGE_CHUNK", { stage: "dimension-validation" });
}

function dimensions(bytes: Uint8Array, mime: ImageMimeType): { width: number; height: number } {
  if (mime === "image/png" && bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: new DataView(bytes.buffer, bytes.byteOffset).getUint32(16), height: new DataView(bytes.buffer, bytes.byteOffset).getUint32(20) };
  }
  if (mime === "image/webp" && bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const parsed = webpDimensions(bytes);
    return { width: parsed.width, height: parsed.height };
  }
  if (mime === "image/jpeg" && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      if (marker >= 0xc0 && marker <= 0xc3 && length >= 7) return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_IMAGE", { stage: "dimension-validation" });
}

export type OpenAiImageSizeV1 = "1024x1024" | "1536x1024" | "1024x1536" | "auto";

export function openAiImageSizeForAspectRatio(aspectRatio: string): OpenAiImageSizeV1 {
  if (aspectRatio === "1:1") return "1024x1024";
  if (["16:9", "3:2", "4:3"].includes(aspectRatio)) return "1536x1024";
  if (["9:16", "2:3"].includes(aspectRatio)) return "1024x1536";
  return "auto";
}

export function createOpenAiImageGenerationProvider(options: OpenAiImageGenerationOptionsV1 = {}): ImageGenerationProviderV1 {
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = resolveOpenAiImageTimeoutMs(options.timeoutMs ?? process.env.OPENAI_IMAGE_TIMEOUT_MS);
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  return {
    async generateImage(request) {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new OpenAiImageProviderError("OPENAI_API_KEY is not configured");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();
      try {
        const response = await fetcher(OPENAI_IMAGES_ENDPOINT, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: options.model ?? OPENAI_IMAGE_MODEL, prompt: request.prompt, size: openAiImageSizeForAspectRatio(request.aspectRatio), n: 1, output_format: "webp" }),
          signal: controller.signal,
        });
        if (!response.ok) {
          let apiError: { error?: { type?: unknown; code?: unknown; param?: unknown; message?: unknown } } = {};
          try {
            const errorBytes = await readResponseBytes(response, maxResponseBytes);
            apiError = JSON.parse(new TextDecoder().decode(errorBytes)) as typeof apiError;
          } catch {
            // Preserve HTTP status even when the provider error body is not JSON.
          }
          throw new OpenAiImageProviderError(
            String(apiError.error?.message ?? `IMAGE_PROVIDER_HTTP_${response.status}`),
            {
              status: response.status,
              type: typeof apiError.error?.type === "string" ? apiError.error.type : null,
              code: typeof apiError.error?.code === "string" ? apiError.error.code : null,
              param: typeof apiError.error?.param === "string" ? apiError.error.param : null,
              stage: "response-json",
            },
            request.prompt,
          );
        }
        const raw = await readResponseBytes(response, maxResponseBytes);
        let payload: { data?: Array<{ b64_json?: string; url?: string }> };
        try { payload = JSON.parse(new TextDecoder().decode(raw)) as typeof payload; } catch { throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_RESPONSE", { stage: "response-json" }); }
        const item = payload.data?.[0];
        if (!item) throw new OpenAiImageProviderError("IMAGE_PROVIDER_EMPTY_RESPONSE", { stage: "response-json" });
        let bytes: Uint8Array;
        let mime: ImageMimeType;
        if (item.b64_json) {
          try { bytes = new Uint8Array(Buffer.from(item.b64_json, "base64")); } catch { throw new OpenAiImageProviderError("IMAGE_PROVIDER_BASE64_DECODE_FAILED", { stage: "base64-decode" }); }
          mime = mimeTypeFromBytes(bytes);
        } else if (item.url) {
          let imageUrl: URL;
          try { imageUrl = new URL(item.url); } catch { throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_URL", { stage: "image-download" }); }
          if (imageUrl.protocol !== "https:") throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_URL", { stage: "image-download" });
          let imageResponse: Response;
          try { imageResponse = await fetcher(imageUrl, { signal: controller.signal }); } catch (error) { if (error instanceof Error && error.name === "AbortError") throw error; throw new OpenAiImageProviderError("IMAGE_PROVIDER_DOWNLOAD_FAILED", { stage: "image-download" }); }
          if (!imageResponse.ok) throw new OpenAiImageProviderError("IMAGE_PROVIDER_DOWNLOAD_FAILED", { status: imageResponse.status, stage: "image-download" });
          mime = mimeType(imageResponse.headers.get("content-type"));
          bytes = await readResponseBytes(imageResponse, maxResponseBytes);
        } else throw new OpenAiImageProviderError("IMAGE_PROVIDER_NO_IMAGE", { stage: "response-json" });
        if (bytes.byteLength === 0) throw new OpenAiImageProviderError("IMAGE_PROVIDER_EMPTY_IMAGE", { stage: "size-validation" });
        const imageDimensions = dimensions(bytes, mime);
        if (imageDimensions.width < 1 || imageDimensions.height < 1) throw new OpenAiImageProviderError("IMAGE_PROVIDER_INVALID_DIMENSIONS", { stage: "dimension-validation" });
        return { bytes, mimeType: mime, ...imageDimensions } satisfies ImageGenerationResultV1;
      } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        if (error instanceof OpenAiImageProviderError) {
          error.diagnostic.elapsed_ms = elapsedMs;
          throw error;
        }
        if (error instanceof Error && error.name === "AbortError") throw new OpenAiImageProviderError("IMAGE_PROVIDER_TIMEOUT", { stage: "timeout", elapsed_ms: elapsedMs });
        throw new OpenAiImageProviderError("IMAGE_PROVIDER_REQUEST_FAILED", { stage: "request", elapsed_ms: elapsedMs });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}