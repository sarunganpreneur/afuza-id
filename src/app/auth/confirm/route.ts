import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPostAuthPath } from "@/lib/auth/routing";

function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: path },
  });
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!tokenHash || (type !== "email" && type !== "recovery")) {
    return redirectTo(type === "recovery" ? "/forgot-password?error=invalid_or_expired" : "/verify-email?error=invalid_or_expired");
  }

  const cookieStore = await cookies();
  const response = redirectTo(type === "recovery" ? "/reset-password" : "/verify-email");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return redirectTo("/verify-email?error=invalid_or_expired");
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        const sharedDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(
            name,
            value,
            sharedDomain
              ? { ...options, domain: sharedDomain }
              : options,
          );
        });
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error) {
    return redirectTo(type === "recovery" ? "/forgot-password?error=invalid_or_expired" : "/verify-email?error=invalid_or_expired");
  }

  if (type === "email") {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) response.headers.set("Location", await getPostAuthPath(supabase, user));
  }

  return response;
}