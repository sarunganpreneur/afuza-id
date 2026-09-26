import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./reset-password-form";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-8 shadow-[0_20px_60px_rgba(22,34,29,0.08)]">
        <h1 className="text-3xl font-bold text-[var(--brand-dark)]">Buat Password Baru</h1>
        <p className="mt-3 text-[var(--muted)]">Gunakan password baru untuk mengamankan akun Anda.</p>
        <ResetPasswordForm />
      </section>
    </main>
  );
}