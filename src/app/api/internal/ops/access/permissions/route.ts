import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  requireOpsApiPermission,
} from "@/lib/ops/api";

import {
  OPS_PERMISSIONS,
  type OpsPermission,
} from "@/lib/ops/policy";

type PermissionMap =
  Record<
    OpsPermission,
    boolean
  >;

export async function GET() {
  const gate =
    await requireOpsApiPermission(
      "OPS_ACCESS",
    );

  if (gate.response) {
    return gate.response;
  }

  const supabase =
    await createClient();

  const checks =
    await Promise.all(
      OPS_PERMISSIONS.map(
        async (
          permission,
        ) => {
          const {
            data,
            error,
          } =
            await supabase.rpc(
              "has_ops_permission",
              {
                p_permission:
                  permission,
              },
            );

          return {
            permission,

            allowed:
              data === true,

            error,
          };
        },
      ),
    );

  const failed =
    checks.find(
      (result) =>
        result.error,
    );

  if (failed) {
    console.error(
      "OPS permission introspection failed",
      {
        permission:
          failed.permission,

        code:
          failed.error?.code,
      },
    );

    return NextResponse.json(
      {
        error:
          "AUTHORIZATION_UNAVAILABLE",
      },
      {
        status: 503,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const permissions =
    Object.fromEntries(
      checks.map(
        ({
          permission,
          allowed,
        }) => [
          permission,
          allowed,
        ],
      ),
    ) as PermissionMap;

  return NextResponse.json(
    {
      authorized: true,

      authorization_mode:
        gate.access?.mode ??
        null,

      user_id:
        gate.access?.userId ??
        null,

      email:
        gate.access?.email ??
        null,

      permissions,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
