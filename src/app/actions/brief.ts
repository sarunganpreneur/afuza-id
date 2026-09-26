"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIneligiblePath, isDashboardEligible, type AccountProfile } from "@/lib/auth/eligibility";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const FIELD_LIMITS = {
  business_type: 120,
  target_market: 500,
  products_services: 3000,
  usp: 1000,
  whatsapp: 16,
  address: 1000,
  website_goal: 1000,
  primary_cta: 200,
  style_preference: 200,
  color_preference: 7,
  reference_urls: 2000,
  notes: 3000,
  halal_status: 32,
} as const;

const STYLE_OPTIONS = new Set([
  "Modern",
  "Minimalis",
  "Profesional",
  "Elegan",
  "Playful",
  "Natural",
  "Bold",
]);

const HALAL_STATUS_VALUES = ["CERTIFIED", "IN_PROCESS", "NOT_CERTIFIED", "UNSURE", "NOT_RELEVANT"] as const;

const FIELD_LABELS: Record<BriefField, string> = {
  business_type: "Jenis usaha",
  target_market: "Target market",
  products_services: "Produk / layanan",
  usp: "USP",
  whatsapp: "WhatsApp bisnis",
  address: "Alamat",
  website_goal: "Tujuan website",
  primary_cta: "CTA utama",
  style_preference: "Style",
  color_preference: "Warna utama",
  reference_urls: "Referensi",
  notes: "Catatan",
  halal_status: "Status sertifikat halal",
};

type BriefField = keyof typeof FIELD_LIMITS;

type BriefFields = Record<BriefField, string>;

export type SaveBriefFormState = {
  fieldErrors?: Partial<Record<BriefField, string>>;
  formError?: string;
  success?: boolean;
  values?: Partial<Record<BriefField, string>>;
};

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhatsapp(value: string) {
  const compact = value.replace(/[\s().-]/g, "").replace(/^\+/, "");
  if (/^08\d{8,13}$/.test(compact)) return `62${compact.slice(1)}`;
  if (/^628\d{8,13}$/.test(compact)) return compact;
  return null;
}

function normalizeHalalStatusForDb(value: string) {
  if (HALAL_STATUS_VALUES.includes(value as (typeof HALAL_STATUS_VALUES)[number])) {
    return value as (typeof HALAL_STATUS_VALUES)[number];
  }
  return "UNSURE";
}

function readFields(formData: FormData): BriefFields {
  return Object.fromEntries(
    (Object.keys(FIELD_LIMITS) as BriefField[]).map((field) => [field, readText(formData, field)]),
  ) as BriefFields;
}

function validateFields(fields: BriefFields) {
  const fieldErrors: SaveBriefFormState["fieldErrors"] = {};
  const requiredFields: Array<[BriefField, string]> = [
    ["business_type", "Jenis usaha wajib diisi."],
    ["target_market", "Target market wajib diisi."],
    ["products_services", "Produk / layanan wajib diisi."],
    ["primary_cta", "CTA utama wajib diisi."],
    ["halal_status", "Pilih status sertifikat halal."],
  ];

  for (const [field, message] of requiredFields) {
    if (!fields[field]) fieldErrors[field] = message;
  }

  for (const field of Object.keys(FIELD_LIMITS) as BriefField[]) {
    if (fields[field].length > FIELD_LIMITS[field]) {
      fieldErrors[field] = `${FIELD_LABELS[field]} maksimal ${FIELD_LIMITS[field]} karakter.`;
    }
  }

  if (fields.whatsapp && !normalizeWhatsapp(fields.whatsapp)) {
    fieldErrors.whatsapp = "Nomor WhatsApp bisnis tidak valid.";
  }

  if (fields.color_preference && !COLOR_PATTERN.test(fields.color_preference)) {
    fieldErrors.color_preference = "Gunakan warna dalam format #RRGGBB.";
  }

  if (fields.style_preference && !STYLE_OPTIONS.has(fields.style_preference)) {
    fieldErrors.style_preference = "Pilih style yang tersedia.";
  }

  if (fields.halal_status && !HALAL_STATUS_VALUES.includes(fields.halal_status as (typeof HALAL_STATUS_VALUES)[number])) {
    fieldErrors.halal_status = "Pilih status sertifikat halal.";
  }

  return fieldErrors;
}

function logSaveFailure(category: string) {
  console.error(`[brief-save] ${category}`);
}

export async function saveBrief(
  _previousState: SaveBriefFormState,
  formData: FormData,
): Promise<SaveBriefFormState> {
  const siteId = readText(formData, "site_id");
  if (!UUID_PATTERN.test(siteId)) return { formError: "Website belum dapat dimuat. Silakan coba kembali." };

  const fields = readFields(formData);
  const fieldErrors = validateFields(fields);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      fieldErrors,
      values: fields,
    };
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
    .select("id, business_id")
    .eq("id", siteId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (siteError || !site) return { formError: "Website belum dapat dimuat. Silakan coba kembali." };

  const halalStatus = normalizeHalalStatusForDb(fields.halal_status);
  const { error: saveError } = await supabase.rpc("save_site_brief", {
    p_site_id: siteId,
    p_business_type: fields.business_type,
    p_target_market: fields.target_market,
    p_products_services: fields.products_services,
    p_usp: fields.usp || null,
    p_whatsapp: fields.whatsapp ? normalizeWhatsapp(fields.whatsapp) : null,
    p_address: fields.address || null,
    p_primary_cta: fields.primary_cta,
    p_website_goal: fields.website_goal || null,
    p_style_preference: fields.style_preference || null,
    p_color_preference: fields.color_preference || null,
    p_reference_urls: fields.reference_urls || null,
    p_notes: fields.notes || null,
    p_image_mode: "AI",
    p_halal_status: halalStatus,
    p_extra_answers: { halal_status: halalStatus },
  });

  if (saveError) {
    logSaveFailure("atomic_rpc_save");
    return { formError: "Brief belum berhasil disimpan. Silakan coba lagi." };
  }

  return { success: true };
}
