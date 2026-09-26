import { NextResponse } from "next/server";
import { requireOpsApiAccess } from "@/lib/ops/api";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

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
    { data: versions, error: versionsError },
    { data: sites, error: sitesError },
  ] = await Promise.all([
    supabase
      .from("generation_jobs")
      .select("id, site_id, status, retry_count, created_at")
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("site_versions")
      .select("id, site_id, version_number, created_at")
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("sites")
      .select("id, name, slug")
      .limit(500),
  ]);

  if (jobsError || versionsError || sitesError) {
    return NextResponse.json(
      { error: "OPS_ACTIVITY_QUERY_FAILED" },
      { status: 500 },
    );
  }

  const siteMap = new Map(
    (sites ?? []).map((site) => [
      site.id,
      { name: site.name, slug: site.slug },
    ]),
  );

  const jobEvents = (jobs ?? []).map((job) => ({
    id: `job:${job.id}`,
    type: "GENERATION_JOB",
    site_id: job.site_id,
    site_name: siteMap.get(job.site_id)?.name ?? "Unknown Site",
    site_slug: siteMap.get(job.site_id)?.slug ?? null,
    label: `Generation ${job.status}`,
    detail:
      (job.retry_count ?? 0) > 0
        ? `Retry count: ${job.retry_count}`
        : "Generation pipeline event",
    status: job.status,
    created_at: job.created_at,
  }));

  const versionEvents = (versions ?? []).map((version) => ({
    id: `version:${version.id}`,
    type: "SITE_VERSION",
    site_id: version.site_id,
    site_name: siteMap.get(version.site_id)?.name ?? "Unknown Site",
    site_slug: siteMap.get(version.site_id)?.slug ?? null,
    label: `Site version v${version.version_number}`,
    detail: "Generated site version committed",
    status: "VERSION_CREATED",
    created_at: version.created_at,
  }));

  const events = [...jobEvents, ...versionEvents]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime(),
    )
    .slice(0, 150);

  return NextResponse.json(
    { events },
    { headers: { "Cache-Control": "no-store" } },
  );
}
