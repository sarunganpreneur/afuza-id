import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

export async function updateSessionWithUser(
  request:
    NextRequest,
) {
  let response =
    NextResponse.next({
      request,
    });

  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return {
      response,

      user: null,

      supabase: null,
    };
  }

  const supabase =
    createServerClient(
      url,
      key,
      {
        cookies: {
          getAll() {
            return request.cookies
              .getAll();
          },

          setAll(
            cookiesToSet,
          ) {
            const sharedDomain =
              process.env
                .AUTH_COOKIE_DOMAIN
                ?.trim();

            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value,
                );
              },
            );

            response =
              NextResponse.next({
                request,
              });

            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                response.cookies.set(
                  name,
                  value,

                  sharedDomain
                    ? {
                        ...options,

                        domain:
                          sharedDomain,
                      }
                    : options,
                );
              },
            );
          },
        },
      },
    );

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  return {
    response,

    user,

    supabase,
  };
}

export async function updateSession(
  request:
    NextRequest,
) {
  const {
    response,
  } =
    await updateSessionWithUser(
      request,
    );

  return response;
}
