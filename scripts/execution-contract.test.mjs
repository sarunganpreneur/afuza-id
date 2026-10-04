import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import Ajv from "ajv";
import execution from "./execution-contract.cjs";
import delivery from "./delivery-orchestrator.cjs";

const root = path.resolve(import.meta.dirname, "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, ".afuzactl/delivery/execution-contract.json"), "utf8"));
const lane = { id: "chalwa.id", repository: "/tmp/chalwa", staging_url: "https://chalwa.example", health_url: "https://chalwa.example/health", ready_url: "https://chalwa.example/ready", required_mode_markers: ["staging only"], forbidden_live_markers: ["real payment enabled"] };
const authorization = { approval_id: "AX-06", decision_id: "AX-06", status: "APPROVED", approving_authority: "owner", authorized_project_ids: ["chalwa.id"], authorization_constraints: { production_untouched: true } };
const task = {
  id: "CHW-06-01",
  title: "Product catalog foundation",
  objective: "Establish validated product and variant records.",
  status: "READY",
  dependencies: [],
  acceptance_criteria: ["Fields validated", "States explicit", "Invalid input rejected"],
  verification_gates: ["lint", "typecheck", "test", "build", "staging-health", "staging-ready", "catalog-api-check"],
  autonomous_actions_allowed: ["source-edit", "tests", "build", "staging-deploy", "focused-feature-commit", "normal-feature-push"],
  approval_boundaries: ["production-publish", "real-payment"],
};
const backlog = { project_id: "chalwa.id", approval_id: "AX-06", status: "APPROVED", execution_mode: "autonomous_staging", source_of_truth: true, tasks: [task] };
const descriptor = { ...contract.tasks[task.id], generic_quality_gates: contract.generic_quality_gates, forbidden_paths: contract.forbidden_paths };
const sourceSha = "a".repeat(40);
const laneContract = { ...contract, remote_urls: { "chalwa.id": "git@github-afuza-account:sarunganpreneur/chalwa.git" } };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function spec(overrides = {}) {
  return execution.createExecutionSpec({ lane, authorization, backlog, task, descriptor, sourceBranch: contract.source_branches["chalwa.id"], startingSha: sourceSha, executionId: "exec-test", ...overrides });
}

function gitRunner({ dirty = "", branch = contract.source_branches["chalwa.id"], localSha = sourceSha, remoteSha = sourceSha, origin = laneContract.remote_urls["chalwa.id"], remoteStatus = 0, taskRemote = "" } = {}) {
  return (_command, args) => {
    const gitIndex = args.indexOf("git");
    const gitArgs = args.slice(gitIndex + 1);
    const cwdIndex = gitArgs.indexOf("-C");
    const command = gitArgs.slice(cwdIndex + 2);
    if (command[0] === "status") return { status: 0, stdout: dirty, stderr: "" };
    if (command[0] === "branch") return { status: 0, stdout: `${branch}\n`, stderr: "" };
    if (command[0] === "rev-parse") return { status: 0, stdout: `${localSha}\n`, stderr: "" };
    if (command[0] === "remote") return { status: 0, stdout: `${origin}\n`, stderr: "" };
    if (command[0] === "ls-remote") return { status: remoteStatus, stdout: command.at(-1)?.includes("ax06/") ? taskRemote : (remoteSha ? `${remoteSha}\trefs/heads/${contract.source_branches["chalwa.id"]}\n` : ""), stderr: "" };
    if (command[0] === "show-ref") return { status: 1, stdout: "", stderr: "" };
    return { status: 1, stdout: "", stderr: "unexpected git command" };
  };
}

describe("AX-06 execution contract", () => {
  it("constructs a schema-valid bounded task spec", () => {
    const taskSpec = spec();
    const schema = JSON.parse(fs.readFileSync(path.join(root, ".afuzactl/delivery/schemas/execution-spec.schema.json"), "utf8"));
    expect(new Ajv({ allErrors: true, schemaId: "auto" }).validate(schema, taskSpec)).toBe(true);
    expect(taskSpec).toMatchObject({
      project_id: "chalwa.id",
      approval_id: "AX-06",
      task_id: "CHW-06-01",
      source_branch: "feature/ax06-backlog-chalwa",
      task_branch: "ax06/chalwa/CHW-06-01",
      starting_sha: sourceSha,
      production_forbidden: true,
      staging_validation: { deployment_enabled: false },
    });
  });

  it("validates source SHA against the remote source branch", () => {
    expect(execution.inspectSourceRepository(lane, contract.source_branches["chalwa.id"], laneContract, gitRunner()).checks.source_sha_matches_remote).toBe(true);
  });

  it("rejects remote source SHA divergence and unreachable remotes", () => {
    const divergence = execution.inspectSourceRepository(lane, contract.source_branches["chalwa.id"], laneContract, gitRunner({ remoteSha: "b".repeat(40) }));
    expect(divergence.checks.source_sha_matches_remote).toBe(false);
    const unavailable = execution.inspectSourceRepository(lane, contract.source_branches["chalwa.id"], laneContract, gitRunner({ remoteStatus: 128 }));
    expect(unavailable.checks.origin_reachable).toBe(false);
  });

  it("blocks dirty or unexpected source checkouts", () => {
    const dirty = execution.inspectSourceRepository(lane, contract.source_branches["chalwa.id"], laneContract, gitRunner({ dirty: " M src/app.ts\n" }));
    expect(dirty.checks.clean).toBe(false);
    const wrongBranch = execution.inspectSourceRepository(lane, contract.source_branches["chalwa.id"], laneContract, gitRunner({ branch: "main" }));
    expect(wrongBranch.checks.source_branch_checked_out).toBe(false);
  });

  it("rejects collisions with an existing deterministic task branch or worktree", () => {
    const taskBranch = execution.taskBranchName("chalwa.id", "CHW-06-01");
    const taskWorkspace = { taskBranch, workspacePath: "/tmp/nonexistent-ax06-task-worktree" };
    const clear = execution.inspectSourceRepository(lane, contract.source_branches["chalwa.id"], laneContract, gitRunner(), taskWorkspace);
    expect(clear.checks.task_branch_available).toBe(true);
    expect(clear.checks.task_worktree_available).toBe(true);
    const collision = execution.inspectSourceRepository(lane, contract.source_branches["chalwa.id"], laneContract, gitRunner({ taskRemote: `${"b".repeat(40)}\trefs/heads/${taskBranch}\n` }), taskWorkspace);
    expect(collision.checks.task_branch_available).toBe(false);
  });

  it("uses deterministic isolated branch and worktree names", () => {
    expect(execution.taskBranchName("chalwa.id", "CHW-06-01")).toBe("ax06/chalwa/CHW-06-01");
    expect(execution.worktreePath("klodhost", "KLO-06-01")).toBe("/home/afuzaid/engineering/worktrees/ax06-execution/klodhost/KLO-06-01");
  });

  it("permits only allowed paths and rejects forbidden paths and traversal", () => {
    const taskSpec = spec();
    expect(execution.pathAllowed("src/catalog/model.ts", taskSpec.allowed_paths, taskSpec.forbidden_paths)).toBe(true);
    expect(execution.pathAllowed("src/other.ts", taskSpec.allowed_paths, taskSpec.forbidden_paths)).toBe(false);
    expect(execution.pathAllowed("src/catalog/.env.local", taskSpec.allowed_paths, taskSpec.forbidden_paths)).toBe(false);
    expect(execution.pathAllowed("../afuza-id/.env", taskSpec.allowed_paths, taskSpec.forbidden_paths)).toBe(false);
    expect(execution.enforcePathScope(["src/catalog/model.ts", "src/index.ts"], taskSpec.allowed_paths, taskSpec.forbidden_paths)).toEqual(["src/index.ts"]);
  });

  it("blocks acceptance criteria without gate mappings", () => {
    const invalid = spec();
    invalid.acceptance_gate_map.pop();
    expect(execution.validateExecutionSpec(invalid)).toContain("UNMAPPED_ACCEPTANCE_GATE");
  });

  it("requires executable definitions for every descriptive verification gate", () => {
    const invalid = spec();
    delete invalid.verification_gate_map["catalog-api-check"];
    expect(execution.validateExecutionSpec(invalid)).toContain("UNMAPPED_VERIFICATION_GATE:catalog-api-check");
    for (const type of ["command", "file_exists", "file_contains", "test_name", "route_exists", "api_contract", "schema_assertion", "git_diff_check"]) {
      expect(execution.ALLOWED_GATE_TYPES.has(type)).toBe(true);
    }
  });

  it("maps all required generic quality gates", () => {
    const taskSpec = spec();
    expect(taskSpec.generic_quality_gates).toEqual(["lint", "typecheck", "test", "build", "git_diff_check"]);
    expect(execution.validateExecutionSpec(taskSpec)).toEqual([]);
  });

  it("executes safe file and schema gate types", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ax06-gate-"));
    fs.mkdirSync(path.join(temp, "src"));
    fs.writeFileSync(path.join(temp, "src/value.json"), '{"state":"draft"}\n');
    expect((await execution.executeGate(temp, "exists", { type: "file_exists", file: "src/value.json" })).status).toBe("PASS");
    expect((await execution.executeGate(temp, "contains", { type: "file_contains", file: "src/value.json", value: "draft" })).status).toBe("PASS");
    expect((await execution.executeGate(temp, "schema", { type: "schema_assertion", file: "src/value.json", schema: { type: "object", required: ["state"], properties: { state: { const: "draft" } } } })).status).toBe("PASS");
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it("executes only registered quality commands and named tests without a shell", async () => {
    const calls = [];
    const runner = (command, args, options) => {
      calls.push({ command, args, shell: options.shell });
      return { status: 0, stdout: "ok", stderr: "" };
    };
    const lint = await execution.executeGate("/tmp/chalwa", "lint", contract.generic_quality_gates.lint, { genericQualityGates: contract.generic_quality_gates }, runner);
    const named = await execution.executeGate("/tmp/chalwa", "catalog-test", { type: "test_name", file: "src/catalog.test.ts", name: "validates product and variant fields" }, {}, runner);
    expect(lint.status).toBe("PASS");
    expect(named.status).toBe("PASS");
    expect(calls).toEqual([
      { command: "npm", args: ["run", "lint"], shell: false },
      { command: "npm", args: ["test", "--", "--run", "src/catalog.test.ts", "-t", "validates product and variant fields"], shell: false },
    ]);
  });

  it("executes diff-check and read-only route/API gate types", async () => {
    const gitResult = await execution.executeGate("/tmp/chalwa", "diff", { type: "git_diff_check" }, {}, () => ({ status: 0, stdout: "", stderr: "" }));
    expect(gitResult.status).toBe("PASS");
    const fetch = vi.fn(async () => ({ status: 200 }));
    globalThis.fetch = fetch;
    const route = await execution.executeGate("/tmp/chalwa", "health", { type: "route_exists", endpoint: "health_url", path: "/health", status: 200 }, { stagingValidation: { health_url: "https://staging.example/health" } });
    const api = await execution.executeGate("/tmp/chalwa", "catalog-api", { type: "api_contract", endpoint: "staging_url", path: "/api/catalog", method: "GET", status: 200 }, { stagingValidation: { staging_url: "https://staging.example" } });
    expect(route.status).toBe("PASS");
    expect(api.status).toBe("PASS");
    expect(fetch.mock.calls.map(([url, options]) => [String(url), options.method])).toEqual([
      ["https://staging.example/health", "GET"],
      ["https://staging.example/api/catalog", "GET"],
    ]);
  });

  it("rejects mutation HTTP gates and non-allowlisted commands", async () => {
    expect(execution.validateGateDefinition({ type: "api_contract", endpoint: "staging_url", path: "/mutate", method: "POST", status: 200 })).toBe(false);
    const result = await execution.executeGate("/tmp", "unsafe", { type: "command", command: "npm", args: ["run", "deploy"] }, { genericQualityGates: contract.generic_quality_gates });
    expect(result.status).toBe("FAIL");
  });

  it("simulates the explicit lifecycle without mutating app source or completing the task", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ax06-fake-worker-"));
    const appFile = path.join(temp, "source.ts");
    fs.writeFileSync(appFile, "unchanged\n");
    const before = fs.readFileSync(appFile, "utf8");
    const run = await execution.simulateLifecycle(spec(), execution.createFakeWorker(), { now: () => "2026-10-04T00:00:00.000Z" });
    expect(run.transitions.map((item) => item.state)).toEqual(["READY", "PREPARING", "RUNNING", "VALIDATING", "COMMITTING", "PUBLISHING", "COMPLETED"]);
    expect(run.status).toBe("COMPLETED");
    expect(run.task_completed).toBe(false);
    expect(fs.readFileSync(appFile, "utf8")).toBe(before);
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it("records retryable worker failure and resume point", async () => {
    const run = await execution.simulateLifecycle(spec(), execution.createFakeWorker(), { failAt: "RUNNING" });
    expect(run).toMatchObject({ status: "FAILED", retryable: true, resume_from: "PREPARING", task_completed: false });
    expect(run.failure_reason).toMatch(/Simulated failure/);
    expect(execution.retryAllowed(run, 2)).toBe(true);
    run.attempt = 2;
    expect(execution.retryAllowed(run, 2)).toBe(false);
  });

  it("blocks a non-fake provider without automatic retry", async () => {
    const fake = execution.createFakeWorker();
    fake.provider = "codex";
    const run = await execution.simulateLifecycle(spec(), fake);
    expect(run).toMatchObject({ status: "BLOCKED", retryable: false, task_completed: false });
  });

  it("requires all real completion evidence before a task can complete", () => {
    const evidence = { worker_succeeded: true, path_scope_passed: true, task_gates_passed: true, generic_gates_passed: true, staging_safety_passed: true, commit_created: true, push_succeeded: true, result_sha: sourceSha, remote_result_sha: sourceSha, evidence_persisted: true, production_untouched: true, approval_required: false, force_push: false, merge_to_main: false };
    expect(execution.canCompleteTask({ ...evidence, push_succeeded: false })).toBe(false);
    expect(execution.canCompleteTask(evidence)).toBe(true);
  });

  it("enforces production exclusion and every sensitive action guard", () => {
    const invalid = spec({ descriptor: { ...descriptor, generic_quality_gates: contract.generic_quality_gates, forbidden_paths: contract.forbidden_paths } });
    invalid.production_forbidden = false;
    expect(execution.validateExecutionSpec(invalid)).toContain("PRODUCTION_OR_DEPLOYMENT_POLICY_INVALID");
    for (const action of execution.BLOCKED_ACTIONS) expect(delivery.authorizeAction(action).allowed).toBe(false);
  });

  it("does not allow lifecycle skips or backward transitions", () => {
    const run = execution.createExecutionRun(spec());
    expect(() => execution.transitionRun(run, "RUNNING")).toThrow(/Invalid execution transition/);
    expect(() => execution.transitionRun(run, "PREPARING")).not.toThrow();
    expect(() => execution.transitionRun(run, "READY")).toThrow(/Invalid execution transition/);
  });
});
