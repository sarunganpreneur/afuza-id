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
      .limit(300),

    supabase
      .from("sites")
      .select("id, name, slug")
      .limit(500),
  ]);

  if (jobsError || sitesError) {
    return NextResponse.json(
      { error: "OPS_ALERTS_QUERY_FAILED" },
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
  const alerts: Array<{
    id: string;
    severity: "WARNING" | "HIGH" | "CRITICAL";
    type: string;
    title: string;
    detail: string;
    site_id: string;
    site_name: string;
    created_at: string;
  }> = [];

  for (const job of jobs ?? []) {
    const ageMinutes = Math.max(
      0,
      Math.round((now - new Date(job.created_at).getTime()) / 60000),
    );

    const siteName =
      siteMap.get(job.site_id)?.name ?? "Unknown Site";

    if (FAILED.has(job.status)) {
      alerts.push({
        id: `failed:${job.id}`,
        severity: "HIGH",
        type: "GENERATION_FAILED",
        title: `Generation failed · ${siteName}`,
        detail: `Status ${job.status} · retry ${job.retry_count ?? 0}`,
        site_id: job.site_id,
        site_name: siteName,
        created_at: job.created_at,
      });
    }

    if (RUNNING.has(job.status) && ageMinutes >= 60) {
      alerts.push({
        id: `stale:${job.id}`,
        severity: ageMinutes >= 180 ? "CRITICAL" : "WARNING",
        type: "STALE_GENERATION",
        title: `Generation appears stale · ${siteName}`,
        detail: `${job.status} for approximately ${ageMinutes} minutes`,
        site_id: job.site_id,
        site_name: siteName,
        created_at: job.created_at,
      });
    }

    if ((job.retry_count ?? 0) >= 2) {
      alerts.push({
        id: `retry:${job.id}`,
        severity: "WARNING",
        type: "HIGH_RETRY_COUNT",
        title: `Repeated generation retries · ${siteName}`,
        detail: `Retry count: ${job.retry_count}`,
        site_id: job.site_id,
        site_name: siteName,
        created_at: job.created_at,
      });
    }
  }

  const weight = {
    CRITICAL: 3,
    HIGH: 2,
    WARNING: 1,
  } as const;

  alerts.sort((a, b) => {
    const severity =
      weight[b.severity] - weight[a.severity];

    if (severity !== 0) return severity;

    return (
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
    );
  });

  return NextResponse.json(
    {
      summary: {
        total: alerts.length,
        critical: alerts.filter((a) => a.severity === "CRITICAL").length,
        high: alerts.filter((a) => a.severity === "HIGH").length,
        warning: alerts.filter((a) => a.severity === "WARNING").length,
      },
      alerts,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
