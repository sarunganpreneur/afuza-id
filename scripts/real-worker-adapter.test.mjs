import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import worker from "./real-worker-adapter.cjs";
import execution from "./execution-contract.cjs";
import delivery from "./delivery-orchestrator.cjs";

const root = path.resolve(import.meta.dirname, "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, ".afuzactl/delivery/execution-contract.json"), "utf8"));
const taskId = "CHW-06-01";
const taskBranch = "ax06/chalwa/CHW-06-01";
const allowedPaths = ["src/catalog/**", "src/catalog.test.ts"];
const forbiddenPaths = ["**/.env", "**/.env.*", "**/node_modules/**", "../**", "/**"];

function makeSpec(overrides = {}) {
  return {
    execution_id: "adapter-test",
    project_id: "chalwa.id",
    task_id: taskId,
    task_title: "Catalog foundation",
    objective: "Add validated catalog data types.",
    task_state: "READY",
    approval_required: false,
    source_branch: "feature/ax06-backlog-chalwa",
    task_branch: taskBranch,
    repo_path: "/unrestricted/source/repository",
    workspace_path: "/tmp/ax06-test/chalwa/CHW-06-01",
    starting_sha: "a".repeat(40),
    allowed_paths: allowedPaths,
    forbidden_paths: forbiddenPaths,
    acceptance_criteria: ["Catalog fields are validated"],
    acceptance_gate_map: [{ criterion: "Catalog fields are validated", gate_ids: ["catalog-test"] }],
    acceptance_gates: { "catalog-test": { type: "test_name", file: "src/catalog.test.ts", name: "validates fields" } },
    verification_gates: [],
    verification_gate_map: {},
    generic_quality_gates: ["lint", "typecheck", "test", "build", "git_diff_check"],
    generic_gate_definitions: contract.generic_quality_gates,
    autonomous_actions_allowed: [],
    approval_boundaries: [],
    sensitive_boundaries_triggered: [],
    staging_validation: { deployment_enabled: false },
    production_forbidden: true,
    approval_id: "AX-06",
    ...overrides,
  };
}

function git(directory, args) {
  const result = spawnSync("git", ["-C", directory, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function createRepoFixture() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ax06-worker-test-"));
  fs.chmodSync(temporary, 0o755);
  const repository = path.join(temporary, "repo");
  const workspaceRoot = path.join(temporary, "worktrees");
  fs.mkdirSync(repository);
  git(repository, ["init", "-b", "feature/ax06-backlog-chalwa"]);
  git(repository, ["config", "user.name", "Adapter Test"]);
  git(repository, ["config", "user.email", "adapter@example.invalid"]);
  fs.mkdirSync(path.join(repository, "src", "catalog"), { recursive: true });
  fs.writeFileSync(path.join(repository, "src/catalog/model.ts"), "export const catalog = true;\n");
  git(repository, ["add", "."]);
  git(repository, ["commit", "-m", "fixture"]);
  const startingSha = git(repository, ["rev-parse", "HEAD"]);
  const workspace = path.join(workspaceRoot, "chalwa", taskId);
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  git(repository, ["worktree", "add", "-b", taskBranch, workspace, startingSha]);
  return { temporary, repository, workspaceRoot, workspace, startingSha };
}

describe("AX-06 real-worker adapter boundary", () => {
  it("discovers worker executables without claiming unverified capabilities", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ax06-runtime-probe-"));
    const executable = path.join(temporary, "local-agent");
    fs.writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    const discovery = worker.discoverWorkerCapabilities({ env: { PATH: temporary }, names: ["local-agent"], configuredProvider: "fake" });
    expect(discovery.runtimes[0]).toMatchObject({ executable, qualifies: false, version: null, non_interactive: false, restricted_filesystem: false });
    expect(discovery).toMatchObject({ configured_provider: "fake", candidate_provider: null, dispatch_enabled: false });
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  it("requires every isolation and execution capability before qualifying a runtime", () => {
    const complete = Object.fromEntries(worker.REQUIRED_SANDBOX_CAPABILITIES.map((name) => [name, true]));
    expect(worker.hasRequiredSandboxCapabilities(complete)).toBe(true);
    delete complete.filesystem_scoped;
    expect(worker.hasRequiredSandboxCapabilities(complete)).toBe(false);
  });

  it("rejects caller-supplied specs that diverge from canonical repo, source, or task scopes", () => {
    const spec = makeSpec({ repo_path: "/tmp/other-repository", source_branch: "main", allowed_paths: ["**"] });
    const errors = worker.validateAdapterSpec(spec, { id: "chalwa.id", repository: "/home/afuzaid/apps/chalwa" }, contract);
    expect(errors).toContain("CANONICAL_REPOSITORY_MISMATCH");
    expect(errors).toContain("APPROVED_SOURCE_BRANCH_MISMATCH");
    expect(errors).toContain("ALLOWED_PATHS_CONTRACT_MISMATCH");
  });

  it("passes only bounded task context and no repository, credentials, network, push, or shell authority", () => {
    const request = worker.workerRequest(makeSpec({ token: "secret-value", repo_path: "/private/repo", source_branch: "private-source" }), "/tmp/isolated-worktree");
    expect(request.execution_spec).not.toHaveProperty("repo_path");
    expect(request.execution_spec).not.toHaveProperty("source_branch");
    expect(request.execution_spec).not.toHaveProperty("token");
    expect(request.execution_spec).toMatchObject({ objective: "Add validated catalog data types.", allowed_paths: allowedPaths, forbidden_paths: forbiddenPaths });
    expect(request.capabilities.commands).toMatchObject({ git_write: [], shell: false, network: false, deployment: false, production: false, secrets: false });
  });

  it("creates an isolated worktree from the exact approved source SHA", () => {
    const fixture = createRepoFixture();
    const spec = makeSpec({
      repo_path: fixture.repository,
      workspace_path: fixture.workspace,
      starting_sha: fixture.startingSha,
    });
    expect(worker.verifyWorkspace(spec, { root: fixture.workspaceRoot })).toMatchObject({ starting_sha: fixture.startingSha, task_branch: taskBranch });
    expect(() => worker.verifyWorkspace({ ...spec, starting_sha: "b".repeat(40) }, { root: fixture.workspaceRoot })).toThrow(/STARTING_SHA_MISMATCH/);
    fs.rmSync(fixture.temporary, { recursive: true, force: true });
  });

  it("rejects traversal, absolute paths, and backslash path escapes", () => {
    for (const candidate of ["../secret", "src/../../secret", "/etc/passwd", "src\\..\\secret", "src/./file"]) {
      expect(worker.safeRelativePath(candidate)).toBe(false);
    }
    expect(execution.pathAllowed("../secret", ["**"], [])).toBe(false);
  });

  it("rejects symlink escapes before accepting a changed path", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ax06-symlink-test-"));
    const workspace = path.join(temporary, "workspace");
    const outside = path.join(temporary, "outside");
    fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
    fs.symlinkSync(outside, path.join(workspace, "src", "escape"));
    expect(() => worker.assertNoSymlinkEscape(workspace, "src/escape/secret.txt")).toThrow(/SYMLINK_PATH_REJECTED/);
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  it("rejects forbidden files even when a broad allowed pattern matches", () => {
    const spec = makeSpec({ allowed_paths: ["**"], forbidden_paths: ["**/.env*"] });
    expect(worker.assertPathScope([".env.production", "src/catalog/model.ts"], spec, "/tmp")).toEqual([".env.production"]);
  });

  it("rejects unexpected changed files outside task scope", () => {
    const spec = makeSpec();
    expect(worker.assertPathScope(["src/catalog/model.ts", "src/admin.ts"], spec, "/tmp")).toEqual(["src/admin.ts"]);
  });

  it("rejects arbitrary command requests and permits only registered gates/read-only git", () => {
    const request = worker.workerRequest(makeSpec(), "/tmp/isolated-worktree");
    expect(worker.workerCapabilityAllowed(request, { type: "gate", name: "catalog-test" })).toBe(true);
    expect(worker.workerCapabilityAllowed(request, { type: "git-read", command: "status" })).toBe(true);
    for (const capability of [
      { type: "shell", command: "sudo systemctl restart nginx" },
      { type: "command", command: "curl https://example.invalid" },
      { type: "git-write", command: "push" },
      { type: "gate", name: "unregistered" },
    ]) expect(worker.workerCapabilityAllowed(request, capability)).toBe(false);
  });

  it("denies worker git push and force operations before invoking Git", () => {
    const calls = [];
    const runner = (...args) => { calls.push(args); return { status: 0, stdout: "", stderr: "" }; };
    expect(worker.runGit("/tmp", ["push", "origin", taskBranch], runner).status).toBe(126);
    expect(worker.runGit("/tmp", ["reset", "--hard", "main"], runner).status).toBe(126);
    expect(calls).toEqual([]);
  });

  it("lets only the orchestrator commit changed files that pass scope validation", () => {
    const fixture = createRepoFixture();
    const changed = path.join(fixture.workspace, "src/catalog/new.ts");
    fs.writeFileSync(changed, "export const added = true;\n");
    const spec = makeSpec({ repo_path: fixture.repository, workspace_path: fixture.workspace, starting_sha: fixture.startingSha });
    const rootRunner = (_command, args) => {
      const gitIndex = args.indexOf("git");
      return spawnSync("git", args.slice(gitIndex + 1), { encoding: "utf8" });
    };
    const result = worker.createScopedCommit(spec, fixture.workspace, "Add scoped fixture", rootRunner);
    expect(result).toMatchObject({ changed_paths: ["src/catalog/new.ts"] });
    expect(result.result_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(git(fixture.workspace, ["status", "--porcelain"]).trim()).toBe("");
    fs.rmSync(fixture.temporary, { recursive: true, force: true });
  });

  it("rejects worker self-reported task completion and compares facts to independent paths", () => {
    const result = {
      execution_id: "adapter-test", task_id: taskId, provider: "local-agent", workspace: "/tmp/w", starting_sha: "a".repeat(40),
      changed_paths: ["src/catalog/model.ts"], summary: "Done", worker_exit_status: 0, worker_completed: true,
      warnings: [], requested_approval: false, failure_reason: null,
    };
    expect(worker.validateWorkerResult(result, { execution_id: "adapter-test", task_id: taskId, provider: "local-agent", workspace: "/tmp/w", starting_sha: "a".repeat(40) }, ["src/catalog/model.ts"]))
      .toContain("WORKER_CANNOT_COMPLETE_TASK");
    expect(worker.validateWorkerResult({ ...result, worker_completed: false, changed_paths: [] }, { execution_id: "adapter-test", task_id: taskId, provider: "local-agent", workspace: "/tmp/w", starting_sha: "a".repeat(40) }, ["src/catalog/model.ts"]))
      .toContain("WORKER_CHANGED_PATHS_UNTRUSTED");
    const valid = { ...result, worker_completed: false };
    expect(worker.validateWorkerResult(valid, { execution_id: "adapter-test", task_id: taskId, provider: "local-agent", workspace: "/tmp/w", starting_sha: "a".repeat(40) }, ["src/catalog/model.ts"]))
      .not.toContain("WORKER_RESULT_SCHEMA_INVALID");
  });

  it("detects ignored secret/config file changes through filesystem hashing", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ax06-filesystem-snapshot-"));
    const before = worker.filesystemSnapshot(temporary);
    fs.writeFileSync(path.join(temporary, ".env.local"), "PRIVATE=value\n");
    const after = worker.filesystemSnapshot(temporary);
    expect(worker.changedSnapshotPaths(before, after)).toEqual([".env.local"]);
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  it("independently executes all mapped and generic gates", async () => {
    const calls = [];
    const spec = makeSpec({
      verification_gates: [],
      acceptance_gate_map: [{ criterion: "Catalog fields are validated", gate_ids: ["catalog-test"] }],
      generic_gate_definitions: contract.generic_quality_gates,
    });
    const results = await worker.runMappedGates(spec, "/tmp/worktree", (command, args, options) => {
      calls.push({ command, args, shell: options.shell, env: options.env });
      return { status: 0, stdout: "pass", stderr: "" };
    });
    expect(results.every((result) => result.status === "PASS")).toBe(true);
    expect(results.map((result) => result.name)).toEqual(expect.arrayContaining(["catalog-test", "lint", "typecheck", "test", "build", "git_diff_check"]));
    expect(calls.filter((call) => call.command === "npm").every((call) => call.shell === false)).toBe(true);
    expect(calls.filter((call) => call.command === "npm").every((call) => call.env.HOME === "/nonexistent" && !("GITHUB_TOKEN" in call.env))).toBe(true);
  });

  it("requires remote SHA equality after normal push and fetch", () => {
    const expectedSha = "c".repeat(40);
    const spec = makeSpec();
    const runner = (_command, args) => {
      const gitIndex = args.indexOf("git");
      const gitArgs = args.slice(gitIndex + 1);
      const command = gitArgs.slice(gitArgs.indexOf("-C") + 2);
      if (command[0] === "rev-parse") return { status: 0, stdout: `${expectedSha}\n`, stderr: "" };
      if (command[0] === "branch") return { status: 0, stdout: `${taskBranch}\n`, stderr: "" };
      if (command[0] === "status") return { status: 0, stdout: "", stderr: "" };
      if (command[0] === "ls-remote") return { status: 0, stdout: `${"d".repeat(40)}\trefs/heads/${taskBranch}\n`, stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };
    expect(() => worker.publishAndVerify(spec, "/tmp/worktree", expectedSha, runner)).toThrow(/REMOTE_RESULT_SHA_MISMATCH/);
    const matching = (_command, args) => {
      const gitIndex = args.indexOf("git");
      const gitArgs = args.slice(gitIndex + 1);
      const command = gitArgs.slice(gitArgs.indexOf("-C") + 2);
      if (command[0] === "rev-parse") return { status: 0, stdout: `${expectedSha}\n`, stderr: "" };
      if (command[0] === "branch") return { status: 0, stdout: `${taskBranch}\n`, stderr: "" };
      if (command[0] === "status") return { status: 0, stdout: "", stderr: "" };
      if (command[0] === "ls-remote") return { status: 0, stdout: `${expectedSha}\trefs/heads/${taskBranch}\n`, stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };
    expect(worker.publishAndVerify(spec, "/tmp/worktree", expectedSha, matching)).toMatchObject({ result_sha: expectedSha, remote_result_sha: expectedSha, equal: true });
  });

  it("detects stale worker runs and resumes validation without retrying", () => {
    const stale = { status: "WORKER_RUNNING", transitions: [{ state: "WORKER_RUNNING", at: "2026-10-01T00:00:00.000Z" }] };
    expect(worker.staleRunDisposition(stale, Date.parse("2026-10-01T01:00:00.000Z"))).toMatchObject({ stale: true, automatic_retry: false, action: "inspect-disposable-workspace" });
    const finished = { status: "WORKER_FINISHED", transitions: [{ state: "WORKER_FINISHED", at: "2026-10-01T00:00:00.000Z" }] };
    expect(worker.staleRunDisposition(finished, Date.parse("2026-10-01T01:00:00.000Z"))).toMatchObject({ stale: true, action: "resume-validation", retryable: false });
  });

  it("classifies safety failures as non-retryable and ordinary failures as retryable", () => {
    expect(worker.classifyWorkerFailure(new Error("PATH_SCOPE_VIOLATION"))).toMatchObject({ status: "BLOCKED", retryable: false });
    expect(worker.classifyWorkerFailure(new Error("worker process exited unexpectedly"))).toMatchObject({ status: "FAILED", retryable: true });
    const retry = { status: "FAILED", retryable: true, attempt: 1 };
    expect(worker.workerRetryAllowed(retry, 2)).toBe(true);
    retry.attempt = 2;
    expect(worker.workerRetryAllowed(retry, 2)).toBe(false);
    expect(worker.workerRetryAllowed({ ...retry, retryable: false }, 4)).toBe(false);
  });

  it("persists each lifecycle transition as append-only evidence", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ax06-transition-test-"));
    const run = worker.createWorkerRun(makeSpec(), "2026-10-05T00:00:00.000Z");
    expect(() => worker.transitionWorkerRun(run, "PREPARING")).toThrow(/EVIDENCE_REQUIRED/);
    worker.transitionWorkerRun(run, "PREPARING", "2026-10-05T00:00:01.000Z", temporary);
    worker.transitionWorkerRun(run, "WORKSPACE_READY", "2026-10-05T00:00:02.000Z", temporary);
    const eventPath = path.join(temporary, "execution-events", "adapter-test.jsonl");
    expect(fs.readFileSync(eventPath, "utf8").trim().split("\n").map((line) => JSON.parse(line).state)).toEqual(["PREPARING", "WORKSPACE_READY"]);
    fs.rmSync(temporary, { recursive: true, force: true });
  });

  it("recovers only the canonical clean disposable worktree after explicit confirmation", () => {
    const fixture = createRepoFixture();
    const spec = makeSpec({ repo_path: fixture.repository, workspace_path: fixture.workspace });
    expect(worker.recoverDisposableWorkspace(spec, { root: fixture.workspaceRoot })).toMatchObject({ recovered: false, status: "CONFIRMATION_REQUIRED" });
    const calls = [];
    const runner = (_command, args) => {
      calls.push(args);
      const gitIndex = args.indexOf("git");
      const gitArgs = args.slice(gitIndex + 1);
      const command = gitArgs.slice(gitArgs.indexOf("-C") + 2);
      if (command[0] === "worktree" && command[1] === "remove") {
        fs.rmSync(fixture.workspace, { recursive: true, force: true });
        return { status: 0, stdout: "", stderr: "" };
      }
      if (command[0] === "branch" && command[1] === "-d") return { status: 0, stdout: "", stderr: "" };
      return { status: 0, stdout: `${taskBranch}\n`, stderr: "" };
    };
    expect(worker.recoverDisposableWorkspace(spec, { root: fixture.workspaceRoot, confirm: true, runner })).toMatchObject({ recovered: true, status: "REMOVED_CLEAN_DISPOSABLE_WORKTREE" });
    expect(calls).toHaveLength(3);
    fs.rmSync(fixture.temporary, { recursive: true, force: true });
  });

  it("keeps production excluded and strips inherited environment secrets", () => {
    const spec = makeSpec();
    expect(spec.production_forbidden).toBe(true);
    expect(delivery.authorizeAction("production-deploy").allowed).toBe(false);
    expect(delivery.authorizeAction("credential-or-key-rotation").allowed).toBe(false);
    const environment = worker.workerEnvironment("/usr/bin:/bin");
    expect(environment).toEqual({ PATH: "/usr/bin:/bin", HOME: "/nonexistent", CI: "1", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
    expect(environment).not.toHaveProperty("PATH_TOKEN");
    expect(environment).not.toHaveProperty("SSH_AUTH_SOCK");
    expect(environment).not.toHaveProperty("GITHUB_TOKEN");
  });
});
