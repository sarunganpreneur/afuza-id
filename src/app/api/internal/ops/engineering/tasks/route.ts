import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireOpsApiAccess,
  requireOpsApiPermission,
  requireOpsJsonMutation,
} from "@/lib/ops/api";
import {
  EngineeringTaskCreateSchema,
  stableEngineeringHash,
} from "@/lib/ops/engineering-domain";
import {
  getServiceRoleClient,
} from "@/lib/supabase/service-role";

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

export async function GET() {
  const gate = await requireOpsApiAccess();
  if (gate.response) return gate.response;

  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return noStore(
      { error: "SERVICE_ROLE_UNAVAILABLE" },
      503,
    );
  }

  const db = supabase as EngineeringDb;

  const { data, error, count } = await db
    .from("ops_engineering_tasks")
    .select(
      [
        "id",
        "project_id",
        "parent_task_id",
        "external_key",
        "title",
        "objective",
        "task_type",
        "risk",
        "status",
        "priority",
        "requested_by",
        "assigned_agent_key",
        "assigned_agent_version",
        "worktree_id",
        "approval_id",
        "execution_id",
        "max_attempts",
        "attempt_count",
        "requires_human_review",
        "requires_production_approval",
        "constraints",
        "acceptance_criteria",
        "result_summary",
        "failure_code",
        "failure_message",
        "created_at",
        "updated_at",
        "started_at",
        "finished_at",
      ].join(","),
      { count: "exact" },
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(250);

  if (error) {
    return noStore(
      { error: "ENGINEERING_TASKS_QUERY_FAILED" },
      500,
    );
  }

  return noStore({
    total: count ?? data?.length ?? 0,
    tasks: data ?? [],
  });
}

export async function POST(
  request: NextRequest,
) {
  const gate =
    await requireOpsApiPermission(
      "OPS_CONTROL",
    );

  if (gate.response) {
    return gate.response;
  }

  const mutationBlock =
    requireOpsJsonMutation(request);

  if (mutationBlock) {
    return mutationBlock;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return noStore(
      { error: "MALFORMED_JSON" },
      400,
    );
  }

  const parsed =
    EngineeringTaskCreateSchema.safeParse(
      raw,
    );

  if (!parsed.success) {
    return noStore(
      {
        error:
          "INVALID_ENGINEERING_TASK",
        issues:
          parsed.error.issues
            .slice(0, 20)
            .map((issue) => ({
              path:
                issue.path.join(".") ||
                "body",
              code: issue.code,
            })),
      },
      400,
    );
  }

  const input = parsed.data;
  const requestHash =
    stableEngineeringHash(input);

  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return noStore(
      { error: "SERVICE_ROLE_UNAVAILABLE" },
      503,
    );
  }

  const db = supabase as EngineeringDb;

  const { data, error } = await db.rpc(
    "ops_engineering_create_task",
    {
      p_project_id:
        input.project_id,
      p_external_key:
        input.external_key,
      p_request_hash:
        requestHash,
      p_title:
        input.title,
      p_objective:
        input.objective,
      p_task_type:
        input.task_type,
      p_risk:
        input.risk,
      p_priority:
        input.priority,
      p_requested_by:
        gate.access?.userId ?? null,
      p_max_attempts:
        input.max_attempts,
      p_requires_human_review:
        input.requires_human_review,
      p_requires_production_approval:
        input.requires_production_approval,
      p_constraints:
        input.constraints,
      p_acceptance_criteria:
        input.acceptance_criteria,
    },
  );

  if (error) {
    const message =
      typeof error.message === "string"
        ? error.message
        : "";

    if (
      message.includes(
        "ENGINEERING_TASK_IDEMPOTENCY_CONFLICT",
      )
    ) {
      return noStore(
        {
          error:
            "ENGINEERING_TASK_IDEMPOTENCY_CONFLICT",
        },
        409,
      );
    }

    if (
      message.includes(
        "ENGINEERING_PROJECT_NOT_FOUND",
      )
    ) {
      return noStore(
        {
          error:
            "ENGINEERING_PROJECT_NOT_FOUND",
        },
        404,
      );
    }

    return noStore(
      {
        error:
          "ENGINEERING_TASK_CREATE_FAILED",
      },
      500,
    );
  }

  const result =
    Array.isArray(data)
      ? data[0]
      : data;

  return noStore(
    {
      ok: true,
      task_id:
        result?.task_id ?? null,
      created_new:
        result?.created_new === true,
      execution_triggered: false,
      safety:
        "Engineering task persistence only. No runner, worktree, deployment, or external action was executed.",
    },
    result?.created_new === false
      ? 200
      : 201,
  );
}
