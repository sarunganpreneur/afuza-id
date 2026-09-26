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


export async function GET(
  _request: NextRequest,

  context: {
    params: Promise<{
      executionId: string;
    }>;
  },
) {
  const gate =
    await requireOpsApiAccess();

  if (gate.response) {
    return gate.response;
  }


  const {
    executionId,
  } = await context.params;


  if (
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
          "Cache-Control":
            "no-store",
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
          "Cache-Control":
            "no-store",
        },
      },
    );
  }


  /*
   * Execution Gate tables were added after the current
   * generated Supabase Database type snapshot.
   *
   * Keep this escape LOCAL to the V1C internal API.
   * Do not alter the shared service-role client.
   */
  // Local server-only escape for Execution Gate tables that are
  // newer than the current generated Supabase Database types.
  // This does not alter the shared client or expose service-role credentials.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;


  const {
    data: execution,
    error: executionError,
  } =
    await db
      .from(
        "ops_executions",
      )
      .select(
        [
          "id",
          "approval_id",
          "idempotency_key",
          "action_type",
          "risk",
          "status",
          "approval_snapshot",
          "execution_input",
          "prepared_by",
          "prepared_at",
          "started_at",
          "finished_at",
          "executor_type",
          "executor_reference",
          "lease_expires_at",
          "last_heartbeat_at",
          "state_version",
          "result_summary",
          "failure_code",
          "failure_message",
          "updated_at",
        ].join(","),
      )
      .eq(
        "id",
        executionId,
      )
      .maybeSingle();


  if (executionError) {
    return NextResponse.json(
      {
        error:
          "OPS_EXECUTION_QUERY_FAILED",
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }


  if (!execution) {
    return NextResponse.json(
      {
        error:
          "EXECUTION_NOT_FOUND",
      },
      {
        status: 404,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }


  const [
    approvalResult,
    eventsResult,
  ] =
    await Promise.all([
      db
        .from(
          "ops_approval_requests",
        )
        .select(
          [
            "id",
            "title",
            "status",
            "action_type",
            "risk",
            "requester",
            "requester_type",
            "requester_id",
            "execution_reference",
            "execution_enabled",
            "created_at",
            "decided_at",
            "decided_by",
            "decision_reason",
          ].join(","),
        )
        .eq(
          "id",
          execution.approval_id,
        )
        .maybeSingle(),

      db
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
        .eq(
          "execution_id",
          executionId,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        ),
    ]);


  if (
    approvalResult.error ||
    eventsResult.error
  ) {
    return NextResponse.json(
      {
        error:
          "OPS_EXECUTION_DETAIL_QUERY_FAILED",
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }


  return NextResponse.json(
    {
      execution,

      approval:
        approvalResult.data ??
        null,

      events:
        eventsResult.data ??
        [],
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
