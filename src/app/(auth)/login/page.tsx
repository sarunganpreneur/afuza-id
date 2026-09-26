import Link from "next/link";
import {
  redirect,
} from "next/navigation";

import LoginForm from "./login-form";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  getPostAuthPath,
} from "@/lib/auth/routing";

import {
  normalizePostAuthReturnTo,
} from "@/lib/auth/return-to";

type LoginSearchParams = {
  reset?:
    | string
    | string[];

  next?:
    | string
    | string[];
};

function firstParam(
  value:
    | string
    | string[]
    | undefined,
) {
  return Array.isArray(value)
    ? value[0]
    : value;
}

export default async function LoginPage(
  {
    searchParams,
  }: {
    searchParams:
      Promise<LoginSearchParams>;
  },
) {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  const params =
    await searchParams;

  const reset =
    firstParam(
      params.reset,
    );

  const returnTo =
    normalizePostAuthReturnTo(
      firstParam(
        params.next,
      ),
    );

  /*
   * Already authenticated:
   * preserve all existing eligibility
   * checks before honoring return-to.
   */
  if (user) {
    const destination =
      await getPostAuthPath(
        supabase,
        user,
      );

    if (
      destination ===
      "/dashboard"
    ) {
      redirect(
        returnTo ??
          "/dashboard",
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-8 shadow-[0_20px_60px_rgba(22,34,29,0.08)]">
        <Link
          href="/"
          className="text-sm font-bold tracking-[0.18em] text-[var(--brand)]"
        >
          AFUZA.ID
        </Link>

        <h1 className="mt-8 text-3xl font-bold text-[var(--brand-dark)]">
          Masuk
        </h1>

        {reset ===
          "success" && (
          <p className="mt-3 text-sm text-[var(--brand)]">
            Password berhasil diperbarui. Silakan masuk menggunakan password baru.
          </p>
        )}

        <p className="mt-3 text-[var(--muted)]">
          Masuk untuk melanjutkan ke ruang kerja Anda.
        </p>

        <LoginForm
          returnTo={
            returnTo ??
            undefined
          }
        />
      </section>
    </main>
  );
}
