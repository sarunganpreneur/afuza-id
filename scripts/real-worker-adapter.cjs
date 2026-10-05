"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const Ajv = require("ajv");
const execution = require("./execution-contract.cjs");

const WORKER_ROOT = "/home/afuzaid/engineering/worktrees/ax06-execution";
const REQUIRED_SANDBOX_CAPABILITIES = [
  "non_interactive",
  "working_directory_scoped",
  "filesystem_scoped",
  "environment_isolated",
  "network_disabled",
  "command_allowlisted",
  "reliable_exit_status",
];
const DISCOVERY_NAMES = ["codex", "copilot", "vscode-agent", "aider", "goose", "opencode", "claude", "gemini"];
const WORKER_TRANSITIONS = {
  READY: ["PREPARING", "BLOCKED", "AWAITING_APPROVAL"],
  PREPARING: ["WORKSPACE_READY", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  WORKSPACE_READY: ["WORKER_RUNNING", "BLOCKED", "AWAITING_APPROVAL"],
  WORKER_RUNNING: ["WORKER_FINISHED", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  WORKER_FINISHED: ["VALIDATING", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  VALIDATING: ["COMMITTING", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  COMMITTING: ["PUBLISHING", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  PUBLISHING: ["COMPLETED", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  COMPLETED: [],
  BLOCKED: [],
  FAILED: [],
  AWAITING_APPROVAL: [],
};
const WORKER_SPEC_FIELDS = [
  "execution_id", "task_id", "task_title", "objective", "starting_sha", "allowed_paths",
  "forbidden_paths", "acceptance_criteria", "acceptance_gates", "verification_gates",
  "verification_gate_map", "generic_quality_gates", "generic_gate_definitions",
];

function resolveExecutable(name, env = process.env) {
  for (const directory of (env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const details = fs.statSync(candidate);
      if (details.isFile()) return candidate;
    } catch {}
  }
  return null;
}

function discoverWorkerCapabilities(options = {}) {
  const env = options.env || process.env;
  const names = options.names || DISCOVERY_NAMES;
  const runtimes = names.map((name) => {
    const executable = resolveExecutable(name, env);
    return {
      name,
      executable,
      version: null,
      non_interactive: false,
      working_directory_scoped: false,
      prompt_input_non_interactive: false,
      reliable_exit_status: false,
      restricted_filesystem: false,
      qualifies: false,
      reason: executable ? "Executable found; runtime capabilities require explicit sandbox attestation." : "Not installed in the current user PATH.",
    };
  });
  return {
    configured_provider: options.configuredProvider || "fake",
    candidate_provider: null,
    runtimes,
    sandbox: {
      bwrap: resolveExecutable("bwrap", env),
      firejail: resolveExecutable("firejail", env),
      nsjail: resolveExecutable("nsjail", env),
    },
    dispatch_enabled: false,
    task_dispatch_available: false,
  };
}

function hasRequiredSandboxCapabilities(capabilities = {}) {
  return REQUIRED_SANDBOX_CAPABILITIES.every((name) => capabilities[name] === true);
}

function validateAdapterSpec(spec, lane, contract) {
  const errors = [];
  const descriptor = contract.tasks?.[spec.task_id];
  if (!lane || spec.project_id !== lane.id || spec.repo_path !== lane.repository) errors.push("CANONICAL_REPOSITORY_MISMATCH");
  if (!descriptor || descriptor.project_id !== lane?.id) errors.push("TASK_DESCRIPTOR_MISMATCH");
  if (spec.source_branch !== contract.source_branches?.[lane?.id]) errors.push("APPROVED_SOURCE_BRANCH_MISMATCH");
  if (descriptor && JSON.stringify(spec.allowed_paths) !== JSON.stringify(descriptor.allowed_paths)) errors.push("ALLOWED_PATHS_CONTRACT_MISMATCH");
  if (descriptor && JSON.stringify(spec.forbidden_paths) !== JSON.stringify(contract.forbidden_paths)) errors.push("FORBIDDEN_PATHS_CONTRACT_MISMATCH");
  if (descriptor && JSON.stringify(spec.acceptance_gate_map.map((item) => item.gate_ids)) !== JSON.stringify(descriptor.acceptance_gate_map)) errors.push("ACCEPTANCE_GATE_CONTRACT_MISMATCH");
  if (descriptor && JSON.stringify(spec.acceptance_gates) !== JSON.stringify(descriptor.acceptance_gates)) errors.push("ACCEPTANCE_GATE_DEFINITIONS_MISMATCH");
  if (descriptor && JSON.stringify(spec.verification_gate_map) !== JSON.stringify(descriptor.verification_gate_map)) errors.push("VERIFICATION_GATE_DEFINITIONS_MISMATCH");
  if (JSON.stringify(spec.generic_gate_definitions) !== JSON.stringify(contract.generic_quality_gates)) errors.push("GENERIC_GATE_DEFINITIONS_MISMATCH");
  if (lane && spec.task_branch !== execution.taskBranchName(lane.id, spec.task_id)) errors.push("TASK_BRANCH_MISMATCH");
  if (lane && spec.workspace_path !== execution.worktreePath(lane.id, spec.task_id)) errors.push("WORKSPACE_PATH_MISMATCH");
  if (spec.staging_validation?.staging_url !== lane?.staging_url || spec.staging_validation?.health_url !== lane?.health_url ||
    spec.staging_validation?.ready_url !== lane?.ready_url) errors.push("STAGING_ENDPOINT_MISMATCH");
  if (execution.validateExecutionSpec(spec).length) errors.push(...execution.validateExecutionSpec(spec));
  return [...new Set(errors)];
}

function workerRequest(spec, workspace) {
  if (!path.isAbsolute(workspace)) throw new Error("Worker workspace must be an absolute path");
  const boundedSpec = {};
  for (const key of WORKER_SPEC_FIELDS) {
    if (spec[key] !== undefined) boundedSpec[key] = structuredClone(spec[key]);
  }
  return {
    execution_spec: boundedSpec,
    workspace,
    capabilities: {
      filesystem: { read_write_root: workspace, allowed_paths: [...spec.allowed_paths], forbidden_paths: [...spec.forbidden_paths] },
      commands: {
        approved_gates: Object.entries({ ...spec.acceptance_gates, ...spec.verification_gate_map, ...spec.generic_gate_definitions })
          .filter(([, gate]) => execution.validateGateDefinition(gate))
          .map(([id]) => id),
        git_read: ["status", "diff"],
        git_write: [],
        shell: false,
        network: false,
        deployment: false,
        production: false,
        secrets: false,
      },
    },
  };
}

function workerCapabilityAllowed(request, capability) {
  if (!request || !capability || typeof capability !== "object") return false;
  if (capability.type === "gate") return request.capabilities.commands.approved_gates.includes(capability.name);
  if (capability.type === "git-read") return request.capabilities.commands.git_read.includes(capability.command);
  return false;
}

function validateWorkerResult(result, expected, actualChangedPaths) {
  const errors = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) return ["WORKER_RESULT_INVALID"];
  const resultSchema = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../.afuzactl/delivery/schemas/worker-result.schema.json"), "utf8"));
  const schemaValidator = new Ajv({ allErrors: true, schemaId: "auto" });
  if (!schemaValidator.validate(resultSchema, result)) errors.push("WORKER_RESULT_SCHEMA_INVALID");
  for (const key of ["execution_id", "task_id", "provider", "workspace", "starting_sha"]) {
    if (result[key] !== expected[key]) errors.push(`WORKER_RESULT_MISMATCH:${key}`);
  }
  if (!Number.isInteger(result.worker_exit_status)) errors.push("WORKER_EXIT_STATUS_INVALID");
  if (typeof result.worker_completed !== "boolean") errors.push("WORKER_COMPLETED_INVALID");
  if (result.worker_completed === true) errors.push("WORKER_CANNOT_COMPLETE_TASK");
  if (result.requested_approval === true) errors.push("WORKER_REQUESTED_APPROVAL");
  if (typeof result.summary !== "string" || (typeof result.failure_reason !== "string" && result.failure_reason !== null)) errors.push("WORKER_RESULT_FIELDS_INVALID");
  if (!Array.isArray(result.changed_paths) || result.changed_paths.some((item) => typeof item !== "string")) errors.push("WORKER_CHANGED_PATHS_INVALID");
  if (!Array.isArray(result.warnings) || result.warnings.some((item) => typeof item !== "string")) errors.push("WORKER_WARNINGS_INVALID");
  if (Array.isArray(result.changed_paths) && JSON.stringify([...result.changed_paths].sort()) !== JSON.stringify([...actualChangedPaths].sort())) {
    errors.push("WORKER_CHANGED_PATHS_UNTRUSTED");
  }
  if (result.worker_exit_status !== 0 || result.failure_reason) errors.push("WORKER_FAILED");
  return [...new Set(errors)];
}

function safeRelativePath(relativePath) {
  return typeof relativePath === "string" && relativePath.length > 0 && !path.isAbsolute(relativePath) &&
    !relativePath.includes("\\") && !relativePath.includes("\0") &&
    !relativePath.split("/").some((part) => part === ".." || part === ".");
}

function assertNoSymlinkEscape(root, relativePath) {
  if (!safeRelativePath(relativePath)) throw new Error(`PATH_TRAVERSAL:${relativePath}`);
  const absoluteRoot = fs.realpathSync(root);
  let current = absoluteRoot;
  for (const part of relativePath.split("/")) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`SYMLINK_PATH_REJECTED:${relativePath}`);
    const real = fs.realpathSync(current);
    if (real !== absoluteRoot && !real.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error(`PATH_ESCAPE:${relativePath}`);
  }
  return path.join(absoluteRoot, relativePath);
}

function assertPathScope(changedPaths, spec, workspace) {
  const rejected = [];
  for (const changedPath of changedPaths) {
    try {
      assertNoSymlinkEscape(workspace, changedPath);
      if (!execution.pathAllowed(changedPath, spec.allowed_paths, spec.forbidden_paths)) rejected.push(changedPath);
    } catch {
      rejected.push(changedPath);
    }
  }
  return [...new Set(rejected)];
}

function runGit(repo, args, runner = spawnSync) {
  if (args.some((arg) => typeof arg !== "string" || arg === "-f" || arg === "--hard" || /^--force(?:$|[-=])/.test(arg)) ||
    args.includes("push") || args.includes("commit") || args.includes("merge") ||
    (args[0] === "reset" && args.includes("--hard"))) {
    return { status: 126, stdout: "", stderr: "Worker git authority denied" };
  }
  return execution.runGit(repo, args, runner);
}

function trackedSnapshot(repo, runner = spawnSync) {
  const files = runGit(repo, ["ls-files", "-z"], runner);
  const untracked = runGit(repo, ["ls-files", "--others", "--exclude-standard", "-z"], runner);
  const status = runGit(repo, ["status", "--porcelain=v1", "--untracked-files=all", "-z"], runner);
  if (files.status !== 0 || untracked.status !== 0 || status.status !== 0) throw new Error("REPOSITORY_SNAPSHOT_FAILED");
  const hashes = {};
  for (const relative of new Set([...files.stdout, ...untracked.stdout].join("").split("\0").filter(Boolean))) {
    const fullPath = path.join(repo, relative);
    const stat = fs.lstatSync(fullPath);
    hashes[relative] = stat.isSymbolicLink() ? `symlink:${fs.readlinkSync(fullPath)}` : crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
  }
  return { files: hashes, status: status.stdout, filesystem: filesystemSnapshot(repo) };
}

function changedPaths(repo, runner = spawnSync) {
  const diff = runGit(repo, ["diff", "--no-renames", "--name-only", "-z", "HEAD"], runner);
  const untracked = runGit(repo, ["ls-files", "--others", "--exclude-standard", "-z"], runner);
  if (diff.status !== 0 || untracked.status !== 0) throw new Error("WORKER_DIFF_INSPECTION_FAILED");
  return [...new Set([...diff.stdout, ...untracked.stdout].join("").split("\0").filter(Boolean))].sort();
}

function filesystemSnapshot(root) {
  const absoluteRoot = fs.realpathSync(root);
  const result = {};
  function visit(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(directory, entry.name);
      const stat = fs.lstatSync(fullPath);
      if (entry.name === ".git" && stat.isDirectory()) continue;
      if (["node_modules", ".next", "dist", "build"].includes(entry.name) && stat.isDirectory()) continue;
      if (stat.isSymbolicLink()) result[relative] = `symlink:${fs.readlinkSync(fullPath)}`;
      else if (stat.isDirectory()) visit(fullPath, relative);
      else if (stat.isFile()) result[relative] = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
    }
  }
  visit(absoluteRoot);
  return result;
}

function changedSnapshotPaths(before, after) {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((name) => before[name] !== after[name]).sort();
}

function workerEnvironment(workerPath = "/usr/bin:/bin") {
  return { PATH: workerPath, HOME: "/nonexistent", CI: "1", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
}

function verifyWorkspace(spec, options = {}) {
  const expectedPath = execution.worktreePath(spec.project_id, spec.task_id, options.root || WORKER_ROOT);
  const workspace = spec.workspace_path;
  if (path.resolve(workspace) !== path.resolve(expectedPath)) throw new Error("WORKSPACE_PATH_NOT_CANONICAL");
  if (!fs.existsSync(workspace) || fs.lstatSync(workspace).isSymbolicLink()) throw new Error("WORKSPACE_NOT_DISPOSABLE");
  const realRoot = fs.realpathSync(options.root || WORKER_ROOT);
  const realWorkspace = fs.realpathSync(workspace);
  if (!realWorkspace.startsWith(`${realRoot}${path.sep}`)) throw new Error("WORKSPACE_PATH_ESCAPE");
  const head = runGit(workspace, ["rev-parse", "HEAD"], options.runner || spawnSync);
  const branch = runGit(workspace, ["branch", "--show-current"], options.runner || spawnSync);
  if (head.status !== 0 || head.stdout.trim() !== spec.starting_sha) throw new Error("WORKSPACE_STARTING_SHA_MISMATCH");
  if (branch.status !== 0 || branch.stdout.trim() !== spec.task_branch) throw new Error("WORKSPACE_BRANCH_MISMATCH");
  return { workspace: realWorkspace, starting_sha: head.stdout.trim(), task_branch: branch.stdout.trim() };
}

function createLocalAgentAdapter(options = {}) {
  const runtime = options.runtime;
  const sandbox = options.sandbox;
  const runner = options.runner || spawnSync;
  const state = { spec: null, workspace: null, before: null, source_before: null, staging_before: null, worker_result: null };

  function requireRuntime() {
    if (!runtime || typeof runtime.invoke !== "function" || !hasRequiredSandboxCapabilities(sandbox?.capabilities)) {
      throw Object.assign(new Error("LOCAL_AGENT_RUNTIME_OR_SANDBOX_UNAVAILABLE"), { safety: true });
    }
  }

  return {
    provider: "local-agent",
    async prepare(spec) {
      requireRuntime();
      const specErrors = validateAdapterSpec(spec, options.lane, options.contract);
      if (specErrors.length) throw Object.assign(new Error(`EXECUTION_SPEC_POLICY_BLOCKED:${specErrors.join(",")}`), { safety: true });
      const workspace = execution.worktreePath(spec.project_id, spec.task_id, options.root || WORKER_ROOT);
      if (fs.existsSync(workspace)) throw Object.assign(new Error("WORKSPACE_COLLISION"), { safety: true });
      const preflight = execution.inspectSourceRepository(options.lane, spec.source_branch, options.contract, runner, {
        taskBranch: spec.task_branch,
        workspacePath: workspace,
      });
      if (Object.values(preflight.checks).some((passed) => !passed) || preflight.source_sha !== spec.starting_sha || preflight.remote_sha !== spec.starting_sha) {
        throw Object.assign(new Error("SOURCE_PREFLIGHT_FAILED"), { safety: true });
      }
      const stagingPath = options.stagingCheckoutPath;
      const stagingResolved = stagingPath && path.resolve(stagingPath);
      const workerResolved = path.resolve(workspace);
      const stagingContainsWorker = stagingResolved && !path.relative(stagingResolved, workerResolved).startsWith("..");
      const workerContainsStaging = stagingResolved && !path.relative(workerResolved, stagingResolved).startsWith("..");
      if (!stagingPath || stagingContainsWorker || workerContainsStaging) {
        throw Object.assign(new Error("STAGING_CHECKOUT_BOUNDARY_UNVERIFIED"), { safety: true });
      }
      state.spec = structuredClone(spec);
      state.workspace = workspace;
      state.source_before = trackedSnapshot(options.lane.repository, runner);
      state.staging_before = trackedSnapshot(stagingPath, runner);
      const parent = path.dirname(workspace);
      fs.mkdirSync(parent, { recursive: true });
      if (fs.lstatSync(parent).isSymbolicLink()) throw Object.assign(new Error("WORKSPACE_PARENT_SYMLINK"), { safety: true });
      const added = runGit(options.lane.repository, ["worktree", "add", "-b", spec.task_branch, workspace, spec.starting_sha], runner);
      if (added.status !== 0) throw Object.assign(new Error(`WORKTREE_CREATE_FAILED:${added.stderr}`), { safety: true });
      state.before = trackedSnapshot(workspace, runner);
      const verified = verifyWorkspace({ ...spec, workspace_path: workspace }, { root: options.root || WORKER_ROOT, runner });
      return { workspace, starting_sha: verified.starting_sha, task_branch: verified.task_branch, source_sha: spec.starting_sha };
    },
    async invoke(spec, workspace) {
      requireRuntime();
      if (workspace !== state.workspace || spec.execution_id !== state.spec?.execution_id) throw Object.assign(new Error("WORKER_INVOCATION_CONTEXT_MISMATCH"), { safety: true });
      verifyWorkspace({ ...spec, workspace_path: workspace }, { root: options.root || WORKER_ROOT, runner });
      const request = workerRequest(spec, workspace);
      const environment = workerEnvironment(options.workerPath);
      state.worker_result = await sandbox.invoke(runtime, request, { cwd: workspace, env: environment, timeoutMs: options.timeoutMs || 600000 });
      return state.worker_result;
    },
    async collectResult() {
      if (!state.workspace || !state.worker_result) throw new Error("WORKER_RESULT_NOT_AVAILABLE");
      const gitChanges = changedPaths(state.workspace, runner);
      const filesystemChanges = changedSnapshotPaths(state.before, filesystemSnapshot(state.workspace));
      return { ...state.worker_result, changed_paths: [...new Set([...gitChanges, ...filesystemChanges])].sort() };
    },
    async validateResult(result) {
      const expected = {
        execution_id: state.spec.execution_id,
        task_id: state.spec.task_id,
        provider: "local-agent",
        workspace: state.workspace,
        starting_sha: state.spec.starting_sha,
      };
      const gitChanges = changedPaths(state.workspace, runner);
      const actual = [...new Set([...gitChanges, ...changedSnapshotPaths(state.before, filesystemSnapshot(state.workspace))])].sort();
      const errors = validateWorkerResult(result, expected, actual);
      const outOfScope = assertPathScope(actual, state.spec, state.workspace);
      if (outOfScope.length) errors.push(`PATH_SCOPE_VIOLATION:${outOfScope.join(",")}`);
      const head = runGit(state.workspace, ["rev-parse", "HEAD"], runner);
      if (head.status !== 0 || head.stdout.trim() !== state.spec.starting_sha) errors.push("WORKER_CHANGED_COMMIT_OR_BRANCH");
      const sourceAfter = trackedSnapshot(options.lane.repository, runner);
      const stagingAfter = trackedSnapshot(options.stagingCheckoutPath, runner);
      if (JSON.stringify(sourceAfter) !== JSON.stringify(state.source_before)) errors.push("SOURCE_CHECKOUT_MUTATED");
      if (JSON.stringify(stagingAfter) !== JSON.stringify(state.staging_before)) errors.push("STAGING_CHECKOUT_MUTATED");
      const gates = await runMappedGates(state.spec, state.workspace, runner);
      if (gates.some((gate) => gate.status !== "PASS")) errors.push("GATE_VALIDATION_FAILED");
      return { passed: errors.length === 0, errors: [...new Set(errors)], changed_paths: actual, gates, starting_sha: state.spec.starting_sha };
    },
    async finalize() {
      return { task_completed: false, commit_created: false, pushed: false, authority: "orchestrator-only" };
    },
    get state() { return state; },
  };
}

async function runMappedGates(spec, workspace, runner = spawnSync) {
  const definitions = execution.listExecutionGateDefinitions(spec);
  const required = new Set(["lint", "typecheck", "test", "build", "git_diff_check"]);
  for (const mapped of spec.acceptance_gate_map) for (const id of mapped.gate_ids) required.add(id);
  for (const id of spec.verification_gates) required.add(id);
  const results = [];
  for (const name of required) {
    const definition = definitions[name];
    if (!definition) {
      results.push({ name, status: "FAIL", detail: "No executable gate definition" });
      continue;
    }
    results.push(await execution.executeGate(workspace, name, definition, {
      genericQualityGates: spec.generic_gate_definitions,
      stagingValidation: spec.staging_validation,
      env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: "/nonexistent", CI: "1", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", npm_config_userconfig: "/dev/null", npm_config_globalconfig: "/dev/null" },
    }, runner));
  }
  return results;
}

function createScopedCommit(spec, workspace, message, runner = spawnSync) {
  const paths = changedPaths(workspace, runner);
  const rejected = assertPathScope(paths, spec, workspace);
  if (rejected.length) throw Object.assign(new Error(`PATH_SCOPE_VIOLATION:${rejected.join(",")}`), { safety: true });
  if (!paths.length) throw new Error("NO_SCOPED_CHANGES_TO_COMMIT");
  const added = execution.runGit(workspace, ["add", "--", ...paths], runner);
  if (added.status !== 0) throw new Error(`GIT_ADD_FAILED:${added.stderr}`);
  const diffCheck = execution.runGit(workspace, ["diff", "--cached", "--check"], runner);
  if (diffCheck.status !== 0) throw new Error(`GIT_DIFF_CHECK_FAILED:${diffCheck.stderr}`);
  const committed = execution.runGit(workspace, ["-c", "core.hooksPath=/dev/null", "commit", "-m", message], runner);
  if (committed.status !== 0) throw new Error(`GIT_COMMIT_FAILED:${committed.stderr}`);
  const result = execution.runGit(workspace, ["rev-parse", "HEAD"], runner);
  if (result.status !== 0) throw new Error("RESULT_SHA_UNAVAILABLE");
  return { result_sha: result.stdout.trim(), changed_paths: paths };
}

function publishAndVerify(spec, workspace, resultSha, runner = spawnSync) {
  const local = execution.runGit(workspace, ["rev-parse", "HEAD"], runner);
  if (local.status !== 0 || local.stdout.trim() !== resultSha) throw new Error("LOCAL_RESULT_SHA_MISMATCH");
  const branch = execution.runGit(workspace, ["branch", "--show-current"], runner);
  if (branch.status !== 0 || branch.stdout.trim() !== spec.task_branch) throw new Error("PUBLISH_BRANCH_MISMATCH");
  const status = execution.runGit(workspace, ["status", "--porcelain=v1", "--untracked-files=all"], runner);
  if (status.status !== 0 || status.stdout.trim()) throw new Error("PUBLISH_WORKTREE_DIRTY");
  const pushed = execution.runGit(workspace, ["push", "origin", spec.task_branch], runner);
  if (pushed.status !== 0) throw new Error(`NORMAL_PUSH_FAILED:${pushed.stderr}`);
  const fetched = execution.runGit(workspace, ["fetch", "origin", spec.task_branch], runner);
  if (fetched.status !== 0) throw new Error(`FETCH_AFTER_PUSH_FAILED:${fetched.stderr}`);
  const remote = execution.runGit(workspace, ["ls-remote", "origin", `refs/heads/${spec.task_branch}`], runner);
  const remoteSha = remote.status === 0 ? remote.stdout.trim().split(/\s+/)[0] : null;
  if (!remoteSha || remoteSha !== resultSha) throw new Error("REMOTE_RESULT_SHA_MISMATCH");
  return { result_sha: resultSha, remote_result_sha: remoteSha, equal: true };
}

function createWorkerRun(spec, now = new Date().toISOString()) {
  return {
    schema_version: 1,
    execution_id: spec.execution_id,
    project_id: spec.project_id,
    task_id: spec.task_id,
    status: "READY",
    simulation: false,
    task_completed: false,
    started_at: null,
    completed_at: null,
    starting_sha: spec.starting_sha,
    result_sha: null,
    evidence_path: null,
    failure_reason: null,
    resume_from: null,
    retryable: false,
    attempt: 1,
    created_at: now,
    transitions: [{ state: "READY", at: now }],
    checks: { provider: "local-agent", commit_created: false, pushed: false },
  };
}

function transitionWorkerRun(run, nextState, now = new Date().toISOString(), evidenceDirectory) {
  if (!evidenceDirectory) throw new Error("WORKER_TRANSITION_EVIDENCE_REQUIRED");
  if (!WORKER_TRANSITIONS[run.status]?.includes(nextState)) throw new Error(`Invalid worker transition ${run.status} -> ${nextState}`);
  run.status = nextState;
  run.transitions.push({ state: nextState, at: now });
  if (["COMPLETED", "FAILED", "BLOCKED", "AWAITING_APPROVAL"].includes(nextState)) run.completed_at = now;
  if (evidenceDirectory) appendTransitionEvidence(evidenceDirectory, run, nextState);
  return run;
}

function classifyWorkerFailure(error) {
  const message = error?.message || "";
  const safety = error?.safety === true || /APPROVAL|PRODUCTION|PATH|SYMLINK|SOURCE|REMOTE|SECRET|STAGING|WORKSPACE|SANDBOX/i.test(message);
  return { status: safety ? (error?.approval ? "AWAITING_APPROVAL" : "BLOCKED") : "FAILED", retryable: !safety };
}

function workerRetryAllowed(run, maximumAttempts = 2) {
  return run.status === "FAILED" && run.retryable === true && run.attempt < maximumAttempts;
}

function staleRunDisposition(run, now = Date.now(), staleAfterMs = 15 * 60 * 1000) {
  const last = run.transitions?.at(-1);
  if (!last || !["PREPARING", "WORKSPACE_READY", "WORKER_RUNNING", "WORKER_FINISHED", "VALIDATING", "COMMITTING", "PUBLISHING"].includes(run.status)) return { stale: false, action: "none" };
  const stale = now - Date.parse(last.at) >= staleAfterMs;
  if (!stale) return { stale: false, action: "none" };
  if (["WORKER_FINISHED", "VALIDATING"].includes(run.status)) return { stale: true, action: "resume-validation", retryable: false };
  if (run.status === "WORKER_RUNNING") return { stale: true, action: "inspect-disposable-workspace", retryable: false, automatic_retry: false };
  return { stale: true, action: "inspect-and-recover-disposable-workspace", retryable: false, automatic_retry: false };
}

function recoverDisposableWorkspace(spec, options = {}) {
  const root = path.resolve(options.root || WORKER_ROOT);
  const workspace = path.resolve(spec.workspace_path);
  const expected = path.resolve(execution.worktreePath(spec.project_id, spec.task_id, root));
  if (workspace !== expected || !workspace.startsWith(`${root}${path.sep}`)) throw Object.assign(new Error("WORKSPACE_RECOVERY_PATH_REJECTED"), { safety: true });
  if (!fs.existsSync(workspace)) return { recovered: false, status: "ABSENT" };
  if (fs.lstatSync(workspace).isSymbolicLink() || !fs.realpathSync(workspace).startsWith(`${fs.realpathSync(root)}${path.sep}`)) {
    throw Object.assign(new Error("WORKSPACE_RECOVERY_ESCAPE"), { safety: true });
  }
  const branch = runGit(workspace, ["branch", "--show-current"], options.runner || spawnSync);
  if (branch.status !== 0 || branch.stdout.trim() !== spec.task_branch) throw Object.assign(new Error("WORKSPACE_RECOVERY_BRANCH_MISMATCH"), { safety: true });
  if (options.confirm !== true) return { recovered: false, status: "CONFIRMATION_REQUIRED", workspace };
  const removed = runGit(spec.repo_path, ["worktree", "remove", workspace], options.runner || spawnSync);
  if (removed.status !== 0) throw new Error(`WORKSPACE_RECOVERY_FAILED:${removed.stderr}`);
  const deleted = runGit(spec.repo_path, ["branch", "-d", spec.task_branch], options.runner || spawnSync);
  if (deleted.status !== 0) throw new Error(`WORKSPACE_BRANCH_RECOVERY_FAILED:${deleted.stderr}`);
  return { recovered: true, status: "REMOVED_CLEAN_DISPOSABLE_WORKTREE", workspace };
}

function appendTransitionEvidence(directory, run, state) {
  const evidenceRoot = path.resolve(directory);
  const target = path.join(evidenceRoot, "execution-events", `${run.execution_id}.jsonl`);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const realRoot = fs.realpathSync(evidenceRoot);
  const realParent = fs.realpathSync(path.dirname(target));
  if (!realParent.startsWith(`${realRoot}${path.sep}`)) throw new Error("EVIDENCE_PATH_ESCAPE");
  try {
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error("EVIDENCE_FILE_SYMLINK");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const descriptor = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW, 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify({ execution_id: run.execution_id, task_id: run.task_id, state, at: run.transitions.at(-1).at })}\n`);
  } finally {
    fs.closeSync(descriptor);
  }
  return target;
}

module.exports = {
  DISCOVERY_NAMES,
  REQUIRED_SANDBOX_CAPABILITIES,
  WORKER_ROOT,
  WORKER_SPEC_FIELDS,
  WORKER_TRANSITIONS,
  appendTransitionEvidence,
  assertNoSymlinkEscape,
  assertPathScope,
  changedPaths,
  classifyWorkerFailure,
  createLocalAgentAdapter,
  createScopedCommit,
  createWorkerRun,
  discoverWorkerCapabilities,
  hasRequiredSandboxCapabilities,
  publishAndVerify,
  recoverDisposableWorkspace,
  resolveExecutable,
  runMappedGates,
  runGit,
  safeRelativePath,
  staleRunDisposition,
  trackedSnapshot,
  transitionWorkerRun,
  validateWorkerResult,
  validateAdapterSpec,
  verifyWorkspace,
  filesystemSnapshot,
  changedSnapshotPaths,
  workerEnvironment,
  workerCapabilityAllowed,
  workerRetryAllowed,
  workerRequest,
};