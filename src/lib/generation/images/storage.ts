import { IMAGE_MIME_TYPES, type GeneratedImageStorageV1, type StoreGeneratedImageInputV1, type StoredImageV1 } from "./contracts";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

export type GeneratedImageStorageOptionsV1 = {
  publicUrlForPath: (storagePath: string) => string;
  maxBytes?: number;
  put: (storagePath: string, input: StoreGeneratedImageInputV1) => Promise<void>;
};

export function generatedImageStoragePath(input: Pick<StoreGeneratedImageInputV1, "siteId" | "generationJobId" | "requestId" | "retryCount" | "mimeType">): string {
  if (![input.siteId, input.generationJobId, input.requestId].every((value) => SAFE_ID.test(value))) throw new Error("UNSAFE_IMAGE_STORAGE_IDENTIFIER");
  if (!Number.isInteger(input.retryCount) || input.retryCount < 0) throw new Error("INVALID_IMAGE_RETRY_COUNT");
  const extension = input.mimeType.slice("image/".length);
  return `sites/${input.siteId}/generation-jobs/${input.generationJobId}/attempt-${input.retryCount}/${input.requestId}.${extension}`;
}

export function controlledStorageCleanupSucceeded(input: { exactObjectExists: boolean; publicStatus: number; publicContentType: string | null }): boolean {
  return !input.exactObjectExists && !(input.publicStatus === 200 && (input.publicContentType ?? "").toLowerCase().startsWith("image/"));
}

export function createGeneratedImageStorage(options: GeneratedImageStorageOptionsV1): GeneratedImageStorageV1 {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  return {
    async storeGeneratedImage(input): Promise<StoredImageV1> {
      if (!IMAGE_MIME_TYPES.includes(input.mimeType)) throw new Error("UNSUPPORTED_IMAGE_MIME");
      if (input.bytes.byteLength === 0 || input.bytes.byteLength > maxBytes) throw new Error("IMAGE_SIZE_LIMIT_EXCEEDED");
      const storagePath = generatedImageStoragePath(input);
      await options.put(storagePath, input);
      return { storagePath, publicUrl: options.publicUrlForPath(storagePath), mimeType: input.mimeType };
    },
  };
}
