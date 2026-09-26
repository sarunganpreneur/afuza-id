import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getServiceRoleClient } from "@/lib/supabase/service-role";

import {
  authenticateLeadEngineRequest,
  LEAD_ENGINE_AUTH_RESULT,
} from "../../../../../_lib/auth";
import { syncFirstContactApproval } from "../../../../../_lib/approval-store";
import { POST } from "./route";

vi.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: vi.fn(),
}));

vi.mock("../../../../../_lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../../../../../_lib/auth")>(
    "../../../../../_lib/auth",
  );
  return {
    ...actual,
    authenticateLeadEngineRequest: vi.fn(),
  };
});

vi.mock("../../../../../_lib/approval-store", () => ({
  syncFirstContactApproval: vi.fn(),
}));

const approvalId = "00000000-0000-4000-8000-000000000002";

function request(idempotencyKey?: string) {
  return new Request(
    `http://localhost/api/internal/lead-engine/v1/leads/EX-001/approval/${approvalId}/sync`,
    {
      method: "POST",
      headers: {
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
    },
  );
}

function context(leadId = "EX-001", id = approvalId) {
  return { params: Promise.resolve({ leadId, approvalId: id }) };
}

const lead = {
  lead_id: "EX-001",
  pipeline_stage: "APPROVED_FOR_CONTACT",
};

const approval = {
  id: approvalId,
  status: "APPROVED",
  action_type: "FIRST_CONTACT",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticateLeadEngineRequest).mockReturnValue(
    LEAD_ENGINE_AUTH_RESULT.AUTHORIZED,
  );
  vi.mocked(getServiceRoleClient).mockResolvedValue({} as never);
});

describe("WF-03 approval sync route", () => {
  it("rejects unauthorized internal requests", async () => {
    vi.mocked(authenticateLeadEngineRequest).mockReturnValue(
      LEAD_ENGINE_AUTH_RESULT.UNAUTHORIZED,
    );
    const response = await POST(request("sync-0001"), context());
    expect(response.status).toBe(401);
  });

  it("requires an idempotency key", async () => {
    const response = await POST(request(), context());
    expect(response.status).toBe(400);
  });

  it("rejects an invalid approval id", async () => {
    const response = await POST(request("sync-0001"), context("EX-001", "bad"));
    expect(response.status).toBe(400);
  });

  it("returns 404 when the approval is missing", async () => {
    vi.mocked(syncFirstContactApproval).mockResolvedValue({
      kind: "NOT_FOUND",
      resource: "APPROVAL",
    });
    const response = await POST(request("sync-0001"), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "APPROVAL_NOT_FOUND" });
  });

  it("rejects an approval linked to another lead", async () => {
    vi.mocked(syncFirstContactApproval).mockResolvedValue({
      kind: "APPROVAL_MISMATCH",
    });
    const response = await POST(request("sync-0001"), context());
    expect(response.status).toBe(409);
  });

  it("advances an approved lead to message drafting without execution", async () => {
    vi.mocked(syncFirstContactApproval).mockResolvedValue({
      kind: "SUCCESS",
      lead: lead as never,
      approval: approval as never,
      replayed: false,
      suppressed: false,
      changedFields: ["pipeline_stage"],
      previousStage: "QUALIFIED",
      nextAction: "DRAFT_MESSAGE",
    });

    const response = await POST(request("sync-0001"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      approval_status: "APPROVED",
      pipeline_stage: "APPROVED_FOR_CONTACT",
      next_action: "DRAFT_MESSAGE",
      execution_triggered: false,
    });
  });

  it("keeps a pending approval waiting", async () => {
    vi.mocked(syncFirstContactApproval).mockResolvedValue({
      kind: "SUCCESS",
      lead: { ...lead, pipeline_stage: "QUALIFIED" } as never,
      approval: { ...approval, status: "PENDING" } as never,
      replayed: false,
      suppressed: false,
      changedFields: [],
      previousStage: "QUALIFIED",
      nextAction: "WAIT_APPROVAL",
    });

    const response = await POST(request("sync-0001"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ next_action: "WAIT_APPROVAL" });
  });

  it("fails closed when an approved lead is suppressed", async () => {
    vi.mocked(syncFirstContactApproval).mockResolvedValue({
      kind: "SUCCESS",
      lead: { ...lead, pipeline_stage: "QUALIFIED" } as never,
      approval: approval as never,
      replayed: false,
      suppressed: true,
      changedFields: [],
      previousStage: "QUALIFIED",
      nextAction: "SUPPRESSED",
    });

    const response = await POST(request("sync-0001"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      suppressed: true,
      pipeline_stage: "QUALIFIED",
      next_action: "SUPPRESSED",
    });
  });

  it("fails closed when service role is unavailable", async () => {
    vi.mocked(getServiceRoleClient).mockResolvedValue(null);
    const response = await POST(request("sync-0001"), context());
    expect(response.status).toBe(503);
  });
});
