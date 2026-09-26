"use client";

import { useActionState } from "react";
import { resetPassword, type ResetPasswordFormState } from "@/app/actions/auth";

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<ResetPasswordFormState, FormData>(resetPassword, {});

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Password Baru</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldErrors?.password && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.password}</p>}
      </div>
      <div>
        <label htmlFor="confirm_password" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Konfirmasi Password Baru</label>
        <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldErrors?.confirm_password && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.confirm_password}</p>}
      </div>
      {state.formError && <p role="alert" className="text-sm text-red-700">{state.formError}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Menyimpan..." : "Simpan Password Baru"}
      </button>
    </form>
  );
}