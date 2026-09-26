import Link from "next/link";
import { redirect } from "next/navigation";
import { getPostAuthPath } from "@/lib/auth/routing";
import { createClient } from "@/lib/supabase/server";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const hasError = params.error === "invalid_or_expired";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const destination = await getPostAuthPath(supabase, user);
    if (destination !== "/verify-email") redirect(destination);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-8 shadow-[0_20px_60px_rgba(22,34,29,0.08)]">
        <Link href="/" className="text-sm font-bold tracking-[0.18em] text-[var(--brand)]">AFUZA.ID</Link>
        <h1 className="mt-8 text-3xl font-bold text-[var(--brand-dark)]">Periksa Email Anda</h1>
        {hasError ? (
          <p className="mt-3 text-sm text-red-700">Link verifikasi tidak valid atau sudah kedaluwarsa. Silakan minta email verifikasi baru.</p>
        ) : (
          <p className="mt-3 text-[var(--muted)]">Kami telah mengirimkan link konfirmasi ke alamat email yang Anda daftarkan. Klik link tersebut untuk memverifikasi email dan melanjutkan.</p>
        )}
        <p className="mt-4 text-sm text-[var(--muted)]">Periksa juga folder Spam atau Promotions.</p>
        <Link href="/login" className="mt-8 block rounded-full border border-[var(--line)] px-5 py-3 text-center text-sm font-bold text-[var(--brand-dark)] hover:border-[var(--brand)]">Kembali ke halaman masuk</Link>
      </section>
    </main>
  );
}