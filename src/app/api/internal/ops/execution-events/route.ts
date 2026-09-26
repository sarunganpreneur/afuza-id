import {
  NextRequest,
  NextResponse,
} from "next/server";

import { requireOpsApiAccess } from "@/lib/ops/api";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getLimit(
  request: NextRequest,
) {
  const raw =
    request.nextUrl.searchParams.get(
      "limit",
    );

  const parsed =
    Number.parseInt(
      raw ?? "100",
      10,
    );

  if (
    !Number.isFinite(parsed)
  ) {
    return 100;
  }

  return Math.min(
    Math.max(parsed, 1),
    200,
  );
}

export async function GET(
  request: NextRequest,
) {
  const gate =
    await requireOpsApiAccess();

  if (gate.response) {
    return gate.response;
  }

  const executionId =
    request.nextUrl.searchParams.get(
      "execution_id",
    );

  if (
    executionId &&
    !UUID_PATTERN.test(
      executionId,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "INVALID_EXECUTION_ID",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "SERVICE_ROLE_UNAVAILABLE",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  let query =
    supabase
      .from(
        "ops_execution_events",
      )
      .select(
        [
          "execution_id",
          "approval_id",
          "idempotency_key",
          "event_type",
          "actor_user_id",
          "previous_status",
          "new_status",
          "reason",
          "metadata",
          "created_at",
        ].join(","),
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .limit(
        getLimit(request),
      );

  if (executionId) {
    query =
      query.eq(
        "execution_id",
        executionId,
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    return NextResponse.json(
      {
        error:
          "OPS_EXECUTION_EVENTS_QUERY_FAILED",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      count:
        data?.length ?? 0,
      events:
        data ?? [],
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
