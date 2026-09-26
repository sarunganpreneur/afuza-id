import { describe, expect, it } from "vitest";

import { validSiteContentFixtures } from "@/lib/site-content/fixtures";
import type { WebsiteAnalysisInputV1, WebsiteAnalysisV1 } from "@/lib/server/website-analysis";
import type { SiteContentV1 } from "@/lib/site-content/schema";
import { MockImageGenerationProviderV1 } from "./mock-provider";
import { buildImagePrompt, collectImageRequestsV1 } from "./requests";
import { runImagePipelineV1 } from "./pipeline";
import { controlledStorageCleanupSucceeded, createGeneratedImageStorage, generatedImageStoragePath } from "./storage";

const context = {
  siteId: "61c79c23-690a-4f5d-8eca-4d3588362c7c",
  generationJobId: "03137715-b9f0-41eb-8072-9e0135de32a8",
  retryCount: 0,
  source: {
    business: { name: "Example Business", business_type: "Restaurant", target_market: "Families", products_services: "Soup", usp: null, whatsapp: null, address: null },
  } as WebsiteAnalysisInputV1,
  analysis: {} as WebsiteAnalysisV1,
};

function contentWithItemImages(): SiteContentV1 {
  const content = structuredClone(validSiteContentFixtures.umkmKuliner);
  content.sections.push({
    id: "menu",
    type: "item_grid",
    title: "Menu",
    items: [
      { title: "Soup", body: "Soup description", image: "/missing-one.jpg" },
      { title: "Rice", body: "Rice description", image: "/missing-two.jpg" },
    ],
  });
  content.header.navigation.push({ label: "Menu", target: "menu" });
  return content;
}

function storage() {
  const stored = new Map<string, Uint8Array>();
  return {
    stored,
    adapter: createGeneratedImageStorage({
      publicUrlForPath: (path) => `https://storage.example.test/${path}`,
      put: async (path, input) => {
        if (stored.has(path)) throw new Error("IMAGE_STORAGE_COLLISION");
        expect(input.overwrite).toBe(false);
        stored.set(path, input.bytes);
      },
    }),
  };
}

