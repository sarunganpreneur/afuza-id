import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getDashboardSiteState } from "@/lib/sites/dashboard-state";
import { isSelectedVersionPublished, publishViewState } from "@/lib/sites/publish-view";

const migration = readFileSync(new URL("../../supabase/migrations/20260915_edit_regenerate_v1.sql", import.meta.url), "utf8");
const generationAction = readFileSync(new URL("./actions/generation.ts", import.meta.url), "utf8");
const briefAction = readFileSync(new URL("./actions/brief.ts", import.meta.url), "utf8");
const briefForm = readFileSync(new URL("./dashboard/sites/[siteId]/brief/brief-form.tsx", import.meta.url), "utf8");
const briefPage = readFileSync(new URL("./dashboard/sites/[siteId]/brief/page.tsx", import.meta.url), "utf8");
const reviewPage = readFileSync(new URL("./dashboard/sites/[siteId]/review/page.tsx", import.meta.url), "utf8");
const publishMigration = readFileSync(new URL("../../supabase/migrations/20260912_site_publish_public_read_v1.sql", import.meta.url), "utf8");

describe("Edit & Regenerate V1 contract", () => {
  it("makes RENDERING terminal while preserving future active statuses", () => {
    expect(migration).toContain("'RENDERING'::public.generation_status");
    expect(migration).toContain("status not in (");
    expect(migration.match(/status not in \(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["RENDERING", false], ["LIVE", false], ["ERROR", false], ["CANCELLED", false],
    ["QUEUED", true], ["ANALYZING", true], ["GENERATING_CONTENT", true], ["GENERATING_IMAGES", true],
  ])("uses the expected active-job semantics for %s", (status, active) => {
    const predicate = migration.match(/status not in \([\s\S]*?\);/)?.[0] ?? "";
    expect(predicate.includes(`'${status}'::public.generation_status`)).toBe(!active);
  });

  it("keeps the preflight deterministic and does not mutate existing jobs", () => {
    expect(migration).toContain("having count(*) > 1");
    expect(migration).toContain("active generation-job index shape is unexpected");
    expect(migration).toContain("pg_catalog.pg_get_expr(i.indpred, i.indrelid)");
    expect(migration).toContain("v_indpred is null");
    expect(migration).toContain("regexp_replace(lower(v_predicate)");
    expect(migration).toContain("v_terminal_statuses <> ARRAY['CANCELLED', 'ERROR', 'LIVE']::text[]");
    expect(migration).not.toMatch(/update public\.generation_jobs|delete from public\.generation_jobs|requeue_failed_generation_job/);
  });

  it("accepts equivalent PostgreSQL predicates and rejects wrong terminal sets", () => {
    const isOldPredicate = (predicate: string) => {
      const normalized = predicate.toLowerCase().replace(/\s+/g, "").replaceAll("public.", "");
      let core = normalized;
      while (core.startsWith("(") && core.endsWith(")")) core = core.slice(1, -1);
      const statuses = [...predicate.matchAll(/'([^']+)'::(?:public\.)?generation_status/gi)].map((match) => match[1].toUpperCase()).sort();
      return /^status<>all\(array\['[^']+'::generation_status(,'[^']+'::generation_status){2}\]\)$/.test(core)
        && JSON.stringify(statuses) === JSON.stringify(["CANCELLED", "ERROR", "LIVE"]);
    };

    expect(isOldPredicate("status <> ALL (ARRAY['LIVE'::generation_status, 'ERROR'::generation_status, 'CANCELLED'::generation_status])")).toBe(true);
    expect(isOldPredicate("(( status <> ALL ( ARRAY[ 'LIVE'::public.generation_status, 'ERROR'::public.generation_status, 'CANCELLED'::public.generation_status ] ) ))")).toBe(true);
    expect(isOldPredicate("status <> ALL (ARRAY['RENDERING'::generation_status, 'LIVE'::generation_status, 'ERROR'::generation_status, 'CANCELLED'::generation_status])")).toBe(false);
    expect(isOldPredicate("status <> ALL (ARRAY['LIVE'::generation_status, 'ERROR'::generation_status])")).toBe(false);
    expect(isOldPredicate("status <> ALL (ARRAY['LIVE'::generation_status, 'ERROR'::generation_status, 'CANCELLED'::generation_status, 'QUEUED'::generation_status])")).toBe(false);
    expect(isOldPredicate("status = 'LIVE'::generation_status")).toBe(false);
  });

  it("keeps structural index guards for wrong key, uniqueness, and partial shape", () => {
    expect(migration).toContain("v_indrelid <> 'public.generation_jobs'::regclass");
    expect(migration).toContain("not v_indisunique");
    expect(migration).toContain("v_indnkeyatts <> 1");
    expect(migration).toContain("v_indnatts <> 1");
    expect(migration).toContain("v_indpred is null");
    expect(migration).toContain("a.attname = 'site_id'");
  });

  it("saves the latest brief before requesting generation", () => {
    expect(generationAction).toContain("const saved = await saveBrief({}, formData);");
    expect(generationAction).toContain("const requested = await requestSiteGenerationAction({}, formData);");
    expect(generationAction.indexOf("saveBrief")).toBeLessThan(generationAction.indexOf("requestSiteGenerationAction({}, formData)"));
    expect(generationAction).toContain('rpc("request_site_generation"');
    expect(briefAction).toContain('rpc("save_site_brief"');
  });

  it("uses version-aware regeneration and prevents duplicate submission", () => {
    expect(briefPage).toContain("current_content_version");
    expect(briefForm).toContain("Buat Versi Baru dengan AI");
    expect(briefForm).toContain("Simpan Perubahan");
    expect(briefForm).toContain("formAction={generationAction}");
    expect(briefForm).toContain("disabled={pending || generationPending}");
    expect(briefForm).toContain("Membuat versi baru...");
  });

  it("binds both submit actions to one non-nested brief form", () => {
    const formOpen = briefForm.indexOf("<form action={formAction}");
    const formClose = briefForm.indexOf("</form>", formOpen);
    const generationButton = briefForm.indexOf("formAction={generationAction}");
    expect(formOpen).toBeGreaterThanOrEqual(0);
    expect(formClose).toBeGreaterThan(formOpen);
    expect(generationButton).toBeGreaterThan(formOpen);
    expect(generationButton).toBeLessThan(formClose);
    expect(briefForm.match(/<form\b/g)?.length).toBe(1);
    expect(briefForm).toContain('type="submit" formAction={generationAction}');
  });

  it("defaults review to the newest unpublished version but respects an explicit query", () => {
    expect(reviewPage).toContain("newestUnpublishedVersion");
    expect(reviewPage).toContain("query.version");
    expect(reviewPage).toContain("Number.isInteger(explicitVersion)");
    expect(reviewPage).toContain("review.versions.some");
    expect(reviewPage).toContain("newestUnpublishedVersion ?? review.site.published_version");
  });

  it("preserves explicit publish/public-read version safety", () => {
    expect(publishMigration).toContain("published_version = p_version_number");
    expect(publishMigration).toContain("sv.version_number = s.published_version");
    expect(migration).not.toContain("published_version =");
    expect(migration).not.toContain("status = 'LIVE'");
  });

  it("keeps v1 public while v2 is the unpublished current version", () => {
    expect(getDashboardSiteState({
      siteStatus: "LIVE",
      currentContentVersion: 2,
      publishedVersion: 1,
      latestJobStatus: "RENDERING",
      latestValidVersion: { versionNumber: 2, schemaVersion: "site_content_v1" },
    })).toBe("ONLINE");
    expect(publishViewState("LIVE", 1, 2)).toBe("newer");
    expect(isSelectedVersionPublished({ siteStatus: "LIVE", publishedVersion: 1, selectedVersion: 1 })).toBe(true);
    expect(isSelectedVersionPublished({ siteStatus: "LIVE", publishedVersion: 1, selectedVersion: 2 })).toBe(false);
  });
});