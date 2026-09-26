import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";
import { maskPhoneNumber } from "@/lib/otp/mask";
import { RequestOtpForm } from "./request-otp-form";

export default async function VerifyWhatsAppPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("phone_verified_at, account_status, whatsapp")
    .eq("id", user.id)
    .maybeSingle();

  if (!error && profile?.phone_verified_at && profile.account_status === "VERIFIED") redirect("/dashboard");

  if (error || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-8 shadow-[0_20px_60px_rgba(22,34,29,0.08)]">
          <h1 className="text-3xl font-bold text-[var(--brand-dark)]">Error</h1>
          <p className="mt-3 text-[var(--muted)]">Tidak dapat memuat data profil. Silakan coba lagi.</p>
          <form action={logout} className="mt-8">
            <button type="submit" className="w-full rounded-full border border-[var(--line)] px-5 py-3 text-sm font-bold text-[var(--brand-dark)] hover:border-[var(--brand)]">Keluar</button>
          </form>
        </section>
      </main>
    );
  }

  const maskedPhone = profile.whatsapp ? maskPhoneNumber(profile.whatsapp) : "N/A";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-8 shadow-[0_20px_60px_rgba(22,34,29,0.08)]">
        <h1 className="text-3xl font-bold text-[var(--brand-dark)]">Verifikasi WhatsApp</h1>
        <p className="mt-3 text-[var(--muted)]">Email Anda sudah terverifikasi.</p>

        <div className="mt-6 space-y-4">
          <div className="rounded-lg bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Nomor WhatsApp</p>
            <p className="mt-2 text-lg font-bold text-[var(--brand-dark)]">{maskedPhone}</p>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-amber-900">
              Pengiriman kode WhatsApp sedang belum tersedia.
            </p>
            <p className="text-sm text-amber-800">
              Verifikasi WhatsApp akan dapat dilanjutkan setelah layanan pengiriman kode diaktifkan.
            </p>
          </div>

          <RequestOtpForm maskedPhone={maskedPhone} />
        </div>

        <form action={logout} className="mt-6">
          <button type="submit" className="w-full rounded-full border border-[var(--line)] px-5 py-3 text-sm font-bold text-[var(--brand-dark)] hover:border-[var(--brand)]">
            Keluar
          </button>
        </form>
      </section>
    </main>
  );
}