"use server";

import { redirect } from "next/navigation";
import { saveBrief, type SaveBriefFormState } from "@/app/actions/brief";
import { getIneligiblePath, isDashboardEligible, type AccountProfile } from "@/lib/auth/eligibility";
import { createClient } from "@/lib/supabase/server";

export type RequestSiteGenerationState = {
  formError?: string;
  success?: boolean;
  reused?: boolean;
  jobId?: string;
  status?: string;
  message?: string;
};

export type SaveAndRequestSiteGenerationState = SaveBriefFormState & RequestSiteGenerationState;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeRequestSiteGenerationResult(data: unknown): { success: boolean; reused?: boolean; job_id?: string; status?: string; message?: string } {
  const candidate = Array.isArray(data) ? data[0] : data;

  if (!candidate || typeof candidate !== "object") {
    return { success: false };
  }

  const row = candidate as Record<string, unknown>;
  const reused = typeof row.reused === "boolean" ? row.reused : undefined;
  const status = typeof row.status === "string" ? row.status : undefined;
  const jobId = typeof row.job_id === "string" ? row.job_id : undefined;
  const message = typeof row.message === "string" ? row.message : undefined;
  const success = row.success === true || status === "QUEUED" || jobId !== undefined || reused === true;

  return {
    success,
    reused,
    job_id: jobId,
    status,
    message,
  };
}

export async function requestSiteGenerationAction(
  _previousState: RequestSiteGenerationState,
  formData: FormData,
): Promise<RequestSiteGenerationState> {
  const siteId = typeof formData.get("site_id") === "string" ? (formData.get("site_id") as string).trim() : "";

  if (!UUID_PATTERN.test(siteId)) {
    return { formError: "Website tidak valid." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email_verified_at, phone_verified_at, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) redirect("/verify-email");

  const accountProfile = profile as AccountProfile;
  if (!isDashboardEligible(accountProfile)) redirect(getIneligiblePath(accountProfile));

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id, owner_id")
    .eq("id", siteId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (siteError || !site) {
    return { formError: "Website tidak ditemukan atau tidak memiliki akses." };
  }

  const { data: brief, error: briefError } = await supabase
    .from("site_briefs")
    .select("site_id")
    .eq("site_id", site.id)
    .maybeSingle();

  if (briefError || !brief) {
    return { formError: "Brief website belum lengkap. Lengkapi brief sebelum membuat website dengan AI." };
  }

  const { data, error } = await supabase.rpc("request_site_generation", {
    p_site_id: siteId,
  });

  if (error) {
    console.error("[requestSiteGenerationAction] rpc_error", { code: error.code, category: "generation_request" });
    return { formError: "Permintaan pembuatan website belum dapat diproses." };
  }

  const normalized = normalizeRequestSiteGenerationResult(data);

  if (!normalized.success) {
    return { formError: "Permintaan pembuatan website belum dapat diproses." };
  }

  const successMessage = normalized.message
    ?? (normalized.reused ? "Website ini sudah berada dalam antrean pembuatan." : "Permintaan pembuatan website berhasil masuk antrean.");

  return {
    success: true,
    reused: normalized.reused ?? false,
    jobId: normalized.job_id,
    status: normalized.status ?? "QUEUED",
    message: successMessage,
  };
}

export async function saveAndRequestSiteGenerationAction(
  _previousState: SaveAndRequestSiteGenerationState,
  formData: FormData,
): Promise<SaveAndRequestSiteGenerationState> {
  const saved = await saveBrief({}, formData);
  if (!saved.success) return saved;

  const requested = await requestSiteGenerationAction({}, formData);
  if (!requested.success) return { ...saved, ...requested };

  return { ...saved, ...requested };
}
