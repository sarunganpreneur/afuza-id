"use server";

import { redirect } from "next/navigation";
import { createBaseSlug } from "@/lib/sites/slug";
import { createClient } from "@/lib/supabase/server";
import { getIneligiblePath, isDashboardEligible, type AccountProfile } from "@/lib/auth/eligibility";

export type CreateSiteFormState = {
  fieldErrors?: Partial<Record<"business_name" | "business_type", string>>;
  formError?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function createSite(
  _previousState: CreateSiteFormState,
  formData: FormData,
): Promise<CreateSiteFormState> {
  const businessName = readText(formData, "business_name");
  const businessType = readText(formData, "business_type");
  const fieldErrors: CreateSiteFormState["fieldErrors"] = {};

  if (!businessName) {
    fieldErrors.business_name = "Nama usaha wajib diisi.";
  } else if (businessName.length < 2) {
    fieldErrors.business_name = "Nama usaha minimal 2 karakter.";
  } else if (businessName.length > 120) {
    fieldErrors.business_name = "Nama usaha maksimal 120 karakter.";
  }

  if (!businessType) {
    fieldErrors.business_type = "Jenis usaha wajib diisi.";
  } else if (businessType.length < 2) {
    fieldErrors.business_type = "Jenis usaha minimal 2 karakter.";
  } else if (businessType.length > 120) {
    fieldErrors.business_type = "Jenis usaha maksimal 120 karakter.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

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

  const baseSlug = createBaseSlug(businessName);
  const { data, error } = await supabase.rpc("create_business_with_site", {
    p_business_name: businessName,
    p_business_type: businessType,
    p_site_name: businessName,
    p_base_slug: baseSlug,
  });

  if (error || !Array.isArray(data) || data.length !== 1) {
    return { formError: "Website belum dapat dibuat. Silakan coba kembali." };
  }

  const result = data[0] as {
    business_id?: unknown;
    site_id?: unknown;
    site_slug?: unknown;
    site_status?: unknown;
  };

  if (
    typeof result.business_id !== "string" || !UUID_PATTERN.test(result.business_id)
    || typeof result.site_id !== "string" || !UUID_PATTERN.test(result.site_id)
    || typeof result.site_slug !== "string" || !SLUG_PATTERN.test(result.site_slug)
    || result.site_slug.length > 63
    || result.site_status !== "DRAFT"
  ) {
    return { formError: "Website belum dapat dibuat. Silakan coba kembali." };
  }

  redirect(`/dashboard/sites/${result.site_id}/brief`);
}
