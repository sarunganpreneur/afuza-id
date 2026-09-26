import { describe, expect, it, vi } from "vitest";

import { validSiteContentFixtures } from "@/lib/site-content/fixtures";
import type { SiteContentV1 } from "@/lib/site-content/schema";
import type { StoreGeneratedImageInputV1 } from "./images/contracts";
import { runImagePipelineV1 } from "./images/pipeline";
import type { ImageRequestContextV1 } from "./images/requests";

const context: ImageRequestContextV1 = {
  siteId: "61c79c23-690a-4f5d-8eca-4d3588362c7c",
  generationJobId: "03137715-b9f0-41eb-8072-9e0135de32a8",
  retryCount: 0,
  source: {
    business: { name: "Example Business", business_type: "Restaurant", target_market: "Families", products_services: "Soup", usp: null, whatsapp: null, address: null },
  } as ImageRequestContextV1["source"],
  analysis: {} as ImageRequestContextV1["analysis"],
};

function contentWithHeroImage() {
  const content = structuredClone(validSiteContentFixtures.umkmKuliner);
  return content;
}

function storage() {
  return {
    async storeGeneratedImage(_input: StoreGeneratedImageInputV1) {
      void _input;
      return { storagePath: "attempt-0/hero.webp", publicUrl: "https://storage.example.test/hero.webp", mimeType: "image/webp" as const };
    },
  };
}

describe("worker Image Pipeline V1 ordering contract", () => {
  it("advances to images, completes the pipeline, commits, then advances to rendering", async () => {
    const events: string[] = [];
    const commit = vi.fn(async (_content: SiteContentV1) => { void _content; events.push("commit"); });
    const content = contentWithHeroImage();

    events.push("GENERATING_CONTENT");
    events.push("advance:GENERATING_IMAGES");
    const imageResult = await runImagePipelineV1(content, context, {
      provider: { generateImage: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/webp" as const, width: 1200, height: 675 }) },
      storage: storage(),
    });
    events.push("final_site_content_validation");
    await commit(imageResult.content);
    events.push("advance:RENDERING");

    expect(events).toEqual([
      "GENERATING_CONTENT",
      "advance:GENERATING_IMAGES",
      "final_site_content_validation",
      "commit",
      "advance:RENDERING",
    ]);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(events.indexOf("commit")).toBeGreaterThan(events.indexOf("advance:GENERATING_IMAGES"));
  });

  it("does not commit when image generation fails before final validation", async () => {
    const commit = vi.fn();
    await expect(runImagePipelineV1(contentWithHeroImage(), context, {
      provider: { generateImage: async () => { throw new Error("IMAGE_PROVIDER_FAILED"); } },
      storage: storage(),
    })).resolves.toMatchObject({ state: "RENDERING", warnings: ["sections[0].image:IMAGE_OPTIONAL_FAILED"] });

    expect(commit).toHaveBeenCalledTimes(0);
  });
});