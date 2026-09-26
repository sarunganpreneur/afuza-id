import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";
import { getIneligiblePath, isDashboardEligible, type AccountProfile } from "@/lib/auth/eligibility";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("email_verified_at, phone_verified_at, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) redirect("/verify-email");

  const accountProfile = profile as AccountProfile;
  if (!isDashboardEligible(accountProfile)) redirect(getIneligiblePath(accountProfile));

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--line)] bg-white px-6 py-5 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/dashboard" className="font-bold tracking-[0.18em] text-[var(--brand-dark)]">AFUZA.ID</Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--muted)]">Ruang kerja Anda</span>
            <form action={logout}>
              <button type="submit" className="text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)]">Keluar</button>
            </form>
          </div>
        </div>
      </header>
      <div className="dashboard-body mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 sm:flex-row sm:px-10">
        <nav className="flex gap-3 overflow-x-auto sm:w-48 sm:flex-col">
          <Link href="/dashboard" className="whitespace-nowrap rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[var(--brand-dark)] shadow-sm">Website Saya</Link>
          <span className="whitespace-nowrap px-4 py-3 text-sm text-[var(--muted)]">Paket</span>
          <span className="whitespace-nowrap px-4 py-3 text-sm text-[var(--muted)]">Referral</span>
          <span className="whitespace-nowrap px-4 py-3 text-sm text-[var(--muted)]">Rekomendasi</span>
          <span className="whitespace-nowrap px-4 py-3 text-sm text-[var(--muted)]">Akun</span>
        </nav>
        <div className="dashboard-content min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}