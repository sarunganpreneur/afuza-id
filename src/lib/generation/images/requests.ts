import type { WebsiteAnalysisInputV1, WebsiteAnalysisV1 } from "@/lib/server/website-analysis";
import type { SiteContentSection } from "@/lib/site-content/schema";
import type { ImageAspectRatio, ImageRequestV1, ImageRole } from "./contracts";

export type ImageRequestContextV1 = {
  siteId: string;
  generationJobId: string;
  retryCount: number;
  source: WebsiteAnalysisInputV1;
  analysis: WebsiteAnalysisV1;
};

function roleForSection(section: SiteContentSection): ImageRole {
  return section.type === "hero" ? "hero" : "section";
}

function aspectRatioForRole(role: ImageRole): ImageAspectRatio {
  return role === "hero" ? "16:9" : role === "product" ? "1:1" : "4:3";
}

function sectionPurpose(section: SiteContentSection): string {
  return section.title;
}

function productDescription(item: { title: string; body: string }): string {
  return `${item.title}. ${item.body}`;
}

const NO_TEXT_INSTRUCTION = "Photographic visual only. No text. No typography. No letters. No numbers. No logo. No watermark. No signage. No labels. No poster. No advertising banner. Do not render product names or headlines inside the image.";

export function buildImagePrompt(input: {
  businessName: string;
  businessType: string;
  targetMarket: string;
  productsServices: string;
  purpose: string;
  role: ImageRole;
  copy?: string;
}): string {
  const visualDirection = input.role === "hero"
    ? "Premium contextual food/business photography with strong composition and clear space suitable for an adjacent HTML headline."
    : input.role === "product"
      ? `Create clean professional food/product photography with no menu-card styling whose primary and dominant subject is: ${input.purpose}. Treat the product name only as a subject description. Exactly one primary product or dish must dominate the frame. Do not showcase sibling menu products, unrelated dishes, samplers, platters, restaurant menu spreads, or multiple menu items competing for attention. Do not add a beverage unless the beverage itself is the target product. Keep background props minimal. Never render the product name as text.`
      : "Contextual supporting photography with an authentic environment and no infographic or poster styling.";
  return [
    input.role === "product" ? `The broader business context is ${input.productsServices} for a ${input.businessType} business.` : `Create a ${input.role} image showing ${input.productsServices} for a ${input.businessType} business.`,
    `Audience context: ${input.targetMarket}. ${visualDirection}`,
    `Use the subject context only as visual guidance; all headlines, CTA copy, section titles, product names, prices, and website copy are rendered separately in HTML.`,
    NO_TEXT_INSTRUCTION,
  ].join(" ");
}

export function collectImageRequestsV1(content: SiteContentSection[] | { sections: SiteContentSection[] }, context: ImageRequestContextV1): ImageRequestV1[] {
  const sections = Array.isArray(content) ? content : content.sections;
  const business = {
    businessName: context.source.business.name,
    businessType: context.source.business.business_type,
    targetMarket: context.source.business.target_market,
    productsServices: context.source.business.products_services,
  };
  const heroRequests: ImageRequestV1[] = [];
  const productRequests: ImageRequestV1[] = [];
  const sectionRequests: ImageRequestV1[] = [];

  sections.forEach((section, sectionIndex) => {
    if ("image" in section && section.image) {
      const role = roleForSection(section);
      const request = {
        id: `section-${sectionIndex}-${section.id}`,
        siteId: context.siteId,
        generationJobId: context.generationJobId,
        retryCount: context.retryCount,
        role,
        sourcePath: `sections[${sectionIndex}].image`,
        prompt: buildImagePrompt({ ...business, purpose: sectionPurpose(section), role }),
        aspectRatio: aspectRatioForRole(role),
        alt: sectionPurpose(section),
        optional: true,
      } satisfies ImageRequestV1;
      (role === "hero" ? heroRequests : sectionRequests).push(request);
    }
    if (section.type === "item_grid") {
      section.items.forEach((item, itemIndex) => {
        if (!item.image) return;
        productRequests.push({
          id: `section-${sectionIndex}-item-${itemIndex}`,
          siteId: context.siteId,
          generationJobId: context.generationJobId,
          retryCount: context.retryCount,
          role: "product",
          sourcePath: `sections[${sectionIndex}].items[${itemIndex}].image`,
          prompt: buildImagePrompt({ ...business, purpose: productDescription(item), role: "product" }),
          aspectRatio: aspectRatioForRole("product"),
          alt: item.title,
          optional: true,
        });
      });
    }
  });

  return [...heroRequests, ...productRequests, ...sectionRequests];
}
