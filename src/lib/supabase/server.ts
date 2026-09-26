import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase public environment variables are not configured.");
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          const sharedDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();

          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(
              name,
              value,
              sharedDomain
                ? { ...options, domain: sharedDomain }
                : options,
            );
          });
        } catch {}
      },
    },
  });
}