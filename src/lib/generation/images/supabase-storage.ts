import { createGeneratedImageStorage, type GeneratedImageStorageOptionsV1 } from "./storage";
import type { StoreGeneratedImageInputV1, StoredImageV1 } from "./contracts";

export const IMAGE_STORAGE_BUCKET_V1 = "site-assets";

type SupabaseStorageBucketV1 = {
  upload(path: string, body: Blob, options: { contentType: string; upsert: false }): Promise<{ error: { message?: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
};

type SupabaseStorageClientV1 = {
  from(bucket: string): SupabaseStorageBucketV1;
};

export type SupabaseGeneratedImageStorageOptionsV1 = {
  maxBytes?: number;
  storage: SupabaseStorageClientV1;
};

export function createSupabaseGeneratedImageStorageV1(options: SupabaseGeneratedImageStorageOptionsV1) {
  const bucketStorage = options.storage.from(IMAGE_STORAGE_BUCKET_V1);
  const storageOptions: GeneratedImageStorageOptionsV1 = {
    maxBytes: options.maxBytes,
    publicUrlForPath: (path) => bucketStorage.getPublicUrl(path).data.publicUrl,
    put: async (path, input: StoreGeneratedImageInputV1) => {
      const response = await bucketStorage.upload(
        path,
        new Blob([input.bytes as unknown as BlobPart], { type: input.mimeType }),
        { contentType: input.mimeType, upsert: false },
      );
      if (response.error) throw new Error(`IMAGE_STORAGE_UPLOAD_FAILED:${response.error.message ?? "unknown"}`);
    },
  };
  return createGeneratedImageStorage(storageOptions);
}

export type SupabaseGeneratedImageStorageV1 = ReturnType<typeof createSupabaseGeneratedImageStorageV1>;
export type StoredImageResultV1 = StoredImageV1;
