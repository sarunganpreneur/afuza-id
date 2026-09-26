"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBrief, type SaveBriefFormState } from "@/app/actions/brief";
import { saveAndRequestSiteGenerationAction, type SaveAndRequestSiteGenerationState } from "@/app/actions/generation";

type BriefValues = {
  business_type: string;
  target_market: string;
  products_services: string;
  usp: string;
  whatsapp: string;
  address: string;
  website_goal: string;
  primary_cta: string;
  style_preference: string;
  color_preference: string;
  reference_urls: string;
  notes: string;
  image_mode?: string;
  halal_status: string;
};

type BriefEditableField = Exclude<keyof BriefValues, "image_mode">;

type BriefFormProps = {
  siteId: string;
  businessName: string;
  currentContentVersion: number;
  values: BriefValues;
};

const initialState: SaveBriefFormState = {};
const inputClassName = "w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]";
const labelClassName = "mb-2 block text-sm font-semibold text-[var(--brand-dark)]";
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const FIELD_ORDER: Array<BriefEditableField> = [
  "business_type",
  "target_market",
  "products_services",
  "usp",
  "whatsapp",
  "address",
  "website_goal",
  "primary_cta",
  "style_preference",
  "color_preference",
  "reference_urls",
  "notes",
  "halal_status",
];

