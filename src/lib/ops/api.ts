import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getOpsAccess,
} from "@/lib/ops/access";

import {
  getOpsAllowedOrigins,
  type OpsPermission,
} from "@/lib/ops/policy";

export async function requireOpsApiPermission(
  permission:
    OpsPermission,
) {
  const access =
    await getOpsAccess(
      permission,
    );

  if (access.ok) {
    return {
      access,

      response: null,
    };
  }

  const status =
    access.reason ===
    "UNAUTHENTICATED"
      ? 401

      : access.reason ===
          "FORBIDDEN"
        ? 403

        : 503;

  return {
    access: null,

    response:
      NextResponse.json(
        {
          error:
            access.reason,

          required_permission:
            permission,
        },
        {
          status,

          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      ),
  };
}

/*
 * Backward-compatible shorthand.
 *
 * Every existing read-only Ops API
 * automatically becomes RBAC-protected
 * by OPS_ACCESS.
 */
export async function requireOpsApiAccess() {
  return requireOpsApiPermission(
    "OPS_ACCESS",
  );
}

export function requireOpsJsonMutation(
  request:
    NextRequest,
) {
  const contentType =
    (
      request.headers.get(
        "content-type",
      ) ?? ""
    ).toLowerCase();

  if (
    !contentType.startsWith(
      "application/json",
    )
  ) {
    return NextResponse.json(
      {
        error:
          "UNSUPPORTED_MEDIA_TYPE",
      },
      {
        status: 415,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const origin =
    request.headers
      .get("origin")
      ?.trim()
      .toLowerCase() ??
    "";

  const allowedOrigins =
    getOpsAllowedOrigins();

  if (
    !origin ||
    !allowedOrigins.includes(
      origin,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "INVALID_ORIGIN",
      },
      {
        status: 403,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const fetchSite =
    request.headers
      .get("sec-fetch-site")
      ?.trim()
      .toLowerCase();

  if (
    fetchSite &&
    fetchSite !==
      "same-origin"
  ) {
    return NextResponse.json(
      {
        error:
          "CROSS_SITE_REQUEST_BLOCKED",
      },
      {
        status: 403,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  return null;
}
