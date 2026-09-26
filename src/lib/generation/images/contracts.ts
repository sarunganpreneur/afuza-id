import type { SiteContentV1 } from "@/lib/site-content/schema";

export const IMAGE_ROLES = ["hero", "section", "product"] as const;
export type ImageRole = (typeof IMAGE_ROLES)[number];
export const IMAGE_ASPECT_RATIOS = ["16:9", "4:3", "1:1"] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export type ImageRequestV1 = {
  id: string;
  siteId: string;
  generationJobId: string;
  retryCount: number;
  role: ImageRole;
  sourcePath: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  alt: string;
  optional: true;
};

export type ImageGenerationResultV1 = {
  bytes: Uint8Array;
  mimeType: ImageMimeType;
  width: number;
  height: number;
};

export interface ImageGenerationProviderV1 {
  generateImage(request: ImageRequestV1): Promise<ImageGenerationResultV1>;
}

export type StoredImageV1 = {
  storagePath: string;
  publicUrl: string;
  mimeType: ImageMimeType;
};

export type StoreGeneratedImageInputV1 = {
  siteId: string;
  generationJobId: string;
  requestId: string;
  retryCount: number;
  bytes: Uint8Array;
  mimeType: ImageMimeType;
  overwrite: false;
};

export interface GeneratedImageStorageV1 {
  storeGeneratedImage(input: StoreGeneratedImageInputV1): Promise<StoredImageV1>;
}

export type ImagePipelineStateV1 = "GENERATING_CONTENT" | "GENERATING_IMAGES" | "RENDERING";

export type ImagePipelineResultV1 = {
  content: SiteContentV1;
  requests: ImageRequestV1[];
  warnings: string[];
  summary: {
    image_requests: number;
    image_generated: number;
    image_failed: number;
    image_skipped: number;
  };
  state: ImagePipelineStateV1;
};
