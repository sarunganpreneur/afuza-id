"use client";

import { useActionState } from "react";
import { createSite, type CreateSiteFormState } from "@/app/actions/sites";

const initialState: CreateSiteFormState = {};

export default function NewSiteForm() {
  const [state, formAction, pending] = useActionState<CreateSiteFormState, FormData>(createSite, initialState);

  return (
    <form action={formAction} className="mt-8 max-w-xl space-y-5" noValidate>
      <div>
        <label htmlFor="business_name" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Nama bisnis</label>
        <input id="business_name" name="business_name" type="text" autoComplete="organization" required maxLength={120} className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldErrors?.business_name && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.business_name}</p>}
      </div>
      <div>
        <label htmlFor="business_type" className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]">Jenis bisnis</label>
        <input id="business_type" name="business_type" type="text" required maxLength={120} placeholder="Contoh: Warung bakso, toko pakaian, jasa desain" className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]" />
        {state.fieldErrors?.business_type && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.business_type}</p>}
      </div>
      {state.formError && <p role="alert" className="text-sm text-red-700">{state.formError}</p>}
      <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Menyiapkan website..." : "Lanjutkan"}
      </button>
    </form>
  );
}
