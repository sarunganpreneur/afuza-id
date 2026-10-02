import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

interface ProjectState {
  status: string;
  active_workstream: string | null;
  current_task: string | null;
  approvals_required: string[];
  blockers: string[];
  quality_gates: Record<string, string>;
}

interface RequirementSet {
  requirements: unknown[];
}

interface TaskGraph {
  tasks: Array<{ id: string; state: string }>;
}

interface ControlApi {
  approvalRequirementsFor: (
    task: { permission_level: string; approval_requirements: string[] },
    permissions: { levels: Array<{ id: string; autonomous: boolean }> },
  ) => string[];
  loadContext: () => {
    permissions: { levels: Array<{ id: string; autonomous: boolean }> };
    requirements: RequirementSet;
    state: ProjectState;
    taskGraph: TaskGraph;
  };
  readinessFailures: (state: ProjectState, requirements: RequirementSet, taskGraph: TaskGraph) => string[];
  stagingSmokeDisposition: (staging: { available: boolean; service?: string; internal_endpoint?: string; health_path?: string }, requested: boolean) => string;
  stagingTargetsAllowed: (staging: { internal_endpoint: string; public_endpoint?: string | null }) => boolean;
  taskEligibility: (
    task: { permission_level: string; approval_requirements: string[]; dependencies: string[] },
    graph: TaskGraph,
    permissions: { levels: Array<{ id: string; autonomous: boolean }> },
  ) => { eligible: boolean; reason: string };
}

const require = createRequire(import.meta.url);
const control = require("../../scripts/afuza.cjs") as ControlApi;
afterEach(() => {
  vi.restoreAllMocks();
});

describe("afuza project control", () => {
  it("loads the declared project contract without fabricated requirements", () => {
    const context = control.loadContext();
    expect(context.requirements.requirements).toHaveLength(0);
    expect(context.taskGraph.tasks).toHaveLength(0);
    expect(context.state.active_workstream).toBe("AX-01");
    expect(["EXECUTION_FOUNDATION_COMPLETE", "BLOCKED"]).toContain(context.state.status);
  });

  it("rejects READY_FOR_HUMAN_TEST without compiled, verified work", () => {
    const context = control.loadContext();
    const readyState = {
      ...context.state,
      status: "READY_FOR_HUMAN_TEST",
      quality_gates: Object.fromEntries(Object.keys(context.state.quality_gates).map((gate) => [gate, "NOT_RUN"])),
    };
    const failures = control.readinessFailures(readyState, context.requirements, context.taskGraph);
    expect(failures).toContain("requirements have not been compiled");
    expect(failures).toContain("task graph is empty");
    expect(failures).toContain("staging_smoke has not passed");
  });

  it("accepts human-test readiness only when every gate and criterion has evidence", () => {
    const context = control.loadContext();
    const requirements = {
      requirements: [{
        implementation_status: "VERIFIED",
        acceptance_criteria: ["health route returns ok"],
        verification_evidence: [{
          acceptance_criterion: "health route returns ok",
          method: "staging smoke",
          result: "PASS",
          evidence: "Staging health endpoint returned status=ok",
        }],
      }],
    };
    const taskGraph = { tasks: [{ id: "AX-01", state: "DONE" }] };
    const state = {
      ...context.state,
      status: "READY_FOR_HUMAN_TEST",
      current_task: null,
      completed_tasks: 1,
      total_tasks: 1,
      approvals_required: [],
      blockers: [],
      quality_gates: Object.fromEntries(Object.keys(context.state.quality_gates).map((gate) => [gate, "PASS"])),
    };
    expect(control.readinessFailures(state, requirements, taskGraph)).toEqual([]);
  });

  it("holds a task until dependencies are done and permission is autonomous", () => {
    const context = control.loadContext();
    const task = { permission_level: "L1", approval_requirements: [], dependencies: ["AX-01A"] };
    const waiting = control.taskEligibility(task, { tasks: [{ id: "AX-01A", state: "PLANNED" }] }, context.permissions);
    expect(waiting.eligible).toBe(false);
    expect(waiting.reason).toContain("AX-01A");

    const approval = control.taskEligibility(
      { permission_level: "L5", approval_requirements: ["L5"], dependencies: [] },
      { tasks: [] },
      context.permissions,
    );
    expect(approval.eligible).toBe(false);
    expect(approval.reason).toContain("human approval");
    expect(control.approvalRequirementsFor(
      { permission_level: "L5", approval_requirements: [] },
      context.permissions,
    )).toEqual(["L5"]);
  });

  it("distinguishes requested and unconfigured staging-smoke skips", () => {
    expect(control.stagingSmokeDisposition({ available: true, service: "afuza-id-staging.service", internal_endpoint: "http://127.0.0.1:4101", health_path: "/api/health" }, false)).toBe("SKIPPED_NOT_REQUESTED");
    expect(control.stagingSmokeDisposition({ available: false }, true)).toBe("SKIPPED_NOT_CONFIGURED");
  });

  it("refuses production hosts as staging targets", () => {
    expect(control.stagingTargetsAllowed({ internal_endpoint: "https://afuza.id" })).toBe(false);
    expect(control.stagingTargetsAllowed({ internal_endpoint: "http://127.0.0.1:4101", public_endpoint: "https://afuza.id" })).toBe(false);
    expect(control.stagingTargetsAllowed({ internal_endpoint: "http://127.0.0.1:4101", public_endpoint: null })).toBe(true);
  });
});