describe("Image Pipeline V1 contracts", () => {
  it("detects section and product image-bearing fields", () => {
    const requests = collectImageRequestsV1(contentWithItemImages().sections, context);
    expect(requests.map((request) => request.sourcePath)).toEqual([
      "sections[0].image",
      "sections[3].items[0].image",
      "sections[3].items[1].image",
    ]);
    expect(requests.map((request) => request.role)).toEqual(["hero", "product", "product"]);
  });

  it("builds context-driven prompts without hardcoded business names", () => {
    const request = collectImageRequestsV1(contentWithItemImages().sections, context)[0];
    expect(request.prompt).toContain("Soup");
    expect(request.prompt).not.toContain("Example Business");
    expect(request.prompt).not.toContain("Bakso Marem");
    expect(request.prompt).toContain("No text.");
    expect(request.prompt).toContain("No typography.");
    expect(request.prompt).toContain("No advertising banner.");
  });

  it("uses role-specific visual direction without renderable copy", () => {
    const prompts = [
      buildImagePrompt({ businessName: "Example Business", businessType: "Restaurant", targetMarket: "Families", productsServices: "Soup", purpose: "hero headline", role: "hero" }),
      buildImagePrompt({ businessName: "Example Business", businessType: "Restaurant", targetMarket: "Families", productsServices: "Soup", purpose: "product name", role: "product" }),
      buildImagePrompt({ businessName: "Example Business", businessType: "Restaurant", targetMarket: "Families", productsServices: "Soup", purpose: "section title", role: "section" }),
    ];
    expect(prompts[0]).toContain("Premium contextual food/business photography");
    expect(prompts[0]).toContain("adjacent HTML headline");
    expect(prompts[1]).toContain("clean professional food/product photography");
    expect(prompts[1]).toContain("primary and dominant subject is: product name");
    expect(prompts[1]).toContain("Exactly one primary product or dish");
    expect(prompts[1]).toContain("no menu-card styling");
    expect(prompts[1]).toContain("Do not showcase sibling menu products");
    expect(prompts[1]).toContain("Do not add a beverage unless the beverage itself is the target product");
    expect(prompts[2]).toContain("Contextual supporting photography");
    for (const prompt of prompts) {
      expect(prompt).toContain("all headlines, CTA copy, section titles, product names");
      expect(prompt).not.toContain("Create Bakso");
      expect(prompt).not.toContain("promotional poster");
    }
  });

  it("uses each product item as the exact semantic subject without typography instructions", () => {
    const requests = collectImageRequestsV1(contentWithItemImages().sections, context).filter((request) => request.role === "product");
    expect(requests[0].prompt).toContain("Soup. Soup description");
    expect(requests[1].prompt).toContain("Rice. Rice description");
    for (const request of requests) {
      expect(request.prompt).toContain("Never render the product name as text");
      expect(request.prompt).toContain("No text.");
    }
  });

  it("runs the mock provider, stores URLs, and reaches rendering without a commit", async () => {
    const imageStorage = storage();
    const states: string[] = [];
    const result = await runImagePipelineV1(contentWithItemImages(), context, {
      provider: new MockImageGenerationProviderV1(),
      storage: imageStorage.adapter,
      onState: (state) => states.push(state),
    });
    expect(states).toEqual(["GENERATING_IMAGES", "RENDERING"]);
    expect(result.state).toBe("RENDERING");
    expect(result.warnings).toEqual([]);
    expect(imageStorage.stored.size).toBe(3);
    expect((result.content.sections[0] as Extract<SiteContentV1["sections"][number], { type: "hero" }>).image).toMatch(/^https:\/\/storage\.example\.test\//);
    expect((result.content.sections[3] as Extract<SiteContentV1["sections"][number], { type: "item_grid" }>).items[0].image).toMatch(/^https:\/\/storage\.example\.test\//);
    expect(result.summary).toEqual({ image_requests: 3, image_generated: 3, image_failed: 0, image_skipped: 0 });
  });

  it("removes optional images after provider failure and returns a warning", async () => {
    const imageStorage = storage();
    const result = await runImagePipelineV1(contentWithItemImages(), context, {
      provider: { generateImage: async () => { throw new Error("PROVIDER_UNAVAILABLE"); } },
      storage: imageStorage.adapter,
    });
    expect(result.warnings).toHaveLength(3);
    expect((result.content.sections[0] as Extract<SiteContentV1["sections"][number], { type: "hero" }>).image).toBeUndefined();
    expect((result.content.sections[3] as Extract<SiteContentV1["sections"][number], { type: "item_grid" }>).items[0].image).toBeUndefined();
  });

  it("rejects unsafe MIME, unsafe identifiers, oversized files, and collisions", async () => {
    expect(() => generatedImageStoragePath({ siteId: "../bad", generationJobId: "job", requestId: "image", retryCount: 0, mimeType: "image/png" })).toThrow("UNSAFE_IMAGE_STORAGE_IDENTIFIER");
    const imageStorage = storage();
    await expect(imageStorage.adapter.storeGeneratedImage({ siteId: "site", generationJobId: "job", requestId: "image", retryCount: 0, bytes: new Uint8Array([1]), mimeType: "image/png", overwrite: false })).resolves.toMatchObject({ mimeType: "image/png" });
    await expect(imageStorage.adapter.storeGeneratedImage({ siteId: "site", generationJobId: "job", requestId: "image", retryCount: 0, bytes: new Uint8Array([2]), mimeType: "image/png", overwrite: false })).rejects.toThrow("IMAGE_STORAGE_COLLISION");
    await expect(imageStorage.adapter.storeGeneratedImage({ siteId: "site", generationJobId: "job", requestId: "bad", retryCount: 0, bytes: new Uint8Array([1]), mimeType: "image/gif" as never, overwrite: false })).rejects.toThrow("UNSUPPORTED_IMAGE_MIME");
  });

  it("keeps paths stable within an attempt and separates retries", () => {
    const first = generatedImageStoragePath({ siteId: "site", generationJobId: "job", requestId: "image", retryCount: 0, mimeType: "image/webp" });
    expect(generatedImageStoragePath({ siteId: "site", generationJobId: "job", requestId: "image", retryCount: 0, mimeType: "image/webp" })).toBe(first);
    expect(generatedImageStoragePath({ siteId: "site", generationJobId: "job", requestId: "image", retryCount: 1, mimeType: "image/webp" })).not.toBe(first);
    expect(first).toBe("sites/site/generation-jobs/job/attempt-0/image.webp");
  });

  it("rejects invalid retry counts", () => {
    expect(() => generatedImageStoragePath({ siteId: "site", generationJobId: "job", requestId: "image", retryCount: -1, mimeType: "image/png" })).toThrow("INVALID_IMAGE_RETRY_COUNT");
    expect(() => generatedImageStoragePath({ siteId: "site", generationJobId: "job", requestId: "image", retryCount: 1.5, mimeType: "image/png" })).toThrow("INVALID_IMAGE_RETRY_COUNT");
  });

  it("enforces the four-image cap in hero, product, section order", async () => {
    const content = structuredClone(contentWithItemImages());
    content.sections.push({ id: "about-image", type: "about", title: "About", body: "About", image: "/about.jpg" });
    content.sections.push({ id: "contact-image", type: "about", title: "Contact", body: "Contact", image: "/contact.jpg" });
    const imageStorage = storage();
    const result = await runImagePipelineV1(content, context, {
      provider: new MockImageGenerationProviderV1(),
      storage: imageStorage.adapter,
      maxImages: 4,
    });
    expect(result.summary).toEqual({ image_requests: 5, image_generated: 4, image_failed: 0, image_skipped: 1 });
    expect(result.requests.map((request) => request.role)).toEqual(["hero", "product", "product", "section", "section"]);
    expect((result.content.sections[5] as Extract<SiteContentV1["sections"][number], { type: "about" }>).image).toBeUndefined();
  });

  it("does not discover header logos as AI image requests", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    content.header.logo = "/logo.svg";
    expect(collectImageRequestsV1(content.sections, context).some((request) => request.role === "section" && request.sourcePath.includes("logo"))).toBe(false);
  });

  it("removes an optional image after storage failure without an invalid URL", async () => {
    const content = contentWithItemImages();
    const result = await runImagePipelineV1(content, context, {
      provider: new MockImageGenerationProviderV1(),
      storage: { storeGeneratedImage: async () => { throw new Error("STORAGE_FAILED"); } },
    });
    expect(result.summary.image_failed).toBe(3);
    expect(result.warnings).toHaveLength(3);
    expect(result.content.sections[0]).not.toHaveProperty("image", expect.stringContaining("STORAGE_FAILED"));
  });

  it("reports exactly one stored object with the retry-safe request path", async () => {
    const imageStorage = storage();
    const stored: Array<{ storagePath: string; publicUrl: string; mimeType: string }> = [];
    const result = await runImagePipelineV1(validSiteContentFixtures.umkmKuliner, context, {
      provider: new MockImageGenerationProviderV1(),
      storage: imageStorage.adapter,
      maxImages: 1,
      roles: ["hero"],
      onImageStored: (image) => stored.push(image),
    });
    expect(result.summary.image_generated).toBe(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      storagePath: "sites/61c79c23-690a-4f5d-8eca-4d3588362c7c/generation-jobs/03137715-b9f0-41eb-8072-9e0135de32a8/attempt-0/section-0-hero.webp",
      mimeType: "image/webp",
    });
  });

  it("accepts non-200 public cleanup responses when authoritative storage is empty", () => {
    expect(controlledStorageCleanupSucceeded({ exactObjectExists: false, publicStatus: 400, publicContentType: "application/json" })).toBe(true);
    expect(controlledStorageCleanupSucceeded({ exactObjectExists: false, publicStatus: 404, publicContentType: "application/json" })).toBe(true);
    expect(controlledStorageCleanupSucceeded({ exactObjectExists: false, publicStatus: 200, publicContentType: "image/webp" })).toBe(false);
    expect(controlledStorageCleanupSucceeded({ exactObjectExists: true, publicStatus: 400, publicContentType: "application/json" })).toBe(false);
  });
});
