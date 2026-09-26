import { NextResponse } from "next/server";

import { requireOpsApiAccess } from "@/lib/ops/api";
import { getServiceRoleClient } from "@/lib/supabase/service-role";


type ExecutionRow = {
  id: string;
  approval_id: string;
  idempotency_key: string;
  action_type: string;
  risk: string;
  status: string;
  prepared_by: string | null;
  prepared_at: string;
  started_at: string | null;
  finished_at: string | null;
  executor_type: string | null;
  executor_reference: Record<string, unknown> | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  state_version: number;
  result_summary: Record<string, unknown> | null;
  failure_code: string | null;
  failure_message: string | null;
  updated_at: string;
};

const STATUSES = [
  "PREPARED",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export async function GET() {
  const gate = await requireOpsApiAccess();

  if (gate.response) {
    return gate.response;
  }

  const supabase = await getServiceRoleClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "SERVICE_ROLE_UNAVAILABLE" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // Local server-only escape for Execution Gate tables that are
  // newer than the current generated Supabase Database types.
  // This does not alter the shared client or expose service-role credentials.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const executionQuery = db
    .from("ops_executions")
    .select(
      [
        "id",
        "approval_id",
        "idempotency_key",
        "action_type",
        "risk",
        "status",
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
      {
        count: "exact",
      },
    )
    .order("prepared_at", {
      ascending: false,
    })
    .limit(100);

  const statusQueries = STATUSES.map(
    async (status) => {
      const { count, error } =
        await db
          .from("ops_executions")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("status", status);

      return {
        status,
        count: count ?? 0,
        error,
      };
    },
  );

  const [
    executionResult,
    ...statusResults
  ] = await Promise.all([
    executionQuery,
    ...statusQueries,
  ]);

  if (
    executionResult.error ||
    statusResults.some(
      (item) => item.error,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "OPS_EXECUTIONS_QUERY_FAILED",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const executions =
    (executionResult.data ?? []) as ExecutionRow[];

  const approvalIds = [
    ...new Set(
      executions
        .map(
          (execution: ExecutionRow) =>
            execution.approval_id,
        )
        .filter(
          (
            value: string,
          ): value is string =>
            typeof value === "string" &&
            value.length > 0,
        ),
    ),
  ];

  let approvals: Array<{
    id: string;
    title: string;
    status: string;
    action_type: string;
    risk: string;
    execution_enabled: boolean;
    created_at: string;
    decided_at: string | null;
  }> = [];

  if (approvalIds.length > 0) {
    const approvalResult =
      await db
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
            "execution_enabled",
            "created_at",
            "decided_at",
          ].join(","),
        )
        .in("id", approvalIds);

    if (approvalResult.error) {
      return NextResponse.json(
        {
          error:
            "OPS_EXECUTION_APPROVAL_QUERY_FAILED",
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    approvals =
      approvalResult.data ?? [];
  }

  const approvalById =
    new Map(
      approvals.map(
        (approval) => [
          approval.id,
          approval,
        ],
      ),
    );

  const pulse: Record<
    string,
    number
  > = {};

  for (
    const item
    of statusResults
  ) {
    pulse[item.status] =
      item.count;
  }

  return NextResponse.json(
    {
      total:
        executionResult.count ??
        executions.length,

      pulse,

      executions:
        executions.map(
          (execution: ExecutionRow) => ({
            ...execution,

            approval:
              approvalById.get(
                execution.approval_id,
              ) ?? null,
          }),
        ),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
