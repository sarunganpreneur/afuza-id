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
    { data: jobs, error: jobsError },
    { data: sites, error: sitesError },
  ] = await Promise.all([
    supabase
      .from("generation_jobs")
      .select("id, site_id, status, retry_count, created_at")
      .order("created_at", { ascending: false })
      .limit(250),

    supabase
      .from("sites")
      .select("id, name, slug")
      .limit(500),
  ]);

  if (jobsError || sitesError) {
    return NextResponse.json(
      { error: "OPS_TASKS_QUERY_FAILED" },
      { status: 500 },
    );
  }

  const siteMap = new Map(
    (sites ?? []).map((site) => [
      site.id,
      { name: site.name, slug: site.slug },
    ]),
  );

  const now = Date.now();

  const tasks = (jobs ?? []).map((job) => {
    const site = siteMap.get(job.site_id);
    const ageMinutes = Math.max(
      0,
      Math.round((now - new Date(job.created_at).getTime()) / 60000),
    );

    const running = RUNNING.has(job.status);
    const failed = FAILED.has(job.status);

    return {
      id: job.id,
      site_id: job.site_id,
      site_name: site?.name ?? "Unknown Site",
      site_slug: site?.slug ?? null,
      status: job.status,
      retry_count: job.retry_count,
      created_at: job.created_at,
      age_minutes: ageMinutes,
      running,
      failed,
      stale: running && ageMinutes >= 60,
    };
  });

  return NextResponse.json(
    {
      summary: {
        total: tasks.length,
        running: tasks.filter((task) => task.running).length,
        failed: tasks.filter((task) => task.failed).length,
        stale: tasks.filter((task) => task.stale).length,
        retried: tasks.filter((task) => (task.retry_count ?? 0) > 0).length,
      },
      tasks,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
