import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireOpsApiPermission,
  requireOpsJsonMutation,
} from "@/lib/ops/api";

import {
  getServiceRoleClient,
} from "@/lib/supabase/service-role";

const VALID_ROLES =
  new Set([
    "OWNER",
    "APPROVER",
    "OPERATOR",
    "OBSERVER",
  ]);

type TeamRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  account_status: string;
  role_code: string;
  assigned_at: string;
};

type MatrixRow = {
  role_code: string;
  role_name: string;
  permission_code:
    | string
    | null;
};

type AccessEventRow = {
  id: number;
  event_type: string;
  target_user_id: string;
  target_email: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  previous_role: string | null;
  new_role: string | null;
  reason: string | null;
  metadata:
    Record<string, unknown>;
  created_at: string;
};

function jsonError(
  error: string,
  status: number,
  detail?: string,
) {
  return NextResponse.json(
    {
      error,
      ...(detail
        ? { detail }
        : {}),
    },
    {
      status,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

async function readTeamData() {
  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return {
      error:
        jsonError(
          "SERVICE_ROLE_UNAVAILABLE",
          503,
        ),
      data: null,
    };
  }

  const [
    teamResult,
    matrixResult,
    eventsResult,
  ] =
    await Promise.all([
      supabase.rpc(
        "ops_list_team",
      ),

      supabase.rpc(
        "ops_role_matrix",
      ),

      supabase.rpc(
        "ops_list_access_events",
        {
          p_limit: 150,
        },
      ),
    ]);

  if (teamResult.error) {
    return {
      error:
        jsonError(
          "OPS_TEAM_READ_FAILED",
          500,
          teamResult.error.message,
        ),
      data: null,
    };
  }

  if (matrixResult.error) {
    return {
      error:
        jsonError(
          "OPS_ROLE_MATRIX_READ_FAILED",
          500,
          matrixResult.error.message,
        ),
      data: null,
    };
  }

  if (eventsResult.error) {
    return {
      error:
        jsonError(
          "OPS_ACCESS_AUDIT_READ_FAILED",
          500,
          eventsResult.error.message,
        ),
      data: null,
    };
  }

  const team =
    (
      teamResult.data ??
      []
    ) as unknown as TeamRow[];

  const matrixRows =
    (
      matrixResult.data ??
      []
    ) as unknown as MatrixRow[];

  const events =
    (
      eventsResult.data ??
      []
    ) as unknown as AccessEventRow[];

  const roleMap =
    new Map<
      string,
      {
        code: string;
        name: string;
        permissions: string[];
      }
    >();

  for (
    const row
    of matrixRows
  ) {
    const existing =
      roleMap.get(
        row.role_code,
      ) ?? {
        code:
          row.role_code,
        name:
          row.role_name,
        permissions:
          [],
      };

    if (
      row.permission_code &&
      !existing.permissions.includes(
        row.permission_code,
      )
    ) {
      existing.permissions.push(
        row.permission_code,
      );
    }

    roleMap.set(
      row.role_code,
      existing,
    );
  }

  const roles =
    Array.from(
      roleMap.values(),
    ).map(
      (role) => ({
        ...role,

        permissions:
          role.permissions.sort(),
      }),
    );

  return {
    error: null,

    data: {
      summary: {
        active_members:
          team.length,

        active_owners:
          team.filter(
            (member) =>
              member.role_code ===
              "OWNER",
          ).length,

        roles:
          roles.length,

        audit_events:
          events.length,
      },

      team,
      roles,
      events,
    },
  };
}


export async function GET() {
  const gate =
    await requireOpsApiPermission(
      "OPS_ADMIN",
    );

  if (gate.response) {
    return gate.response;
  }

  const result =
    await readTeamData();

  if (result.error) {
    return result.error;
  }

  return NextResponse.json(
    result.data,
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}


export async function POST(
  request:
    NextRequest,
) {
  const gate =
    await requireOpsApiPermission(
      "OPS_ADMIN",
    );

  if (gate.response) {
    return gate.response;
  }

  const mutationError =
    requireOpsJsonMutation(
      request,
    );

  if (mutationError) {
    return mutationError;
  }

  const actor =
    gate.access;

  if (!actor?.userId) {
    return jsonError(
      "OPS_IDENTITY_UNAVAILABLE",
      401,
    );
  }

  const body =
    await request
      .json()
      .catch(
        () => null,
      );

  if (
    !body ||
    typeof body !==
      "object"
  ) {
    return jsonError(
      "INVALID_REQUEST",
      400,
    );
  }

  const action =
    typeof body.action ===
    "string"
      ? body.action
          .trim()
          .toUpperCase()
      : "";

  const reason =
    typeof body.reason ===
    "string"
      ? body.reason
          .trim()
          .slice(
            0,
            500,
          )
      : "";

  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return jsonError(
      "SERVICE_ROLE_UNAVAILABLE",
      503,
    );
  }


  if (
    action ===
    "ASSIGN_ROLE"
  ) {
    const email =
      typeof body.email ===
      "string"
        ? body.email
            .trim()
            .toLowerCase()
        : "";

    const roleCode =
      typeof body.role_code ===
      "string"
        ? body.role_code
            .trim()
            .toUpperCase()
        : "";

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email,
      ) ||
      email.length > 254
    ) {
      return jsonError(
        "INVALID_EMAIL",
        400,
      );
    }

    if (
      !VALID_ROLES.has(
        roleCode,
      )
    ) {
      return jsonError(
        "INVALID_OPS_ROLE",
        400,
      );
    }

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "ops_assign_role_by_email",
        {
          p_email:
            email,

          p_role_code:
            roleCode,

          p_actor_user_id:
            actor.userId,

          p_reason:
            reason ||
            null,
        },
      );

    if (error) {
      const message =
        error.message ??
        "";

      if (
        message.includes(
          "LAST_OWNER_PROTECTED",
        )
      ) {
        return jsonError(
          "LAST_OWNER_PROTECTED",
          409,
        );
      }

      if (
        message.includes(
          "Afuza user not found",
        )
      ) {
        return jsonError(
          "USER_NOT_FOUND",
          404,
        );
      }

      if (
        message.includes(
          "Disabled account",
        )
      ) {
        return jsonError(
          "USER_DISABLED",
          409,
        );
      }

      if (
        message.includes(
          "Unknown Ops role",
        )
      ) {
        return jsonError(
          "INVALID_OPS_ROLE",
          400,
        );
      }

      if (
        message.includes(
          "OPS_ADMIN permission required",
        )
      ) {
        return jsonError(
          "FORBIDDEN",
          403,
        );
      }

      return jsonError(
        "OPS_ROLE_ASSIGN_FAILED",
        500,
        message,
      );
    }

    const mutation =
      Array.isArray(data)
        ? data[0]
        : data;

    const snapshot =
      await readTeamData();

    if (snapshot.error) {
      return snapshot.error;
    }

    return NextResponse.json(
      {
        action:
          "ASSIGN_ROLE",

        mutation:
          mutation ??
          null,

        ...snapshot.data,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }


  if (
    action ===
    "REVOKE"
  ) {
    const targetUserId =
      typeof body.user_id ===
      "string"
        ? body.user_id
            .trim()
        : "";

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        targetUserId,
      )
    ) {
      return jsonError(
        "INVALID_USER_ID",
        400,
      );
    }

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "ops_revoke_role",
        {
          p_target_user_id:
            targetUserId,

          p_actor_user_id:
            actor.userId,

          p_reason:
            reason ||
            null,
        },
      );

    if (error) {
      const message =
        error.message ??
        "";

      if (
        message.includes(
          "LAST_OWNER_PROTECTED",
        )
      ) {
        return jsonError(
          "LAST_OWNER_PROTECTED",
          409,
        );
      }

      if (
        message.includes(
          "OPS_ADMIN permission required",
        )
      ) {
        return jsonError(
          "FORBIDDEN",
          403,
        );
      }

      return jsonError(
        "OPS_ROLE_REVOKE_FAILED",
        500,
        message,
      );
    }

    const mutation =
      Array.isArray(data)
        ? data[0]
        : data;

    const snapshot =
      await readTeamData();

    if (snapshot.error) {
      return snapshot.error;
    }

    return NextResponse.json(
      {
        action:
          "REVOKE",

        mutation:
          mutation ??
          null,

        ...snapshot.data,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }


  return jsonError(
    "INVALID_TEAM_ACTION",
    400,
  );
}
