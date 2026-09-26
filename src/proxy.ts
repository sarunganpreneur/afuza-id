import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  updateSessionWithUser,
} from "@/lib/supabase/middleware";

import {
  isOpsBreakGlassEnabled,
  isOpsEmailAllowed,
} from "@/lib/ops/policy";

function copySessionCookies(
  source:
    NextResponse,

  target:
    NextResponse,
) {
  source.cookies
    .getAll()
    .forEach(
      (cookie) => {
        target.cookies.set(
          cookie,
        );
      },
    );

  return target;
}

export async function proxy(
  request:
    NextRequest,
) {
  const {
    response:
      sessionResponse,

    user,

    supabase,
  } =
    await updateSessionWithUser(
      request,
    );

  const hostname =
    (
      request.headers.get(
        "host",
      ) ?? ""
    )
      .split(":")[0]
      .toLowerCase();

  const {
    pathname,
  } =
    request.nextUrl;

  const isOpsHost =
    hostname ===
    "ops.afuza.id";

  const isDirectOpsPath =
    pathname === "/ops" ||
    pathname.startsWith(
      "/ops/",
    );

  const isOpsPageRequest =
    (
      isOpsHost ||
      isDirectOpsPath
    ) &&
    !pathname.startsWith(
      "/_next",
    ) &&
    !pathname.startsWith(
      "/api",
    ) &&
    pathname !==
      "/favicon.ico";

  /*
   * Route-level OPS RBAC gate.
   */
  if (isOpsPageRequest) {
    if (!user?.email) {
      const loginUrl =
        new URL(
          "https://afuza.id/login",
        );

      /*
       * Canonical external Ops destination.
       *
       * If the request used the direct
       * afuza.id/ops/* route, return the
       * user to the equivalent
       * ops.afuza.id/* route.
       */
      const returnTo =
        new URL(
          "https://ops.afuza.id",
        );

      const externalPath =
        isOpsHost
          ? pathname
          : pathname === "/ops"
            ? "/"
            : pathname.startsWith(
                "/ops/",
              )
              ? pathname.slice(4)
              : "/";

      returnTo.pathname =
        externalPath;

      returnTo.search =
        request.nextUrl.search;

      loginUrl.searchParams.set(
        "next",
        returnTo.toString(),
      );

      const response =
        NextResponse.redirect(
          loginUrl,
        );

      return copySessionCookies(
        sessionResponse,
        response,
      );
    }

    const email =
      user.email
        .trim()
        .toLowerCase();

    const breakGlassAllowed =
      isOpsBreakGlassEnabled() &&
      isOpsEmailAllowed(
        email,
      );

    let rbacAllowed =
      false;

    let rbacUnavailable =
      false;

    if (!supabase) {
      rbacUnavailable =
        true;
    } else {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          "has_ops_permission",
          {
            p_permission:
              "OPS_ACCESS",
          },
        );

      if (
        !error &&
        data === true
      ) {
        rbacAllowed =
          true;
      } else if (error) {
        rbacUnavailable =
          true;

        console.error(
          "OPS proxy authorization unavailable",
          {
            code:
              error.code,
          },
        );
      }
    }

    /*
     * RBAC has priority.
     *
     * BREAK_GLASS is only a
     * transitional recovery path.
     */
    if (
      !rbacAllowed &&
      !breakGlassAllowed
    ) {
      const response =
        new NextResponse(
          rbacUnavailable
            ? "OPS authorization unavailable."
            : "Forbidden",
          {
            status:
              rbacUnavailable
                ? 503
                : 403,

            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );

      return copySessionCookies(
        sessionResponse,
        response,
      );
    }
  }

  /*
   * ops.afuza.id is still the same
   * Next.js application.
   *
   * Rewrite external Ops paths into
   * /ops internally.
   */
  if (
    isOpsHost &&
    !pathname.startsWith(
      "/_next",
    ) &&
    !pathname.startsWith(
      "/api",
    ) &&
    !pathname.startsWith(
      "/ops",
    ) &&
    pathname !==
      "/favicon.ico"
  ) {
    const url =
      request.nextUrl.clone();

    /*
     * Local Next.js listener is HTTP,
     * not TLS.
     */
    url.protocol =
      "http:";

    url.hostname =
      "127.0.0.1";

    url.port =
      "4100";

    url.pathname =
      pathname === "/"
        ? "/ops"
        : `/ops${pathname}`;

    const rewriteResponse =
      NextResponse.rewrite(
        url,
      );

    sessionResponse.cookies
      .getAll()
      .forEach(
        (cookie) => {
          rewriteResponse
            .cookies
            .set(cookie);
        },
      );

    return rewriteResponse;
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
