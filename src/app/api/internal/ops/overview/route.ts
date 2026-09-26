import { NextResponse } from "next/server";
import { requireOpsApiAccess } from "@/lib/ops/api";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const RUNNING = new Set([
  "QUEUED",
  "ANALYZING",
  "GENERATING_CONTENT",
  "GENERATING_IMAGES",
  "COMMITTING",
]);

const FAILED = new Set(["ERROR", "FAILED"]);

export async function GET() {
  const gate = await requireOpsApiAccess();
  if (gate.response) return gate.response;

  const supabase = await getServiceRoleClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "SERVICE_ROLE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const [
    { data: sites, error: sitesError },
    { data: jobs, error: jobsError },
    { data: versions, error: versionsError },
  ] = await Promise.all([
    supabase
      .from("sites")
      .select(
        "id, name, slug, status, current_content_version, published_version, published_at, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("generation_jobs")
      .select("id, site_id, status, retry_count, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("site_versions")
      .select("id, site_id, version_number, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (sitesError || jobsError || versionsError) {
    return NextResponse.json(
      { error: "OPS_OVERVIEW_QUERY_FAILED" },
      { status: 500 },
    );
  }

  const safeSites = sites ?? [];
  const safeJobs = jobs ?? [];
  const safeVersions = versions ?? [];

  const runningJobs = safeJobs.filter((job) => RUNNING.has(job.status)).length;
  const failedJobs = safeJobs.filter((job) => FAILED.has(job.status)).length;
  const publishedSites = safeSites.filter((site) =>
    Boolean(site.published_version),
  ).length;

  const latestJobBySite = new Map<string, (typeof safeJobs)[number]>();

  for (const job of safeJobs) {
    if (!latestJobBySite.has(job.site_id)) {
      latestJobBySite.set(job.site_id, job);
    }
  }

  const projects = safeSites.slice(0, 12).map((site) => {
    const latestJob = latestJobBySite.get(site.id);

    let health: "HEALTHY" | "WARNING" | "AT_RISK" = "HEALTHY";

    if (latestJob && FAILED.has(latestJob.status)) {
      health = "AT_RISK";
    } else if (latestJob && RUNNING.has(latestJob.status)) {
      health = "WARNING";
    }

    return {
      id: site.id,
      name: site.name,
      slug: site.slug,
      status: site.status,
      health,
      current_content_version: site.current_content_version,
      published_version: site.published_version,
      latest_job_status: latestJob?.status ?? null,
      created_at: site.created_at,
    };
  });

  const activity = [
    ...safeJobs.slice(0, 10).map((job) => ({
      type: "GENERATION_JOB",
      entity_id: job.id,
      site_id: job.site_id,
      status: job.status,
      created_at: job.created_at,
    })),
    ...safeVersions.slice(0, 10).map((version) => ({
      type: "SITE_VERSION",
      entity_id: version.id,
      site_id: version.site_id,
      status: `VERSION_${version.version_number}`,
      created_at: version.created_at,
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 12);

  return NextResponse.json(
    {
      metrics: {
        sites_total: safeSites.length,
        sites_published: publishedSites,
        generation_running: runningJobs,
        generation_failed: failedJobs,
      },
      projects,
      activity,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