export default function BriefForm({ siteId, businessName, currentContentVersion, values }: BriefFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SaveBriefFormState, FormData>(saveBrief, initialState);
  const [generationState, generationAction, generationPending] = useActionState<SaveAndRequestSiteGenerationState, FormData>(saveAndRequestSiteGenerationAction, {});
  const [draftValues, setDraftValues] = useState<BriefValues>(values);

  useEffect(() => {
    if (generationState.success && generationState.jobId) {
      router.push(`/dashboard/sites/${siteId}/review`);
    }
  }, [generationState.jobId, generationState.success, router, siteId]);

  useEffect(() => {
    const firstInvalidField = FIELD_ORDER.find((field) => !!state.fieldErrors?.[field]);
    const target = firstInvalidField ? document.getElementById(firstInvalidField) : null;

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => target.focus(), 80);
    }
  }, [state.fieldErrors]);

  const updateField = (name: keyof BriefValues, nextValue: string) => {
    setDraftValues((previous) => ({ ...previous, [name]: nextValue }));
  };

  const visibleValues = draftValues;
  const colorText = visibleValues.color_preference?.trim() ?? "";
  const pickerColor = HEX_COLOR_PATTERN.test(colorText) ? colorText : "#176b50";

  return (
    <>
      <form action={formAction} className="mt-8 space-y-8" noValidate>
        <input type="hidden" name="site_id" value={siteId} />
        <p className="text-sm text-[var(--muted)]">* Wajib diisi</p>

        <section>
          <h2 className="text-xl font-bold text-[var(--brand-dark)]">Informasi Bisnis</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClassName}>Nama Usaha</label>
              <input value={businessName} readOnly className={`${inputClassName} bg-[var(--background)] text-[var(--muted)]`} />
            </div>
            <Field label="Jenis Usaha *" name="business_type" value={visibleValues.business_type} error={state.fieldErrors?.business_type} required placeholder="Contoh: Warung bakso, toko pakaian, jasa catering" onChange={(value) => updateField("business_type", value)} />
            <Field label="Target Pelanggan *" name="target_market" value={visibleValues.target_market} error={state.fieldErrors?.target_market} required placeholder="Contoh: Keluarga, pekerja, pelajar, dan warga sekitar" onChange={(value) => updateField("target_market", value)} />
            <TextAreaField label="Produk / Layanan *" name="products_services" value={visibleValues.products_services} error={state.fieldErrors?.products_services} required placeholder="Contoh: Bakso sapi, mie bakso, minuman, dan makanan pendamping" className="md:col-span-2" onChange={(value) => updateField("products_services", value)} />
            <TextAreaField label="Keunggulan Usaha (opsional)" name="usp" value={visibleValues.usp} error={state.fieldErrors?.usp} placeholder="Contoh: Porsi melimpah, rasa khas, dan bahan pilihan" onChange={(value) => updateField("usp", value)} />
            <Field label="Nomor WhatsApp (opsional)" name="whatsapp" value={visibleValues.whatsapp} error={state.fieldErrors?.whatsapp} type="tel" placeholder="Contoh: 081234567890" onChange={(value) => updateField("whatsapp", value)} />
            <TextAreaField label="Alamat Usaha (opsional)" name="address" value={visibleValues.address} error={state.fieldErrors?.address} placeholder="Contoh: Jl. Raya Sukorejo No. 10, Kendal" className="md:col-span-2" onChange={(value) => updateField("address", value)} />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--brand-dark)]">Arah Website</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <TextAreaField label="Tujuan Website (opsional)" name="website_goal" value={visibleValues.website_goal} error={state.fieldErrors?.website_goal} placeholder="Contoh: Menampilkan menu dan mendorong pelanggan memesan lewat WhatsApp" className="md:col-span-2" onChange={(value) => updateField("website_goal", value)} />
            <div>
              <Field label="Aksi Utama *" name="primary_cta" value={visibleValues.primary_cta} error={state.fieldErrors?.primary_cta} required placeholder="Contoh: Pesan Sekarang, Hubungi Kami, Daftar Sekarang" onChange={(value) => updateField("primary_cta", value)} helperText="Tindakan utama yang Anda ingin pengunjung lakukan." />
            </div>
            <div>
              <label htmlFor="style_preference" className={labelClassName}>Gaya Website (opsional)</label>
              <select id="style_preference" name="style_preference" value={visibleValues.style_preference} onChange={(event) => updateField("style_preference", event.target.value)} className={inputClassName}>
                <option value="">Pilih salah satu</option>
                <option>Modern</option>
                <option>Minimalis</option>
                <option>Profesional</option>
                <option>Elegan</option>
                <option>Playful</option>
                <option>Natural</option>
                <option>Bold</option>
              </select>
              {state.fieldErrors?.style_preference && <FieldError message={state.fieldErrors.style_preference} />}
            </div>
            <div>
              <label htmlFor="color_preference" className={labelClassName}>Warna Website (opsional)</label>
              <div className="flex gap-3">
                <input type="color" value={pickerColor} onChange={(event) => {
                  const nextColor = event.target.value;
                  setDraftValues((previous) => ({ ...previous, color_preference: nextColor }));
                }} aria-label="Pilih warna utama" className="h-12 w-16 rounded-xl border border-[var(--line)] bg-white p-1" />
                <input id="color_preference" name="color_preference" type="text" value={visibleValues.color_preference} onChange={(event) => updateField("color_preference", event.target.value)} placeholder="Contoh: Hijau tua, krem, dan putih" maxLength={7} className={`${inputClassName} flex-1`} />
              </div>
              {state.fieldErrors?.color_preference && <FieldError message={state.fieldErrors.color_preference} />}
            </div>
            <div className="md:col-span-2">
              <TextAreaField label="Referensi Website (opsional)" name="reference_urls" value={visibleValues.reference_urls} error={state.fieldErrors?.reference_urls} placeholder="Contoh: https://contohwebsite.com" helperText="Masukkan website yang Anda sukai sebagai referensi tampilan." className="md:col-span-2" onChange={(value) => updateField("reference_urls", value)} />
            </div>
            <TextAreaField label="Catatan Tambahan (opsional)" name="notes" value={visibleValues.notes} error={state.fieldErrors?.notes} placeholder="Contoh: Fokus pada tampilan mobile dan tombol WhatsApp yang mudah ditemukan" className="md:col-span-2" onChange={(value) => updateField("notes", value)} />
            <div className="md:col-span-2">
              <fieldset>
                <legend className={labelClassName}>Status Sertifikat Halal *</legend>
                <p className="mb-3 text-sm text-[var(--muted)]">Pilih status yang paling sesuai dengan kondisi usaha Anda.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["CERTIFIED", "Sudah memiliki sertifikat halal"],
                    ["IN_PROCESS", "Sedang dalam proses sertifikasi halal"],
                    ["NOT_CERTIFIED", "Belum memiliki sertifikat halal"],
                    ["UNSURE", "Belum tahu / belum yakin"],
                    ["NOT_RELEVANT", "Tidak relevan untuk usaha ini"],
                  ].map(([value, label]) => (
                    <label key={value} className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--brand-dark)]">
                      <input
                        type="radio"
                        name="halal_status"
                        value={value}
                        checked={visibleValues.halal_status === value}
                        required
                        onChange={(event) => updateField("halal_status", event.target.value)}
                        className="mt-1"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {state.fieldErrors?.halal_status && <FieldError message={state.fieldErrors.halal_status} />}
            </div>
          </div>
        </section>

        {state.formError && <p role="alert" className="text-sm text-red-700">{state.formError}</p>}
        {state.success && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Brief berhasil disimpan.</p>}
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-6 py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-bold text-[var(--brand-dark)]">{currentContentVersion > 0 ? "Buat Versi Baru dengan AI" : "Buat Website dengan AI"}</p>
              <p className="text-sm text-[var(--muted)]">Perubahan brief disimpan sebelum permintaan dibuat.</p>
            </div>
            <button type="submit" formAction={generationAction} disabled={pending || generationPending} className="rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60">
              {generationPending ? "Membuat versi baru..." : currentContentVersion > 0 ? "Buat Versi Baru dengan AI" : "Buat Website dengan AI"}
            </button>
          </div>
          {generationState.formError && <p role="alert" className="mt-3 text-sm text-red-700">{generationState.formError}</p>}
          {generationState.success && (
            <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {generationState.message ?? "Permintaan pembuatan website berhasil masuk antrean."}
            </p>
          )}
        </div>
      </form>
    </>
  );
}

function Field({ label, name, value, error, required, type = "text", placeholder, helperText, onChange }: { label: string; name: string; value: string; error?: string; required?: boolean; type?: string; placeholder?: string; helperText?: string; onChange?: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={name} className={labelClassName}>{label}</label>
      {helperText && <p className="mb-2 text-xs text-[var(--muted)]">{helperText}</p>}
      <input id={name} name={name} type={type} value={value} required={required} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} className={inputClassName} />
      {error && <FieldError message={error} />}
    </div>
  );
}

function TextAreaField({ label, name, value, error, required, placeholder, className = "", helperText, onChange }: { label: string; name: string; value: string; error?: string; required?: boolean; placeholder?: string; className?: string; helperText?: string; onChange?: (value: string) => void }) {
  return (
    <div className={className}>
      <label htmlFor={name} className={labelClassName}>{label}</label>
      {helperText && <p className="mb-2 text-xs text-[var(--muted)]">{helperText}</p>}
      <textarea id={name} name={name} value={value} required={required} placeholder={placeholder} rows={4} onChange={(event) => onChange?.(event.target.value)} className={inputClassName} />
      {error && <FieldError message={error} />}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="mt-2 text-sm text-red-700">{message}</p>;
}
