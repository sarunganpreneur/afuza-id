import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteRenderer from "@/components/site-renderer";
import { getPublishedSiteBySlug } from "@/lib/sites/review";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getPublishedSiteBySlug(slug);
  if (!site) return {};
  return { title: site.seo.title, description: site.seo.description, alternates: site.seo.canonical ? { canonical: site.seo.canonical } : undefined };
}

export default async function PublicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getPublishedSiteBySlug(slug);
  if (!site) notFound();
  return <SiteRenderer content={site.content} />;
}