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
  ] = await Promise.all([
    supabase
      .from("sites")
      .select(
        "id, name, slug, status, current_content_version, published_version, published_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(250),

    supabase
      .from("generation_jobs")
      .select("id, site_id, status, retry_count, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (sitesError || jobsError) {
    return NextResponse.json(
      { error: "OPS_PROJECTS_QUERY_FAILED" },
      { status: 500 },
    );
  }

  const safeSites = sites ?? [];
  const safeJobs = jobs ?? [];

  const latestJobBySite = new Map<string, (typeof safeJobs)[number]>();

  for (const job of safeJobs) {
    if (!latestJobBySite.has(job.site_id)) {
      latestJobBySite.set(job.site_id, job);
    }
  }

  const projects = safeSites.map((site) => {
    const job = latestJobBySite.get(site.id);

    let health: "HEALTHY" | "WARNING" | "AT_RISK" = "HEALTHY";

    if (job && FAILED.has(job.status)) {
      health = "AT_RISK";
    } else if (job && RUNNING.has(job.status)) {
      health = "WARNING";
    }

    return {
      id: site.id,
      name: site.name,
      slug: site.slug,
      site_status: site.status,
      health,
      current_content_version: site.current_content_version,
      published_version: site.published_version,
      published_at: site.published_at,
      latest_job: job
        ? {
            id: job.id,
            status: job.status,
            retry_count: job.retry_count,
            created_at: job.created_at,
          }
        : null,
      created_at: site.created_at,
    };
  });

  return NextResponse.json(
    {
      count: projects.length,
      projects,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
