import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireOpsApiAccess,
} from "@/lib/ops/api";
import {
  getServiceRoleClient,
} from "@/lib/supabase/service-role";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Server-only escape while generated Supabase types lag this additive schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EngineeringDb = any;

function noStore(
  body: unknown,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      taskId: string;
    }>;
  },
) {
  const gate = await requireOpsApiAccess();
  if (gate.response) return gate.response;

  const { taskId } =
    await context.params;

  if (!UUID_PATTERN.test(taskId)) {
    return noStore(
      {
        error:
          "INVALID_ENGINEERING_TASK_ID",
      },
      400,
    );
  }

  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return noStore(
      { error: "SERVICE_ROLE_UNAVAILABLE" },
      503,
    );
  }

  const db = supabase as EngineeringDb;

  const { data, error } = await db
    .from("ops_engineering_task_events")
    .select(
      [
        "id",
        "task_id",
        "event_type",
        "actor_type",
        "actor_reference",
        "from_status",
        "to_status",
        "payload",
        "idempotency_key",
        "created_at",
      ].join(","),
    )
    .eq("task_id", taskId)
    .order("created_at", {
      ascending: true,
    })
    .limit(1000);

  if (error) {
    return noStore(
      {
        error:
          "ENGINEERING_TASK_EVENTS_QUERY_FAILED",
      },
      500,
    );
  }

  return noStore({
    count: data?.length ?? 0,
    events: data ?? [],
  });
}
