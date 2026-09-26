export const GENERATION_ACTIVE_STATUSES = [
  "QUEUED",
  "ANALYZING",
  "GENERATING_CONTENT",
  "GENERATING_IMAGES",
] as const;

export type GenerationProgressStatus =
  | (typeof GENERATION_ACTIVE_STATUSES)[number]
  | "RENDERING"
  | "ERROR"
  | "CANCELLED"
  | string;

export const GENERATION_PROGRESS_STAGES = [
  { key: "analysis", label: "Analisis" },
  { key: "content", label: "Konten" },
  { key: "images", label: "Gambar" },
  { key: "review", label: "Siap Direview" },
] as const;

export function generationStatusLabel(status: GenerationProgressStatus, reviewReady = false): string {
  if (status === "QUEUED") return "Menunggu proses...";
  if (status === "ANALYZING") return "Menganalisis bisnis...";
  if (status === "GENERATING_CONTENT") return "Menyusun konten website...";
  if (status === "GENERATING_IMAGES") return "Membuat gambar website...";
  if (status === "RENDERING" && reviewReady) return "Website siap direview";
  if (status === "RENDERING") return "Menyiapkan review...";
  if (status === "ERROR") return "Pembuatan website belum berhasil";
  if (status === "CANCELLED") return "Pembuatan website dibatalkan";
  return "Menyiapkan website...";
}

export function generationStageState(status: GenerationProgressStatus, reviewReady: boolean): Array<"complete" | "active" | "pending"> {
  if (status === "ERROR" || status === "CANCELLED") return ["complete", "complete", "complete", "pending"];
  if (reviewReady) return ["complete", "complete", "complete", "complete"];
  if (status === "QUEUED" || status === "ANALYZING") return ["active", "pending", "pending", "pending"];
  if (status === "GENERATING_CONTENT") return ["complete", "active", "pending", "pending"];
  if (status === "GENERATING_IMAGES") return ["complete", "complete", "active", "pending"];
  return ["complete", "complete", "complete", "active"];
}

export function isGenerationReviewReady(input: {
  status: string;
  currentContentVersion: number;
  versions: Array<{ version_number: number; content: { schemaVersion: string } }>;
}): boolean {
  return input.status === "RENDERING"
    && input.currentContentVersion > 0
    && input.versions.some((version) => version.version_number === input.currentContentVersion && version.content.schemaVersion === "site_content_v1");
}

export function shouldPollGeneration(status: string, reviewReady: boolean): boolean {
  return !reviewReady && GENERATION_ACTIVE_STATUSES.includes(status as (typeof GENERATION_ACTIVE_STATUSES)[number]);
}