import { createClient } from "@/lib/supabase/server";

import {
  isOpsBreakGlassEnabled,
  isOpsEmailAllowed,
  type OpsPermission,
} from "@/lib/ops/policy";

export type OpsAccessMode =
  | "RBAC"
  | "BREAK_GLASS";

export type OpsAccessResult =
  | {
      ok: true;

      userId: string;

      email: string;

      permission:
        OpsPermission;

      mode:
        OpsAccessMode;
    }
  | {
      ok: false;

      reason:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "AUTHORIZATION_UNAVAILABLE";

      permission:
        OpsPermission;
    };

export async function getOpsAccess(
  permission:
    OpsPermission =
      "OPS_ACCESS",
): Promise<OpsAccessResult> {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user?.email
  ) {
    return {
      ok: false,

      reason:
        "UNAUTHENTICATED",

      permission,
    };
  }

  const email =
    user.email
      .trim()
      .toLowerCase();

  /*
   * RBAC is authoritative.
   *
   * This RPC evaluates:
   *   user → active role
   *        → permission
   *
   * and also rejects disabled profiles.
   */
  const {
    data:
      permissionAllowed,

    error:
      permissionError,
  } =
    await supabase.rpc(
      "has_ops_permission",
      {
        p_permission:
          permission,
      },
    );

  if (
    !permissionError &&
    permissionAllowed === true
  ) {
    return {
      ok: true,

      userId:
        user.id,

      email,

      permission,

      mode:
        "RBAC",
    };
  }

  /*
   * Transitional owner recovery path.
   *
   * This is intentionally checked
   * AFTER RBAC.
   */
  if (
    isOpsBreakGlassEnabled() &&
    isOpsEmailAllowed(email)
  ) {
    console.warn(
      "OPS BREAK-GLASS ACCESS USED",
      {
        userId: user.id,
        permission,
      },
    );

    return {
      ok: true,

      userId:
        user.id,

      email,

      permission,

      mode:
        "BREAK_GLASS",
    };
  }

  /*
   * If RBAC could not be evaluated,
   * fail closed for ordinary users.
   */
  if (permissionError) {
    console.error(
      "OPS authorization unavailable",
      {
        permission,

        code:
          permissionError.code,
      },
    );

    return {
      ok: false,

      reason:
        "AUTHORIZATION_UNAVAILABLE",

      permission,
    };
  }

  return {
    ok: false,

    reason:
      "FORBIDDEN",

    permission,
  };
}
