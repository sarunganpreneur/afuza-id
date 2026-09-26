import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createOpenAiMessageDraftProvider, MessageDraftProviderError } from "../../../_lib/message-draft-openai";
import {
  createStagingMockMessageDraftProvider,
  resolveMessageDraftProviderMode,
} from "../../../_lib/message-draft-mock";
import { createMessageDraft, DraftStoreError } from "../../../_lib/message-draft-store";

const RequestSchema = z.object({
  lead_id: z.string().trim().min(3).max(120),
  offer: z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1200),
    price_text: z.string().trim().min(1).max(100).nullable().optional(),
  }).strict(),
  cta: z.string().trim().min(1).max(160),
  template_code: z.enum(["WA-EDU-001", "WA-GEN-001"]).nullable().optional(),
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

function authorize(request: Request): "OK" | "UNAUTHORIZED" | "MISCONFIGURED" {
  const expected = process.env.LEAD_ENGINE_INTERNAL_TOKEN?.trim();
  if (!expected) return "MISCONFIGURED";
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return "UNAUTHORIZED";
  const supplied = header.slice(7).trim();
  return supplied && safeEqual(supplied, expected) ? "OK" : "UNAUTHORIZED";
}

export async function POST(request: Request) {
  const auth = authorize(request);
  if (auth === "MISCONFIGURED") {
    return json({ ok: false, code: "LEAD_ENGINE_AUTH_UNAVAILABLE" }, 503);
  }
  if (auth === "UNAUTHORIZED") {
    return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  }

  const idempotencyKey = (request.headers.get("idempotency-key") ?? "").trim();
  if (
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 194 ||
    !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
  ) {
    return json({ ok: false, code: "INVALID_IDEMPOTENCY_KEY" }, 400);
  }

  const workflowId =
    (request.headers.get("x-afuza-workflow-id") ?? "").trim() || "WF-04";

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, code: "MALFORMED_JSON" }, 400);
  }

  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({
      ok: false,
      code: "INVALID_DRAFT_REQUEST",
      issues: parsed.error.issues.slice(0, 20).map((i) => ({
        path: i.path.join(".") || "body",
        code: i.code,
      })),
    }, 400);
  }

  const providerSelection = resolveMessageDraftProviderMode({
    mode: process.env.MESSAGE_DRAFT_PROVIDER,
    mockEnabled: process.env.WF04_STAGING_MOCK_ENABLED,
    cwd: process.cwd(),
  });

  if (!providerSelection.ok) {
    return json({
      ok: false,
      code: providerSelection.code,
    }, 503);
  }

  try {
    const provider = providerSelection.mode === "mock"
      ? createStagingMockMessageDraftProvider()
      : createOpenAiMessageDraftProvider();

    const result = await createMessageDraft({
      ...parsed.data,
      idempotency_key: idempotencyKey,
      workflow_id: workflowId,
    }, provider);

    return json({
      ok: true,
      lead: {
        id: result.lead.id,
        lead_id: result.lead.lead_id,
        business_name: result.lead.business_name,
        score: result.lead.score,
        priority: result.lead.priority,
        pipeline_stage: result.lead.pipeline_stage,
      },
      message: result.message,
      message_id: result.message.id,
      status: result.message.status,
      replayed: result.replayed,
      suppressed: result.suppressed,
      next_action: result.nextAction,
      execution_triggered: result.executionTriggered,
      safety: "Draft persistence only. No external action was executed.",
    }, result.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof DraftStoreError) {
      return json({
        ok: false,
        code: error.code,
        ...(error.details ? { issues: error.details } : {}),
      }, error.status);
    }

    if (error instanceof MessageDraftProviderError) {
      return json({
        ok: false,
        code: error.code,
      }, error.status);
    }

    console.error("WF04_MESSAGE_DRAFT_FAILED", error);
    return json({ ok: false, code: "MESSAGE_DRAFT_FAILED" }, 500);
  }
}
