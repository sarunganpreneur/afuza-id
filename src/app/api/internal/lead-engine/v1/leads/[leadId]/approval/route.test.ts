import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getServiceRoleClient } from "@/lib/supabase/service-role";

import {
  authenticateLeadEngineRequest,
  LEAD_ENGINE_AUTH_RESULT,
} from "../../../_lib/auth";
import { createFirstContactApproval } from "../../../_lib/approval-store";
import { POST } from "./route";

vi.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: vi.fn(),
}));

vi.mock("../../../_lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../../../_lib/auth")>(
    "../../../_lib/auth",
  );
  return {
    ...actual,
    authenticateLeadEngineRequest: vi.fn(),
  };
});

vi.mock("../../../_lib/approval-store", () => ({
  createFirstContactApproval: vi.fn(),
}));

function request(idempotencyKey?: string) {
  return new Request(
    "http://localhost/api/internal/lead-engine/v1/leads/EX-001/approval",
    {
      method: "POST",
      headers: {
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
    },
  );
}

function context(leadId = "EX-001") {
  return { params: Promise.resolve({ leadId }) };
}

const lead = {
  lead_id: "EX-001",
  pipeline_stage: "QUALIFIED",
};

const approval = {
  id: "00000000-0000-4000-8000-000000000002",
  status: "PENDING",
  action_type: "FIRST_CONTACT",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticateLeadEngineRequest).mockReturnValue(
    LEAD_ENGINE_AUTH_RESULT.AUTHORIZED,
  );
  vi.mocked(getServiceRoleClient).mockResolvedValue({} as never);
});

describe("WF-03 approval create route", () => {
  it("rejects unauthorized internal requests", async () => {
    vi.mocked(authenticateLeadEngineRequest).mockReturnValue(
      LEAD_ENGINE_AUTH_RESULT.UNAUTHORIZED,
    );
    const response = await POST(request("approval-1"), context());
    expect(response.status).toBe(401);
  });

  it("requires an idempotency key", async () => {
    const response = await POST(request(), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("rejects an invalid lead id", async () => {
    const response = await POST(request("approval-1"), context(" "));
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown lead", async () => {
    vi.mocked(createFirstContactApproval).mockResolvedValue({ kind: "NOT_FOUND" });
    const response = await POST(request("approval-1"), context());
    expect(response.status).toBe(404);
  });

  it("fails closed when lead is not eligible", async () => {
    vi.mocked(createFirstContactApproval).mockResolvedValue({
      kind: "NOT_ELIGIBLE",
      blocker: "CONTACT_SUPPRESSED",
    });
    const response = await POST(request("approval-1"), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "APPROVAL_NOT_ELIGIBLE",
      blocker: "CONTACT_SUPPRESSED",
    });
  });

  it("creates a pending approval without execution", async () => {
    vi.mocked(createFirstContactApproval).mockResolvedValue({
      kind: "SUCCESS",
      lead: lead as never,
      approval: approval as never,
      createdNew: true,
      replayed: false,
      nextAction: "WAIT_APPROVAL",
    });

    const response = await POST(request("approval-1"), context());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      ok: true,
      approval_id: approval.id,
      status: "PENDING",
      created_new: true,
      replayed: false,
      pipeline_stage: "QUALIFIED",
      next_action: "WAIT_APPROVAL",
      execution_triggered: false,
    });
  });

  it("returns a safe approval replay", async () => {
    vi.mocked(createFirstContactApproval).mockResolvedValue({
      kind: "SUCCESS",
      lead: lead as never,
      approval: approval as never,
      createdNew: false,
      replayed: true,
      nextAction: "WAIT_APPROVAL",
    });

    const response = await POST(request("approval-1"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ replayed: true });
  });

  it("maps idempotency conflicts safely", async () => {
    vi.mocked(createFirstContactApproval).mockResolvedValue({
      kind: "IDEMPOTENCY_CONFLICT",
    });
    const response = await POST(request("approval-1"), context());
    expect(response.status).toBe(409);
  });

  it("fails closed when service role is unavailable", async () => {
    vi.mocked(getServiceRoleClient).mockResolvedValue(null);
    const response = await POST(request("approval-1"), context());
    expect(response.status).toBe(503);
  });
});
