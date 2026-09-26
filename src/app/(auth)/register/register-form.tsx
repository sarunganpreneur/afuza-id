"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register, type RegisterFormState } from "@/app/actions/auth";

const initialState: RegisterFormState = {};

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      <div>
        <label htmlFor="full_name" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Nama Lengkap</label>
        <input id="full_name" name="full_name" type="text" autoComplete="name" required className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldErrors?.full_name && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.full_name}</p>}
      </div>
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldErrors?.email && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.email}</p>}
      </div>
      <div>
        <label htmlFor="whatsapp" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Nomor WhatsApp</label>
        <input id="whatsapp" name="whatsapp" type="tel" autoComplete="tel" placeholder="08xxxxxxxxxx" required className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldErrors?.whatsapp && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.whatsapp}</p>}
      </div>
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldErrors?.password && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.password}</p>}
      </div>
      <div>
        <label htmlFor="confirm_password" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Konfirmasi Password</label>
        <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldErrors?.confirm_password && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.confirm_password}</p>}
      </div>
      {state.formError && <p role="alert" className="text-sm text-red-700">{state.formError}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Membuat akun..." : "Buat Akun Gratis"}
      </button>
      <p className="text-center text-sm text-[var(--muted)]">Sudah punya akun? <Link href="/login" className="font-bold text-[var(--brand)]">Masuk</Link></p>
    </form>
  );
}