"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { ReactNode } from "react";
import type { SiteContentCta, SiteContentV1 } from "@/lib/site-content/schema";
import { normalizeWhatsAppNumber, validateSafeImageUrl, validateSafeTarget } from "@/lib/site-content/validation";

export function createSafeCtaHref(cta: SiteContentCta): string | null {
  if (cta.kind === "whatsapp") {
    const number = normalizeWhatsAppNumber(cta.target);
    return number ? `https://wa.me/${number}` : null;
  }
  if (cta.kind === "email") return validateSafeTarget(cta.target, "email").ok ? `mailto:${encodeURIComponent(cta.target)}` : null;
  if (cta.kind === "external") return validateSafeTarget(cta.target, "external").ok ? cta.target : null;
  if (cta.kind === "anchor") return validateSafeTarget(cta.target, "anchor").ok ? cta.target : null;
  if (cta.kind === "internal") return validateSafeTarget(cta.target, "internal").ok ? cta.target : null;
  return null;
}

export function SafeImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(!validateSafeImageUrl(src).ok);
  if (failed) return <div className="site-renderer-image-fallback" role="img" aria-label={`${alt} image unavailable`} />;
  return <img src={src} alt={alt} loading="lazy" className="site-renderer-image" onError={() => setFailed(true)} />;
}

function BrandMark({ content }: { content: SiteContentV1 }) {
  const logo = content.header.logo;
  const isPlaceholderLogo = logo === "/logo.png" || logo === "/logo.jpg" || logo === "/logo.jpeg";
  const [logoState, setLogoState] = useState<"loading" | "loaded" | "failed">(logo && !isPlaceholderLogo && validateSafeImageUrl(logo).ok ? "loading" : "failed");
  if (logo && logoState !== "failed") return <img className={`site-renderer-logo${logoState === "loading" ? " site-renderer-logo-loading" : ""}`} src={logo} alt={logoState === "loaded" ? content.site.name : ""} aria-hidden={logoState !== "loaded"} onLoad={() => setLogoState("loaded")} onError={() => setLogoState("failed")} />;
  return <strong className="site-renderer-brand-name">{content.site.name}</strong>;
}

function CtaLink({ cta }: { cta?: SiteContentCta }) {
  if (!cta) return null;
  const href = createSafeCtaHref(cta);
  if (!href) return null;
  const external = cta.kind === "external" || cta.kind === "whatsapp";
  return <a className="site-renderer-cta" href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{cta.label}</a>;
}

function SectionShell({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  return <section id={id} className="site-renderer-section"><div className="site-renderer-container">{title && <h2>{title}</h2>}{children}</div></section>;
}

function valueItems(content: SiteContentV1): Array<{ title: string; body: string }> {
  for (const section of content.sections) {
    if ((section.type === "feature_grid" || section.type === "benefits") && section.items.length > 0) return section.items.slice(0, 4);
  }
  return [];
}

export default function SiteRenderer({ content }: { content: SiteContentV1 }) {
  const hero = content.sections.find((section): section is Extract<SiteContentV1["sections"][number], { type: "hero" }> => section.type === "hero");
  const values = valueItems(content);
  return <div className={`site-renderer site-renderer-${content.theme.style} site-renderer-${content.theme.density}`} data-radius={content.theme.borderRadius}>
    <header className="site-renderer-header"><div className="site-renderer-container"><a className="site-renderer-brand" href="#hero" aria-label={content.site.name}><BrandMark content={content} /></a><nav aria-label="Navigasi utama">{content.header.navigation.map((item) => <a key={item.target} href={`#${item.target}`}>{item.label}</a>)}</nav><CtaLink cta={hero?.cta} /></div></header>
    <main>{content.sections.map((section) => {
      switch (section.type) {
        case "hero": return <section id={section.id} className="site-renderer-hero" key={section.id}><div className="site-renderer-container"><div className="site-renderer-hero-copy"><p className="site-renderer-eyebrow">{section.eyebrow}</p><h1>{section.title}</h1>{section.body && <p>{section.body}</p>}<div className="site-renderer-hero-actions"><CtaLink cta={section.cta} /></div></div><div className="site-renderer-hero-visual">{section.image ? <SafeImage src={section.image} alt={section.title} /> : <div className="site-renderer-hero-fallback"><span>{content.site.name}</span></div>}</div></div>{values.length > 0 && <div className="site-renderer-value-strip site-renderer-container">{values.map((item) => <article key={item.title}><span aria-hidden="true">+</span><div><h2>{item.title}</h2><p>{item.body}</p></div></article>)}</div>}</section>;
        case "about": return <SectionShell id={section.id} title={section.title} key={section.id}><p>{section.body}</p>{section.image && <SafeImage src={section.image} alt={section.title} />}</SectionShell>;
        case "feature_grid": case "benefits": return <SectionShell id={section.id} title={section.title} key={section.id}><div className="site-renderer-grid">{section.items.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></SectionShell>;
        case "item_grid": return <SectionShell id={section.id} title={section.title} key={section.id}><div className="site-renderer-grid site-renderer-product-grid">{section.items.map((item) => <article key={item.title}>{item.image && <SafeImage src={item.image} alt={item.title} />}<h3>{item.title}</h3><p>{item.body}</p><CtaLink cta={item.cta} /></article>)}</div></SectionShell>;
        case "steps": return <SectionShell id={section.id} title={section.title} key={section.id}><ol className="site-renderer-grid">{section.steps.map((step) => <li key={step.number}><strong>{step.number}</strong><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol></SectionShell>;
        case "faq": return <SectionShell id={section.id} title={section.title} key={section.id}><div>{section.items.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></SectionShell>;
        case "cta": return <SectionShell id={section.id} title={section.title} key={section.id}><p>{section.body}</p><CtaLink cta={section.cta} /></SectionShell>;
        case "contact": return <SectionShell id={section.id} title={section.title} key={section.id}><p>{section.body}</p>{section.address && <address>{section.address}</address>}{section.email && <p>{section.email}</p>}{section.phone && <p>{section.phone}</p>}<CtaLink cta={section.cta} /></SectionShell>;
        case "text": return <SectionShell id={section.id} title={section.title} key={section.id}><p>{section.body}</p></SectionShell>;
      }
    })}</main>
    <footer className="site-renderer-footer"><div className="site-renderer-container"><p>{content.footer.description}</p><nav aria-label="Navigasi footer">{content.footer.links.map((item) => <a key={item.target} href={`#${item.target}`}>{item.label}</a>)}</nav><small>{content.footer.copyright}</small></div></footer>
  </div>;
}