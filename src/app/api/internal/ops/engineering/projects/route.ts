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
  EngineeringProjectCreateSchema,
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
  const { data, error } = await db
    .from("ops_engineering_projects")
    .select(
      [
        "id",
        "project_key",
        "name",
        "description",
        "repo_path",
        "default_branch",
        "staging_branch",
        "staging_service",
        "staging_health_url",
        "production_service",
        "production_health_url",
        "control_plane_project_key",
        "risk_profile",
        "automation_enabled",
        "visual_qa_enabled",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(250);

  if (error) {
    return noStore(
      { error: "ENGINEERING_PROJECTS_QUERY_FAILED" },
      500,
    );
  }

  return noStore({
    count: data?.length ?? 0,
    projects: data ?? [],
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
    EngineeringProjectCreateSchema.safeParse(
      raw,
    );

  if (!parsed.success) {
    return noStore(
      {
        error:
          "INVALID_ENGINEERING_PROJECT",
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

  const supabase =
    await getServiceRoleClient();

  if (!supabase) {
    return noStore(
      { error: "SERVICE_ROLE_UNAVAILABLE" },
      503,
    );
  }

  const input = parsed.data;
  const db = supabase as EngineeringDb;

  const { data, error } = await db.rpc(
    "ops_engineering_register_project",
    {
      p_project_key: input.project_key,
      p_name: input.name,
      p_description: input.description,
      p_repo_path: input.repo_path,
      p_default_branch:
        input.default_branch,
      p_staging_branch:
        input.staging_branch ?? null,
      p_staging_service:
        input.staging_service ?? null,
      p_staging_health_url:
        input.staging_health_url ?? null,
      p_production_service:
        input.production_service ?? null,
      p_production_health_url:
        input.production_health_url ?? null,
      p_control_plane_project_key:
        input.control_plane_project_key ??
        null,
      p_risk_profile:
        input.risk_profile,
      p_automation_enabled:
        input.automation_enabled,
      p_visual_qa_enabled:
        input.visual_qa_enabled,
    },
  );

  if (error) {
    const message =
      typeof error.message === "string"
        ? error.message
        : "";

    return noStore(
      {
        error: message.includes(
          "ENGINEERING_PROJECT_CONFLICT",
        )
          ? "ENGINEERING_PROJECT_CONFLICT"
          : "ENGINEERING_PROJECT_CREATE_FAILED",
      },
      message.includes(
        "ENGINEERING_PROJECT_CONFLICT",
      )
        ? 409
        : 500,
    );
  }

  return noStore(
    {
      ok: true,
      project_id: data,
      execution_triggered: false,
      safety:
        "Engineering project registry mutation only. No runner or deployment action was executed.",
    },
    201,
  );
}
