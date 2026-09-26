import "server-only";

import { z } from "zod";
import { SiteContentV1Schema, type SiteContentV1 } from "@/lib/site-content/schema";
import { safeParseSiteContentV1, validateSafeCanonicalUrl } from "@/lib/site-content/validation";
import { createClient } from "@/lib/supabase/server";

const UUID = z.string().uuid();
export type SiteReview = {
  site: { id: string; name: string; slug: string; status: string; current_content_version: number; published_version: number | null; published_at: string | null };
  versions: Array<{ id: string; version_number: number; created_at: string; content: SiteContentV1; theme: SiteContentV1["theme"]; seo: SiteContentV1["seo"] }>;
  generationJobs: Array<{ id: string; status: string; created_at: string }>;
};

function parseSnapshot(value: unknown): SiteContentV1 | null {
  const result = safeParseSiteContentV1(value);
  return result.success ? result.data : null;
}

export async function getOwnedSiteReview(siteId: string): Promise<SiteReview | null> {
  if (!UUID.safeParse(siteId).success) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: site, error } = await supabase.from("sites").select("id, name, slug, status, current_content_version, published_version, published_at").eq("id", siteId).eq("owner_id", user.id).maybeSingle();
  if (error || !site) return null;
  const [{ data: versions }, { data: jobs }] = await Promise.all([
    supabase.from("site_versions").select("id, version_number, created_at, content_snapshot, theme_snapshot, seo_snapshot").eq("site_id", siteId).order("version_number", { ascending: false }),
    supabase.from("generation_jobs").select("id, status, created_at").eq("site_id", siteId).order("created_at", { ascending: false }).limit(10),
  ]);
  const safeVersions = (versions ?? []).flatMap((version) => {
    const content = parseSnapshot(version.content_snapshot);
    if (!content) return [];
    const theme = SiteContentV1Schema.shape.theme.safeParse(version.theme_snapshot);
    const seo = SiteContentV1Schema.shape.seo.safeParse(version.seo_snapshot);
    if (!theme.success || !seo.success) return [];
    return [{ id: version.id, version_number: version.version_number, created_at: version.created_at, content, theme: theme.data, seo: seo.data }];
  });
  return { site, versions: safeVersions, generationJobs: jobs ?? [] };
}

export async function publishOwnedSiteVersion(siteId: string, versionNumber: number) {
  if (!UUID.safeParse(siteId).success || !Number.isInteger(versionNumber) || versionNumber < 1) return { ok: false as const, error: "INVALID_INPUT" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_site_version", { p_site_id: siteId, p_version_number: versionNumber });
  if (error) return { ok: false as const, error: "PUBLISH_FAILED" };
  return { ok: true as const, data: Array.isArray(data) ? data[0] : data };
}

export async function unpublishOwnedSite(siteId: string) {
  if (!UUID.safeParse(siteId).success) return { ok: false as const, error: "INVALID_INPUT" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unpublish_site", { p_site_id: siteId });
  if (error) return { ok: false as const, error: "UNPUBLISH_FAILED" };
  return { ok: true as const, data: Array.isArray(data) ? data[0] : data };
}

export async function getPublishedSiteBySlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_published_site", { p_slug: normalized });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const content = parseSnapshot(row.content_snapshot);
  const theme = SiteContentV1Schema.shape.theme.safeParse(row.theme_snapshot);
  const seo = SiteContentV1Schema.shape.seo.safeParse(row.seo_snapshot);
  if (!content || !theme.success || !seo.success || (seo.data.canonical && !validateSafeCanonicalUrl(seo.data.canonical).ok)) return null;
  return { name: row.name, slug: row.slug, published_version: row.published_version, published_at: row.published_at, content, theme: theme.data, seo: seo.data };
}