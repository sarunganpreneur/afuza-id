import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { validSiteContentFixtures } from "@/lib/site-content/fixtures";
import { createSafeCtaHref, SafeImage } from "./index";
import SiteRenderer from "./index";

describe("SiteRenderer", () => {
  it("renders supported sections as text without raw HTML", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    content.sections.push(
      { id: "features", type: "feature_grid", title: "Fitur", items: [{ title: "Satu", body: "Isi" }] },
      { id: "items", type: "item_grid", title: "Menu", items: [{ title: "Produk", body: "Detail", image: "/product.jpg" }] },
      { id: "steps", type: "steps", title: "Langkah", steps: [{ number: 1, title: "Mulai", body: "Isi" }] },
      { id: "benefits", type: "benefits", title: "Manfaat", items: [{ title: "Cepat", body: "Isi" }] },
      { id: "faq", type: "faq", title: "FAQ", items: [{ question: "Apa?", answer: "Ini." }] },
      { id: "cta", type: "cta", title: "Ayo", cta: { label: "Kirim", kind: "email", target: "halo@example.com" } },
      { id: "text", type: "text", title: "Catatan", body: "Teks biasa" },
    );
    const html = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(html).toContain("Fitur");
    expect(html).toContain("FAQ");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("builds safe CTA targets", () => {
    expect(createSafeCtaHref({ label: "WA", kind: "whatsapp", target: "081234567890" })).toBe("https://wa.me/6281234567890");
    expect(createSafeCtaHref({ label: "Mail", kind: "email", target: "hello@example.com" })).toBe("mailto:hello%40example.com");
    expect(createSafeCtaHref({ label: "Bad", kind: "external", target: "javascript:alert(1)" })).toBeNull();
  });

  it("uses safe external link attributes", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    const hero = content.sections[0] as Extract<typeof content.sections[number], { type: "hero" }>;
    hero.cta = { label: "Visit", kind: "external", target: "https://example.com" };
    const html = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders valid images and a local fallback for invalid sources", () => {
    const valid = renderToStaticMarkup(React.createElement(SafeImage, { src: "/images/available.jpg", alt: "Produk" }));
    const invalid = renderToStaticMarkup(React.createElement(SafeImage, { src: "javascript:alert(1)", alt: "Produk" }));
    expect(valid).toContain('<img');
    expect(valid).toContain('src="/images/available.jpg"');
    expect(invalid).toContain("site-renderer-image-fallback");
    expect(invalid).not.toContain("<img");
    expect(invalid).not.toContain("javascript:");
  });

  it("renders brand text when the logo URL is invalid without an image element", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    content.header.logo = "javascript:invalid-logo";
    const html = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(html).toContain("Dapur Rasa");
    expect(html).not.toContain("javascript:invalid-logo");
    expect(html).not.toContain("site-renderer-logo");
  });

  it("renders brand text immediately for the default placeholder logo", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    content.header.logo = "/logo.png";
    const html = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(html).toContain("Dapur Rasa");
    expect(html).not.toContain('src="/logo.png"');
    expect(html).not.toContain("site-renderer-logo");
  });

  it("renders a valid logo as a loading-safe image", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    content.header.logo = "https://cdn.example.com/logo.png";
    const html = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(html).toContain("site-renderer-logo");
    expect(html).toContain('alt=""');
  });

  it("keeps missing optional images from creating broken image elements", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    const hero = content.sections[0] as Extract<typeof content.sections[number], { type: "hero" }>;
    delete hero.image;
    const html = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(html).not.toContain('class="site-renderer-image"');
  });

  it("keeps product cards in the responsive product grid", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    content.sections.push({ id: "menu", type: "item_grid", title: "Menu", items: [{ title: "Produk", body: "Detail", image: "/product.jpg" }] });
    const html = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(html).toContain("site-renderer-product-grid");
  });

  it("renders dynamic navbar brand, navigation, and primary CTA", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    const html = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(html).toContain("Dapur Rasa");
    expect(html).toContain('aria-label="Navigasi utama"');
    expect(html).toContain("Hubungi kami");
    expect(html).toContain('class="site-renderer-header"');
  });

  it("renders a split hero and a text-first fallback without a broken image", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    const hero = content.sections[0] as Extract<typeof content.sections[number], { type: "hero" }>;
    const withImage = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(withImage).toContain("site-renderer-hero-visual");
    expect(withImage).toContain('class="site-renderer-image"');
    delete hero.image;
    const fallback = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(fallback).toContain("site-renderer-hero-fallback");
    expect(fallback).not.toContain('class="site-renderer-image"');
  });

  it("renders a value strip only from supplied feature content", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    const withoutValues = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(withoutValues).not.toContain("site-renderer-value-strip");
    content.sections.push({ id: "benefits", type: "benefits", title: "Benefits", items: [{ title: "Supplied", body: "Source fact" }] });
    const withValues = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(withValues).toContain("site-renderer-value-strip");
    expect(withValues).toContain("Supplied");
    expect(withValues).not.toContain("Invented");
  });

  it("supports the full-width review preview and three-column product canvas", () => {
    const content = structuredClone(validSiteContentFixtures.umkmKuliner);
    content.sections.push({ id: "menu", type: "item_grid", title: "Menu", items: [
      { title: "A", body: "A", image: "/a.jpg" },
      { title: "B", body: "B", image: "/b.jpg" },
      { title: "C", body: "C", image: "/c.jpg" },
    ] });
    const html = renderToStaticMarkup(React.createElement(SiteRenderer, { content }));
    expect(html).toContain("site-renderer-product-grid");
    expect(html).toContain("site-renderer-hero-visual");
    expect(html).toContain("site-renderer-header");
  });
});