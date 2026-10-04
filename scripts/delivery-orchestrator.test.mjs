import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import delivery from "./delivery-orchestrator.cjs";

const {
  authorizeAction,
  classifyChecks,
  discoverLanes,
  dryRunState,
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
    task: "CHW-06-01",
    status: "READY",
    approval_required: false,
    updated_at: "2026-10-04T00:00:00.000Z",
    last_commit: "a".repeat(40),
    test_result: "NOT_RUN",
    staging_status: "PASS",
    checks: {},
    blocker: null,
    next_action: "Task is eligible; dry-run did not execute source mutation or deployment.",
    evidence_file: null,
  };
}

describe("delivery orchestrator", () => {
  const authorization = {
    status: "APPROVED",
    decision_id: "AX-06",
    approving_authority: "Portfolio owner",
    authorized_project_ids: ["chalwa.id"],
  };
  const approvedBacklog = (tasks = [{ id: "CHW-06-01", status: "READY", dependencies: [] }]) => ({
    project_id: "chalwa.id",
    approval_id: "AX-06",
    status: "APPROVED",
    execution_mode: "autonomous_staging",
    source_of_truth: true,
    tasks,
  });

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

  it("selects READY when authorization and matching backlog are approved", () => {
    expect(selectNextTask(lane, { authorization, backlog: approvedBacklog() }))
      .toMatchObject({ status: "READY", task: "CHW-06-01", blocker: null, approval_required: false });
  });

  it("keeps missing authorization at AWAITING_APPROVAL", () => {
    expect(selectNextTask(lane, { backlog: approvedBacklog() }))
      .toMatchObject({ status: "AWAITING_APPROVAL", approval_required: true });
  });

  it("keeps an unapproved backlog at AWAITING_APPROVAL", () => {
    expect(selectNextTask(lane, { authorization, backlog: { ...approvedBacklog(), status: "DRAFT" } }))
      .toMatchObject({ status: "AWAITING_APPROVAL", approval_required: true });
  });

  it("awaits approval when the selected task triggers an approval boundary", () => {
    expect(selectNextTask(lane, {
      authorization,
      backlog: approvedBacklog([{ id: "CHW-06-01", status: "READY", dependencies: [], approval_boundary_triggered: true }]),
    })).toMatchObject({ status: "AWAITING_APPROVAL", task: "CHW-06-01", approval_required: true });
  });

  it("blocks tasks with unsatisfied dependencies and readies them when dependencies complete", () => {
    const tasks = [
      { id: "CHW-06-01", status: "PLANNED", dependencies: ["CHW-06-00"] },
      { id: "CHW-06-00", status: "BLOCKED", dependencies: [] },
    ];
    expect(selectNextTask(lane, { authorization, backlog: approvedBacklog(tasks) }))
      .toMatchObject({ status: "BLOCKED", task: "CHW-06-01", approval_required: false });
    tasks[1].status = "COMPLETED";
    expect(selectNextTask(lane, { authorization, backlog: approvedBacklog(tasks) }))
      .toMatchObject({ status: "READY", task: "CHW-06-01", approval_required: false });
  });

  it("parses an approved Markdown backlog and selects its declared task", () => {
    const backlog = parseBacklogMarkdown(`---\nproject_id: chalwa.id\napproval_id: AX-06\nstatus: APPROVED\nexecution_mode: autonomous_staging\nsource_of_truth: true\ntasks:\n  - id: AX06-CHALWA-001\n    status: READY\n---\n\n# Approved AX-06 backlog\n`);
    expect(selectNextTask(lane, {
      authorization,
      backlog,
    })).toMatchObject({ status: "READY", task: "AX06-CHALWA-001", approval_required: false });
  });

  it("requires a matching authorized project and approved source-of-truth backlog", () => {
    const authorization = { status: "APPROVED", decision_id: "AX-06", approving_authority: "Portfolio owner", authorized_project_ids: ["klodhost"] };
    const backlog = { project_id: "chalwa.id", approval_id: "AX-06", status: "APPROVED", execution_mode: "autonomous_staging", source_of_truth: true, tasks: [{ id: "CHW-06-01", status: "READY" }] };
    expect(selectNextTask(lane, { authorization, backlog }).status).toBe("AWAITING_APPROVAL");
    expect(selectNextTask(lane, { authorization: { ...authorization, authorized_project_ids: ["chalwa.id"] }, backlog: { ...backlog, source_of_truth: false } }).status).toBe("AWAITING_APPROVAL");
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
    expect(classifyChecks({ health: { status: "FAIL", detail: "HTTP 503" } }, { status: "READY" })).toBe("FAILED");
  });

  it("returns a READY dry-run result without executing task implementation", () => {
    const result = dryRunState({ status: "READY", task: "CHW-06-01", blocker: null }, {
      milestone: { status: "PASS", detail: "Approved backlog available" },
      health: { status: "PASS", detail: "HTTP 200" },
    });
    expect(result).toMatchObject({
      status: "READY",
      approval_required: false,
      blocker: null,
      implementation_result: "NOT_RUN",
    });
    expect(result.next_action).toMatch(/did not execute source mutation/);
  });

  it("keeps missing approval and failed safety checks distinct", () => {
    expect(classifyChecks({ milestone: { status: "FAIL", detail: "approval missing" } }, { status: "AWAITING_APPROVAL" }))
      .toBe("AWAITING_APPROVAL");
    expect(classifyChecks({ health: { status: "FAIL", detail: "HTTP 503" } }, { status: "AWAITING_APPROVAL" }))
      .toBe("FAILED");
  });

  it("serializes canonical human report rows", () => {
    const report = markdownReport({ updated_at: "2026-10-04T00:00:00.000Z", lanes: { "chalwa.id": passingState() } });
    expect(report).toContain("| Project | Task | Status | Last commit | Test result | Staging status | Blocker | Next action | Approval required |");
    expect(report).toContain("| chalwa.id | CHW-06-01 | READY |");
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
      return { project_id: item.id, status: "READY", approval_required: false };
    }, async (values) => {
      persistCalls += 1;
      expect(values.map((value) => value.status)).toEqual(["READY", "READY", "READY"]);
    });
    expect(results).toHaveLength(3);
    expect(results.map((result) => result.project_id)).toEqual(["chalwa.id", "klodhost", "marketing-agency"]);
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
