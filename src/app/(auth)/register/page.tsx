import Link from "next/link";
import RegisterForm from "./register-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-8 shadow-[0_20px_60px_rgba(22,34,29,0.08)]">
        <Link href="/" className="text-sm font-bold tracking-[0.18em] text-[var(--brand)]">AFUZA.ID</Link>
        <h1 className="mt-8 text-3xl font-bold text-[var(--brand-dark)]">Buat akun</h1>
        <p className="mt-3 text-[var(--muted)]">Mulai buat website bisnis Anda dengan AI.</p>
        <RegisterForm />
      </section>
    </main>
  );
}