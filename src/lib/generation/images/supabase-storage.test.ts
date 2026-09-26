import { describe, expect, it } from "vitest";

import { IMAGE_STORAGE_BUCKET_V1, createSupabaseGeneratedImageStorageV1 } from "./supabase-storage";

describe("Supabase generated image storage adapter", () => {
  it("uses the approved bucket contract and stable public URL", async () => {
    expect(IMAGE_STORAGE_BUCKET_V1).toBe("site-assets");
    const calls: Array<{ path: string; contentType: string; upsert: boolean; size: number }> = [];
    const buckets: string[] = [];
    const adapter = createSupabaseGeneratedImageStorageV1({
      storage: {
        from(bucket) {
          buckets.push(bucket);
          return {
            async upload(path, body, options) {
              calls.push({ path, contentType: options.contentType, upsert: options.upsert, size: body.size });
              return { error: null };
            },
            getPublicUrl(path) {
              return { data: { publicUrl: `https://storage.example.test/${path}` } };
            },
          };
        },
      },
    });

    const result = await adapter.storeGeneratedImage({
      siteId: "site",
      generationJobId: "job",
      requestId: "hero-1",
      retryCount: 0,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/webp",
      overwrite: false,
    });

    expect(result).toEqual({
      storagePath: "sites/site/generation-jobs/job/attempt-0/hero-1.webp",
      publicUrl: "https://storage.example.test/sites/site/generation-jobs/job/attempt-0/hero-1.webp",
      mimeType: "image/webp",
    });
    expect(buckets).toEqual(["site-assets"]);
    expect(calls).toEqual([{ path: "sites/site/generation-jobs/job/attempt-0/hero-1.webp", contentType: "image/webp", upsert: false, size: 3 }]);
  });

  it("surfaces upload errors without logging secrets", async () => {
    const adapter = createSupabaseGeneratedImageStorageV1({
      storage: {
        from() {
          return {
            async upload() { return { error: { message: "bucket unavailable" } }; },
            getPublicUrl(path) { return { data: { publicUrl: path } }; },
          };
        },
      },
    });
    await expect(adapter.storeGeneratedImage({
      siteId: "site",
      generationJobId: "job",
      requestId: "hero-1",
      retryCount: 0,
      bytes: new Uint8Array([1]),
      mimeType: "image/png",
      overwrite: false,
    })).rejects.toThrow("IMAGE_STORAGE_UPLOAD_FAILED:bucket unavailable");
  });
});
