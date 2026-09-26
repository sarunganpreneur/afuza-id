import { NextResponse } from "next/server";
import { z } from "zod";

import { safeParseSiteContentV1, validateSiteContentV1Semantics } from "@/lib/site-content/validation";
import { SiteContentV1Schema, type SiteContentV1 } from "@/lib/site-content/schema";
import { AUTH_RESULT, authenticateWorkerRequest } from "@/lib/server/worker/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const MAX_CONTENT_BYTES = 1024 * 1024;
const CommitEnvelopeSchema = z
  .object({
    jobId: z.string().uuid(),
    content: SiteContentV1Schema,
  })
  .strict();

type DatabaseError = { code?: string; message?: string };

function jsonError(status: number, code: string, issues?: string[]) {
  return NextResponse.json(
    { ok: false, code, ...(issues && issues.length > 0 ? { issues: issues.slice(0, 20) } : {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function safeIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 20).map((issue) => `${issue.path.join(".") || "body"}: ${issue.code}`);
}

function databaseConflict(error: DatabaseError): boolean {
  const message = String(error.message ?? "").toLowerCase();
  return message.includes("generation job is not available") || message.includes("lifecycle conflict");
}

function databaseNotFound(error: DatabaseError): boolean {
  return error.code === "PGRST116";
}

export async function POST(request: Request) {
  const auth = authenticateWorkerRequest(request);
  if (auth.status === AUTH_RESULT.UNAUTHORIZED) return jsonError(401, "UNAUTHORIZED");
  if (auth.status === AUTH_RESULT.MISCONFIGURED) return jsonError(503, "WORKER_AUTH_UNAVAILABLE");

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_CONTENT_BYTES) return jsonError(400, "PAYLOAD_TOO_LARGE");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "MALFORMED_JSON");
  }

  const envelope = CommitEnvelopeSchema.safeParse(payload);
  if (!envelope.success) return jsonError(400, "INVALID_COMMIT_ENVELOPE", safeIssues(envelope.error));

  const contentResult = safeParseSiteContentV1(envelope.data.content);
  if (!contentResult.success) return jsonError(422, "INVALID_SITE_CONTENT", safeIssues(contentResult.error));

  const semantics = validateSiteContentV1Semantics(contentResult.data);
  if (!semantics.ok) return jsonError(422, "INVALID_SITE_CONTENT_SEMANTICS", semantics.errors);

  const supabase = await getServiceRoleClient();
  if (!supabase) return jsonError(503, "GENERATION_COMMIT_UNAVAILABLE");

  try {
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .select("id")
      .eq("id", envelope.data.jobId)
      .maybeSingle();

    if (jobError) {
      console.warn(JSON.stringify({ route: "/api/internal/generation/content/commit", operation: "lookup_job", database_error_code: "JOB_LOOKUP_ERROR", code: jobError.code }));
      return jsonError(500, "GENERATION_COMMIT_FAILED");
    }
    if (!job) return jsonError(404, "GENERATION_JOB_NOT_FOUND");

    const content = contentResult.data as SiteContentV1;
    const { data, error } = await supabase.rpc("commit_generated_site_version", {
      p_job_id: envelope.data.jobId,
      p_content: content,
      p_theme: content.theme,
      p_seo: content.seo,
      p_editor_state: { schemaVersion: "site_content_v1", source: "AI" },
    });

    if (error) {
      if (databaseNotFound(error)) return jsonError(404, "GENERATION_JOB_NOT_FOUND");
      if (databaseConflict(error)) return jsonError(409, "GENERATION_COMMIT_CONFLICT");
      console.warn(JSON.stringify({ route: "/api/internal/generation/content/commit", operation: "commit", database_error_code: "COMMIT_RPC_ERROR", code: error.code }));
      return jsonError(500, "GENERATION_COMMIT_FAILED");
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return jsonError(500, "GENERATION_COMMIT_FAILED");

    return NextResponse.json(
      {
        ok: true,
        jobId: envelope.data.jobId,
        versionNumber: row.version_number,
        siteContentId: row.site_content_id,
        siteVersionId: row.site_version_id,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.warn(JSON.stringify({ route: "/api/internal/generation/content/commit", operation: "commit", database_error_code: "COMMIT_RPC_EXCEPTION" }));
    return jsonError(500, "GENERATION_COMMIT_FAILED");
  }
}