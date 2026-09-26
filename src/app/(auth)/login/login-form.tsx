"use client";

import Link from "next/link";
import {
  useActionState,
} from "react";

import {
  login,
  type LoginFormState,
} from "@/app/actions/auth";

export default function LoginForm(
  {
    returnTo,
  }: {
    returnTo?:
      string;
  },
) {
  const [
    state,
    formAction,
    pending,
  ] =
    useActionState<
      LoginFormState,
      FormData
    >(
      login,
      {},
    );

  return (
    <form
      action={formAction}
      className="mt-8 space-y-5"
      noValidate
    >
      {returnTo && (
        <input
          type="hidden"
          name="next"
          value={returnTo}
        />
      )}

      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]"
        >
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]"
        />

        {state.fieldErrors?.email && (
          <p className="mt-2 text-sm text-red-700">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-semibold text-[var(--brand-dark)]"
        >
          Password
        </label>

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-[var(--line)] px-4 py-3 outline-none focus:border-[var(--brand)]"
        />

        {state.fieldErrors?.password && (
          <p className="mt-2 text-sm text-red-700">
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      {state.formError && (
        <p
          role="alert"
          className="text-sm text-red-700"
        >
          {state.formError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? "Memproses..."
          : "Masuk"}
      </button>

      <div className="flex items-center justify-between gap-4 text-sm">
        <Link
          href="/forgot-password"
          className="font-semibold text-[var(--brand)]"
        >
          Lupa password?
        </Link>

        <Link
          href="/register"
          className="font-semibold text-[var(--brand)]"
        >
          Buat akun gratis
        </Link>
      </div>
    </form>
  );
}
