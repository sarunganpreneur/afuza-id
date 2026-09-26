"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordFormState } from "@/app/actions/auth";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordFormState, FormData>(requestPasswordReset, {});

  if (state.submitted) {
    return (
      <div className="mt-8 space-y-3 text-[var(--muted)]">
        <h2 className="text-xl font-bold text-[var(--brand-dark)]">Cek Email Anda</h2>
        <p>Jika email yang Anda masukkan terdaftar di Afuza.id, kami telah mengirimkan link untuk mengatur ulang password.</p>
        <p>Silakan cek Inbox, Spam, atau folder Promosi.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldError && <p className="mt-2 text-sm text-red-700">{state.fieldError}</p>}
      </div>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Mengirim..." : "Kirim Link Reset Password"}
      </button>
      <Link href="/login" className="block text-center text-sm font-semibold text-[var(--brand)]">Kembali ke halaman masuk</Link>
    </form>
  );
}