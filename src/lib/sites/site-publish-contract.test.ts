import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260912_site_publish_public_read_v1.sql", "utf8");
const reviewRoute = readFileSync("src/app/dashboard/sites/[siteId]/review/page.tsx", "utf8");
const reviewControls = readFileSync("src/app/dashboard/sites/[siteId]/review/review-controls.tsx", "utf8");
const publicRoute = readFileSync("src/app/p/[slug]/page.tsx", "utf8");
const dal = readFileSync("src/lib/sites/review.ts", "utf8");

describe("Site Publish V1 contract", () => {
  it("uses the exact published status", () => expect(migration).toContain("'LIVE'::public.site_status"));
  it("uses the exact unpublished status", () => expect(migration).toContain("'DRAFT'::public.site_status"));
  it("defines publish RPC", () => expect(migration).toContain("publish_site_version(p_site_id uuid, p_version_number integer)"));
  it("defines unpublish RPC", () => expect(migration).toContain("unpublish_site(p_site_id uuid)"));
  it("defines public read RPC", () => expect(migration).toContain("get_published_site(p_slug text)"));
  it("uses security definer", () => expect(migration.match(/security definer/g)?.length).toBe(3));
  it("uses safe search paths", () => expect(migration.match(/set search_path = pg_catalog, public/g)?.length).toBe(3));
  it("checks version ownership by site", () => expect(migration).toContain("sv.site_id = p_site_id"));
  it("checks site_content_v1", () => expect(migration).toContain("schemaVersion' = 'site_content_v1"));
  it("locks publish site", () => expect(migration).toContain("where s.id = p_site_id for update"));
  it("clears published fields on unpublish", () => expect(migration).toContain("published_version = null, published_at = null"));
  it("does not expose a public table policy", () => expect(migration).not.toContain("create policy"));
  it("grants public read to anon", () => expect(migration).toContain("get_published_site(text) to anon"));
  it("does not grant publish to anon", () => expect(migration).toContain("publish_site_version(uuid, integer) from public, anon"));
  it("reads published content through the RPC", () => expect(dal).toContain('rpc("get_published_site"'));
  it("does not direct-query locked tables for public read", () => expect(publicRoute).not.toContain("from("));
  it("parses public snapshots before rendering", () => expect(dal).toContain("safeParseSiteContentV1"));
  it("has owner review data access", () => expect(dal).toContain("getOwnedSiteReview"));
  it("supports preview version selection", () => expect(reviewRoute).toContain("searchParams"));
  it("has publish controls", () => expect(reviewControls).toContain("Publish version"));
  it("renders missing public sites with notFound", () => expect(publicRoute).toContain("notFound()"));
  it("does not contain raw HTML rendering", () => expect(dal + reviewRoute + publicRoute).not.toContain("dangerouslySetInnerHTML"));
});