import { createHash } from "node:crypto";
import { z } from "zod";

export const ENGINEERING_TASK_TYPES = [
  "UI_UX_REDESIGN",
  "BUG_FIX",
  "FEATURE_IMPLEMENTATION",
  "REFACTOR",
  "CONFIGURATION",
  "INTEGRATION",
  "TESTING",
  "DOCUMENTATION",
  "SECURITY_REVIEW",
  "PERFORMANCE_OPTIMIZATION",
  "DEVOPS_CHANGE",
] as const;

export const ENGINEERING_RISKS = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export const ENGINEERING_PRIORITIES = [
  "P0",
  "P1",
  "P2",
  "P3",
] as const;

const JsonObjectSchema = z.record(
  z.string(),
  z.unknown(),
);

export const EngineeringProjectCreateSchema = z
  .object({
    project_key: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).default(""),
    repo_path: z
      .string()
      .trim()
      .regex(/^\/home\/afuzaid\/(?!.*\.\.).+$/),
    default_branch: z.string().trim().min(1).max(120).default("main"),
    staging_branch: z.string().trim().min(1).max(160).nullable().optional(),
    staging_service: z.string().trim().min(1).max(160).nullable().optional(),
    staging_health_url: z.string().trim().min(1).max(500).nullable().optional(),
    production_service: z.string().trim().min(1).max(160).nullable().optional(),
    production_health_url: z.string().trim().min(1).max(500).nullable().optional(),
    control_plane_project_key: z.string().trim().min(1).max(160).nullable().optional(),
    risk_profile: z.enum(ENGINEERING_RISKS).default("MEDIUM"),
    automation_enabled: z.boolean().default(true),
    visual_qa_enabled: z.boolean().default(false),
  })
  .strict();

export const EngineeringTaskCreateSchema = z
  .object({
    project_id: z.string().uuid(),
    external_key: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/),
    title: z.string().trim().min(1).max(240),
    objective: z.string().trim().min(1).max(5000),
    task_type: z.enum(ENGINEERING_TASK_TYPES),
    risk: z.enum(ENGINEERING_RISKS),
    priority: z.enum(ENGINEERING_PRIORITIES).default("P2"),
    max_attempts: z.number().int().min(1).max(10).default(3),
    requires_human_review: z.boolean().default(true),
    requires_production_approval: z.boolean().default(true),
    constraints: JsonObjectSchema.default({}),
    acceptance_criteria: z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(50),
  })
  .strict();

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [
          key,
          canonicalize(child),
        ]),
    );
  }

  return value;
}

export function stableEngineeringHash(
  value: unknown,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize(value),
      ),
    )
    .digest("hex");
}

export type EngineeringProjectCreateInput =
  z.infer<typeof EngineeringProjectCreateSchema>;

export type EngineeringTaskCreateInput =
  z.infer<typeof EngineeringTaskCreateSchema>;
