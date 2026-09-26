import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOpsApiAccess } from "@/lib/ops/api";

type HealthStatus =
  | "ONLINE"
  | "CONFIGURED"
  | "NOT_CONFIGURED"
  | "DEGRADED"
  | "ERROR";

type ComponentHealth = {
  status: HealthStatus;
  detail?: string;
};

export async function GET() {
  const gate = await requireOpsApiAccess();

  if (gate.response) {
    return gate.response;
  }

  const startedAt = Date.now();

  const components: Record<string, ComponentHealth> = {
    afuza_core: {
      status: "ONLINE",
      detail: "Next.js runtime responding",
    },
    database: {
      status: "ERROR",
      detail: "Database check not completed",
    },
    openai: process.env.OPENAI_API_KEY
      ? {
          status: "CONFIGURED",
          detail: "OPENAI_API_KEY configured",
        }
      : {
          status: "NOT_CONFIGURED",
          detail: "OPENAI_API_KEY not configured",
        },

    // Integration runtime config does not exist yet in afuza.id.
    n8n: {
      status: "NOT_CONFIGURED",
      detail: "n8n runtime integration not configured in Afuza Core",
    },
    redis: {
      status: "NOT_CONFIGURED",
      detail: "Redis integration not configured",
    },
    google_drive: {
      status: "NOT_CONFIGURED",
      detail: "Google Drive integration not configured",
    },
    google_sheets: {
      status: "NOT_CONFIGURED",
      detail: "Google Sheets integration not configured",
    },
    whatsapp: {
      status: "NOT_CONFIGURED",
      detail: "WhatsApp delivery provider not configured",
    },
  };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("plans")
      .select("code")
      .limit(1);

    if (error) {
      components.database = {
        status: "ERROR",
        detail: "Supabase reachable check failed",
      };
    } else {
      components.database = {
        status: "ONLINE",
        detail: "Supabase database reachable",
      };
    }
  } catch {
    components.database = {
      status: "ERROR",
      detail: "Supabase database unreachable",
    };
  }

  const hasError = Object.values(components).some(
    (component) => component.status === "ERROR",
  );

  return NextResponse.json(
    {
      status: hasError ? "DEGRADED" : "ONLINE",
      checked_at: new Date().toISOString(),
      latency_ms: Date.now() - startedAt,
      components,
    },
    {
      status: hasError ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
