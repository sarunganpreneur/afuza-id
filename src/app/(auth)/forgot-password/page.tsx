import Link from "next/link";
import ForgotPasswordForm from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-8 shadow-[0_20px_60px_rgba(22,34,29,0.08)]">
        <Link href="/" className="text-sm font-bold tracking-[0.18em] text-[var(--brand)]">AFUZA.ID</Link>
        <h1 className="mt-8 text-3xl font-bold text-[var(--brand-dark)]">Lupa Password</h1>
        <p className="mt-3 text-[var(--muted)]">Masukkan email Anda untuk menerima link reset password.</p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}