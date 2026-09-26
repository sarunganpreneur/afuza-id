import {
  IMAGE_MIME_TYPES,
  type GeneratedImageStorageV1,
  type ImageMimeType,
  type StoreGeneratedImageInputV1,
  type StoredImageV1,
} from "./contracts";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type AfuzaGeneratedImageHttpStorageOptionsV1 = {
  baseUrl: string;
  workerSecret: string;
  fetchImpl?: FetchLike;
};

type JsonObject = Record<string, unknown>;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

async function readJsonSafely(
  response: Response,
): Promise<JsonObject | null> {
  try {
    const value: unknown = await response.json();

    return value && typeof value === "object"
      ? (value as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function isImageMimeType(value: unknown): value is ImageMimeType {
  return (
    typeof value === "string" &&
    (IMAGE_MIME_TYPES as readonly string[]).includes(value)
  );
}

function parseStoredImage(
  value: JsonObject | null,
): StoredImageV1 | null {
  if (
    !value ||
    value.ok !== true ||
    typeof value.storagePath !== "string" ||
    typeof value.publicUrl !== "string" ||
    !isImageMimeType(value.mimeType)
  ) {
    return null;
  }

  return {
    storagePath: value.storagePath,
    publicUrl: value.publicUrl,
    mimeType: value.mimeType,
  };
}

export function createAfuzaGeneratedImageHttpStorageV1(
  options: AfuzaGeneratedImageHttpStorageOptionsV1,
): GeneratedImageStorageV1 {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async storeGeneratedImage(
      input: StoreGeneratedImageInputV1,
    ): Promise<StoredImageV1> {
      let response: Response;

      try {
        response = await fetchImpl(
          `${baseUrl}/api/internal/generation/images/upload`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${options.workerSecret}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              siteId: input.siteId,
              generationJobId: input.generationJobId,
              requestId: input.requestId,
              retryCount: input.retryCount,
              mimeType: input.mimeType,
              bytesBase64: Buffer.from(input.bytes).toString("base64"),
            }),
          },
        );
      } catch {
        throw new Error(
          "IMAGE_STORAGE_UPLOAD_FAILED:GENERATION_IMAGE_BOUNDARY_UNAVAILABLE",
        );
      }

      const body = await readJsonSafely(response);

      if (!response.ok) {
        const code =
          body && typeof body.code === "string"
            ? body.code
            : "GENERATION_IMAGE_BOUNDARY_REJECTED";

        throw new Error(`IMAGE_STORAGE_UPLOAD_FAILED:${code}`);
      }

      const stored = parseStoredImage(body);

      if (!stored) {
        throw new Error(
          "IMAGE_STORAGE_UPLOAD_FAILED:INVALID_GENERATION_IMAGE_RESPONSE",
        );
      }

      return stored;
    },
  };
}

export type AfuzaGeneratedImageHttpStorageV1 =
  ReturnType<typeof createAfuzaGeneratedImageHttpStorageV1>;
