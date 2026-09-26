export const DASHBOARD_ACTIVE_GENERATION_STATUSES = [
  "QUEUED",
  "ANALYZING",
  "GENERATING_CONTENT",
  "GENERATING_IMAGES",
] as const;

export type DashboardSiteState = "ONLINE" | "READY_TO_REVIEW" | "GENERATING" | "FAILED" | "DRAFT";

export function dashboardGenerationLabel(status: string | null): string {
  if (status === "QUEUED") return "Menunggu proses...";
  if (status === "ANALYZING") return "Menganalisis bisnis...";
  if (status === "GENERATING_CONTENT") return "Menyusun konten website...";
  if (status === "GENERATING_IMAGES") return "Membuat gambar website...";
  return "Website belum dibuat";
}

export function getDashboardSiteState(input: {
  siteStatus: string;
  currentContentVersion: number;
  publishedVersion: number | null;
  latestJobStatus: string | null;
  latestValidVersion: { versionNumber: number; schemaVersion: string } | null;
}): DashboardSiteState {
  if (input.siteStatus === "LIVE" && input.publishedVersion !== null) return "ONLINE";
  if (input.latestJobStatus === "RENDERING"
    && input.currentContentVersion > 0
    && input.latestValidVersion?.versionNumber === input.currentContentVersion
    && input.latestValidVersion.schemaVersion === "site_content_v1") return "READY_TO_REVIEW";
  if (input.latestJobStatus === "ERROR") return "FAILED";
  if (DASHBOARD_ACTIVE_GENERATION_STATUSES.includes(input.latestJobStatus as (typeof DASHBOARD_ACTIVE_GENERATION_STATUSES)[number])) return "GENERATING";
  return "DRAFT";
}

export function dashboardStateLabel(state: DashboardSiteState, latestJobStatus: string | null): string {
  if (state === "ONLINE") return "Website sudah online";
  if (state === "READY_TO_REVIEW") return "Website siap direview";
  if (state === "FAILED") return "Pembuatan website belum berhasil";
  if (state === "GENERATING") return dashboardGenerationLabel(latestJobStatus);
  return "Website belum dibuat";
}

export function hasActiveDashboardGeneration(statuses: Array<string | null>): boolean {
  return statuses.some((status) => DASHBOARD_ACTIVE_GENERATION_STATUSES.includes(status as (typeof DASHBOARD_ACTIVE_GENERATION_STATUSES)[number]));
}