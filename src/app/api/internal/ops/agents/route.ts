import { NextResponse } from "next/server";
import { requireOpsApiAccess } from "@/lib/ops/api";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  AGENTS_REGISTRY,
  type AgentRegistryEntry,
} from "@/lib/ops/agents-registry";

export async function GET() {
  const gate = await requireOpsApiAccess();
  if (gate.response) return gate.response;

  const supabase = await getServiceRoleClient();

  let latestGenerationActivity: string | null = null;
  let generationDegraded = false;

  if (supabase) {
    const { data, error } = await supabase
      .from("generation_jobs")
      .select("created_at, status")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      generationDegraded = true;
    } else if (data) {
      latestGenerationActivity = data.created_at;
      generationDegraded =
        data.status === "ERROR" || data.status === "FAILED";
    }
  } else {
    generationDegraded = true;
  }

  const agents = AGENTS_REGISTRY.map((agent): AgentRegistryEntry & {
    last_activity_at: string | null;
    control_locked: boolean;
  } => {
    if (
      agent.id === "website-generation-agent" ||
      agent.id === "visual-generation-agent"
    ) {
      return {
        ...agent,
        status: generationDegraded ? "DEGRADED" : agent.status,
        health: generationDegraded ? "DEGRADED" : agent.health,
        last_activity_at: latestGenerationActivity,
        control_locked: true,
      };
    }

    if (agent.id === "system-observer") {
      return {
        ...agent,
        last_activity_at: new Date().toISOString(),
        control_locked: true,
      };
    }

    return {
      ...agent,
      last_activity_at: null,
      control_locked: true,
    };
  });

  return NextResponse.json(
    {
      summary: {
        total: agents.length,
        active: agents.filter((agent) => agent.status === "ACTIVE").length,
        degraded: agents.filter((agent) => agent.status === "DEGRADED").length,
        paused: agents.filter((agent) => agent.status === "PAUSED").length,
        planned: agents.filter((agent) => agent.status === "PLANNED").length,
      },
      agents,
      controls: {
        execution_controls_enabled: false,
        note: "Agent execution controls are intentionally locked in Agents Registry V1.",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
