import { normalizeAndValidateSiteContentV1 } from "@/lib/site-content/validation";
import { validateSiteContentV1Semantics } from "@/lib/site-content/validation";
import type { SiteContentV1 } from "@/lib/site-content/schema";
import { collectImageRequestsV1, type ImageRequestContextV1 } from "./requests";
import type { GeneratedImageStorageV1, ImageGenerationProviderV1, ImageGenerationResultV1, ImagePipelineResultV1, ImagePipelineStateV1, ImageRequestV1, ImageRole } from "./contracts";

export type ImagePipelineOptionsV1 = {
  provider: ImageGenerationProviderV1;
  storage: GeneratedImageStorageV1;
  maxImages?: number;
  roles?: readonly ImageRole[];
  onImageGenerated?: (result: ImageGenerationResultV1) => void;
  onImageStored?: (stored: { storagePath: string; publicUrl: string; mimeType: string }, request: ImageRequestV1) => void;
  onImageError?: (error: unknown) => void;
  onState?: (state: ImagePipelineStateV1) => void;
};

function removeImageAtPath(content: SiteContentV1, sourcePath: string): void {
  const match = /^sections\[(\d+)\](?:\.items\[(\d+)\])?\.image$/.exec(sourcePath);
  if (!match) return;
  const section = content.sections[Number(match[1])];
  if (!section) return;
  if (match[2] === undefined) {
    if ("image" in section) delete section.image;
    return;
  }
  if (section.type === "item_grid") delete section.items[Number(match[2])].image;
}

function setImageAtPath(content: SiteContentV1, sourcePath: string, publicUrl: string): void {
  const match = /^sections\[(\d+)\](?:\.items\[(\d+)\])?\.image$/.exec(sourcePath);
  if (!match) throw new Error("UNSUPPORTED_IMAGE_SOURCE_PATH");
  const section = content.sections[Number(match[1])];
  if (!section) throw new Error("IMAGE_SOURCE_PATH_NOT_FOUND");
  if (match[2] === undefined) {
    if (!("image" in section)) throw new Error("IMAGE_SOURCE_PATH_NOT_FOUND");
    section.image = publicUrl;
    return;
  }
  if (section.type !== "item_grid" || !section.items[Number(match[2])]) throw new Error("IMAGE_SOURCE_PATH_NOT_FOUND");
  section.items[Number(match[2])].image = publicUrl;
}

export async function runImagePipelineV1(content: SiteContentV1, context: ImageRequestContextV1, options: ImagePipelineOptionsV1): Promise<ImagePipelineResultV1> {
  const draft = structuredClone(content);
  const requests = collectImageRequestsV1(draft.sections, context);
  const warnings: string[] = [];
  const maxImages = options.maxImages ?? 4;
  const eligibleRequests = options.roles ? requests.filter((request) => options.roles?.includes(request.role)) : requests;
  const selectedRequests = eligibleRequests.slice(0, Math.max(0, maxImages));
  let imageGenerated = 0;
  let imageFailed = 0;
  const imageSkipped = requests.length - selectedRequests.length;
  options.onState?.("GENERATING_IMAGES");

  for (const request of requests.filter((candidate) => !selectedRequests.includes(candidate))) {
    removeImageAtPath(draft, request.sourcePath);
    warnings.push(`${request.sourcePath}:IMAGE_SKIPPED_CAP`);
  }

  for (const request of selectedRequests) {
    try {
      const generated = await options.provider.generateImage(request);
      options.onImageGenerated?.(generated);
      const stored = await options.storage.storeGeneratedImage({
        siteId: request.siteId,
        generationJobId: request.generationJobId,
        requestId: request.id,
        retryCount: request.retryCount,
        bytes: generated.bytes,
        mimeType: generated.mimeType,
        overwrite: false,
      });
      options.onImageStored?.(stored, request);
      setImageAtPath(draft, request.sourcePath, stored.publicUrl);
      imageGenerated += 1;
    } catch (error) {
      options.onImageError?.(error);
      if (!request.optional) throw error;
      removeImageAtPath(draft, request.sourcePath);
      imageFailed += 1;
      warnings.push(`${request.sourcePath}:IMAGE_OPTIONAL_FAILED`);
    }
  }

  const finalContent = normalizeAndValidateSiteContentV1(draft);
  if (!finalContent.success) throw new Error("IMAGE_PIPELINE_FINAL_CONTENT_INVALID");
  const semantics = validateSiteContentV1Semantics(finalContent.data);
  if (!semantics.ok) throw new Error("IMAGE_PIPELINE_FINAL_CONTENT_SEMANTICS_INVALID");
  options.onState?.("RENDERING");
  return {
    content: finalContent.data,
    requests,
    warnings,
    summary: {
      image_requests: requests.length,
      image_generated: imageGenerated,
      image_failed: imageFailed,
      image_skipped: imageSkipped,
    },
    state: "RENDERING",
  };
}
