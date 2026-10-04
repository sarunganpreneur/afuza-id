import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import delivery from "./delivery-orchestrator.cjs";

const {
  authorizeAction,
  classifyChecks,
  discoverLanes,
  markdownReport,
  parseBacklogMarkdown,
  runDryRun,
  runIndependentLanes,
  selectNextTask,
  withCanonicalLock,
} = delivery;

const lane = {
  id: "chalwa.id",
  next_task_source: "docs/AX-06-BACKLOG.md",
};

function passingState(projectId = "chalwa.id") {
  return {
    schema_version: 1,
    project_id: projectId,
    task: "AX-06 milestone selection",
    status: "AWAITING_APPROVAL",
    approval_required: true,
    updated_at: "2026-10-04T00:00:00.000Z",
    last_commit: "a".repeat(40),
    test_result: "NOT_RUN",
    staging_status: "PASS",
    checks: {},
    blocker: "Approved milestone/backlog missing",
    next_action: "Approve AX-06 source",
    evidence_file: null,
  };
}

describe("delivery orchestrator", () => {
  it("discovers exactly the three authorized lanes", () => {
    expect(discoverLanes({ lanes: [lane, { id: "klodhost" }, { id: "marketing-agency" }] })).toHaveLength(3);
  });

  it("rejects invalid or extra project IDs", async () => {
    expect(() => discoverLanes({ lanes: [lane, { id: "klodhost" }, { id: "marketing-agency" }, { id: "unknown" }] })).toThrow(/exactly/);
    await expect(runDryRun([lane], "unknown", {})).rejects.toThrow(/Unknown delivery project/);
  });

  it("keeps task selection awaiting approval without both approved sources", () => {
    expect(selectNextTask(lane)).toMatchObject({ status: "AWAITING_APPROVAL", approval_required: true });
  });

  it("parses an approved Markdown backlog and selects only its declared task", () => {
    const backlog = parseBacklogMarkdown(`---\nproject_id: chalwa.id\napproval_id: AX06-001\ntasks:\n  - id: AX06-CHALWA-001\n    status: READY\n---\n\n# Approved AX-06 backlog\n`);
    expect(selectNextTask(lane, {
      authorization: { status: "APPROVED", decision_id: "AX06-001", approving_authority: "Portfolio owner" },
      backlog,
    })).toMatchObject({ status: "READY", task: "AX06-CHALWA-001", approval_required: false });
  });

  it("rejects an unstructured Markdown backlog", () => {
    expect(() => parseBacklogMarkdown("# AX-06 Backlog\nNo approved metadata."))
      .toThrow(/YAML front matter/);
  });

  it("blocks production actions", () => {
    expect(authorizeAction("production-change")).toMatchObject({ allowed: false, status: "BLOCKED" });
  });

  it.each(["real-provider", "real-payment", "outbound-message"])("blocks live action %s", (action) => {
    expect(authorizeAction(action)).toMatchObject({ allowed: false, status: "BLOCKED", approval_required: true });
  });

  it("marks failed health checks FAILED", () => {
    expect(classifyChecks({ health: { status: "FAIL", detail: "HTTP 503" } })).toBe("FAILED");
  });

  it("does not treat a missing approved milestone as a failed safety check", () => {
    expect(classifyChecks({ milestone: { status: "FAIL", detail: "approval missing" } })).toBe("AWAITING_APPROVAL");
  });

  it("serializes canonical human report rows", () => {
    const report = markdownReport({ updated_at: "2026-10-04T00:00:00.000Z", lanes: { "chalwa.id": passingState() } });
    expect(report).toContain("| Project | Task | Status | Last commit | Test result | Staging status | Blocker | Next action | Approval required |");
    expect(report).toContain("| chalwa.id | AX-06 milestone selection | AWAITING_APPROVAL |");
  });

  it("runs independent lanes concurrently and persists once", async () => {
    let active = 0;
    let peak = 0;
    let persistCalls = 0;
    const lanes = [lane, { id: "klodhost" }, { id: "marketing-agency" }];
    const results = await runIndependentLanes(lanes, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return item.id;
    }, async (values) => {
      persistCalls += 1;
      expect(values).toHaveLength(3);
    });
    expect(results).toHaveLength(3);
    expect(peak).toBe(3);
    expect(persistCalls).toBe(1);
  });

  it("prevents concurrent canonical writes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-lock-"));
    const lock = path.join(root, "canonical.lock");
    let release;
    const held = withCanonicalLock(lock, () => new Promise((resolve) => { release = resolve; }));
    await new Promise((resolve) => setImmediate(resolve));
    await expect(withCanonicalLock(lock, async () => undefined)).rejects.toThrow(/already in progress/);
    release();
    await held;
    fs.rmSync(root, { recursive: true, force: true });
  });
});
