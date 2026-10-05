"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const Ajv = require("ajv");
const minimatchModule = require("minimatch");
const minimatch = minimatchModule.minimatch || minimatchModule;

const PROJECT_SLUGS = { "chalwa.id": "chalwa", klodhost: "klodhost", "marketing-agency": "marketing-agency" };
const TRANSITIONS = {
  READY: ["PREPARING", "BLOCKED", "AWAITING_APPROVAL"],
  PREPARING: ["RUNNING", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  RUNNING: ["VALIDATING", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  VALIDATING: ["COMMITTING", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  COMMITTING: ["PUBLISHING", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  PUBLISHING: ["COMPLETED", "FAILED", "BLOCKED", "AWAITING_APPROVAL"],
  COMPLETED: [],
  BLOCKED: [],
  FAILED: [],
  AWAITING_APPROVAL: [],
};
const FAILURE_STATES = new Set(["BLOCKED", "FAILED", "AWAITING_APPROVAL"]);
const BLOCKED_ACTIONS = new Set([
  "production-deploy", "production-change", "production-configuration-change", "real-payment", "real-billing-charge",
  "real-provider", "real-provider-action", "real-node-provisioning", "outbound-message", "real-whatsapp-outbound",
  "real-email-outbound", "real-sms-outbound", "destructive-migration", "destructive-database-migration",
  "credential-rotation", "credential-or-key-rotation", "dns-change", "dns-or-domain-change", "go-live", "force-push",
  "production-data-deletion", "readiness-promotion", "cross-project-architecture", "cross-project-architecture-change-without-approval",
]);
const ALLOWED_GATE_TYPES = new Set(["command", "file_exists", "file_contains", "test_name", "route_exists", "api_contract", "schema_assertion", "git_diff_check"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function projectSlug(projectId) {
  if (!PROJECT_SLUGS[projectId]) throw new Error(`Unsupported AX-06 project: ${projectId}`);
  return PROJECT_SLUGS[projectId];
}

function taskBranchName(projectId, taskId) {
  return `ax06/${projectSlug(projectId)}/${taskId}`;
}

function worktreePath(projectId, taskId, root = "/home/afuzaid/engineering/worktrees/ax06-execution") {
  return path.join(root, projectSlug(projectId), taskId);
}

function createExecutionSpec({ lane, authorization, backlog, task, descriptor, startingSha, executionId = crypto.randomUUID(), sourceBranch }) {
  const taskIndex = backlog.tasks.findIndex((item) => item.id === task.id);
  const acceptanceCriteria = task.acceptance_criteria || [];
  const acceptanceGateMap = descriptor.acceptance_gate_map || [];
  const acceptanceGates = descriptor.acceptance_gates || {};
  const verificationGateMap = descriptor.verification_gate_map || {};
  return {
    schema_version: 1,
    execution_id: executionId,
    project_id: lane.id,
    approval_id: authorization.approval_id,
    task_id: task.id,
    task_title: task.title,
    objective: task.objective,
    repo_path: lane.repository,
    source_branch: sourceBranch,
    task_branch: taskBranchName(lane.id, task.id),
    workspace_path: worktreePath(lane.id, task.id),
    starting_sha: startingSha,
    task_state: task.status,
    approval_required: task.approval_boundary_triggered === true || task.requires_approval === true,
    dependencies: task.dependencies || [],
    acceptance_criteria: [...acceptanceCriteria],
    acceptance_gate_map: acceptanceGateMap.map((gateIds, index) => ({ criterion: acceptanceCriteria[index], gate_ids: [...gateIds] })),
    acceptance_gates: structuredClone(acceptanceGates),
    verification_gates: [...(task.verification_gates || [])],
    verification_gate_map: structuredClone(verificationGateMap),
    generic_quality_gates: ["lint", "typecheck", "test", "build", "git_diff_check"],
    allowed_paths: [...descriptor.allowed_paths],
    forbidden_paths: [...descriptor.forbidden_paths],
    autonomous_actions_allowed: [...(task.autonomous_actions_allowed || [])],
    approval_boundaries: [...(task.approval_boundaries || [])],
    sensitive_boundaries_triggered: [...(task.triggered_approval_boundaries || [])],
    staging_validation: {
      staging_url: lane.staging_url,
      health_url: lane.health_url,
      ready_url: lane.ready_url,
      required_mode_markers: lane.required_mode_markers,
      forbidden_live_markers: lane.forbidden_live_markers,
      deployment_enabled: false,
    },
    production_forbidden: true,
    generic_gate_definitions: structuredClone(descriptor.generic_quality_gates),
    task_index: taskIndex,
    source_of_truth: backlog.source_of_truth === true,
    execution_mode: backlog.execution_mode,
  };
}

function validateGateDefinition(gate) {
  if (!gate || !ALLOWED_GATE_TYPES.has(gate.type)) return false;
  if (gate.type === "command") {
    if (gate.command !== "npm" || !Array.isArray(gate.args)) return false;
    return (gate.args[0] === "run" && ["lint", "typecheck", "build"].includes(gate.args[1]) && gate.args.length === 2) ||
      (gate.args[0] === "test" && gate.args.length === 3 && gate.args[1] === "--" && gate.args[2] === "--run");
  }
  if (["file_exists", "file_contains", "test_name", "schema_assertion"].includes(gate.type)) {
    if (typeof gate.file !== "string" || path.isAbsolute(gate.file) || gate.file.split(/[\\/]/).includes("..")) return false;
  }
  if (gate.type === "file_contains" && typeof gate.value !== "string") return false;
  if (gate.type === "test_name" && (typeof gate.name !== "string" || !gate.name.trim())) return false;
  if (gate.type === "route_exists" || gate.type === "api_contract") {
    if (!gate.path?.startsWith("/") || gate.path.startsWith("//")) return false;
    if (gate.type === "api_contract" && gate.method !== "GET") return false;
  }
  if (gate.type === "schema_assertion" && (!gate.schema || typeof gate.schema !== "object")) return false;
  return true;
}

function validateExecutionSpec(spec) {
  const blockers = [];
  if (!spec.execution_id || !spec.project_id || !spec.approval_id || !spec.task_id || !spec.starting_sha) blockers.push("INCOMPLETE_TASK_SPEC");
  if (spec.task_state !== "READY") blockers.push("TASK_NOT_READY");
  if (spec.approval_required) blockers.push("APPROVAL_REQUIRED");
  if (spec.production_forbidden !== true || spec.staging_validation?.deployment_enabled !== false) blockers.push("PRODUCTION_OR_DEPLOYMENT_POLICY_INVALID");
  if (spec.acceptance_gate_map.length !== spec.acceptance_criteria.length || spec.acceptance_gate_map.some((entry) => !entry.gate_ids?.length)) blockers.push("UNMAPPED_ACCEPTANCE_GATE");
  const definitions = { ...spec.generic_gate_definitions, ...spec.acceptance_gates, ...spec.verification_gate_map };
  for (const entry of spec.acceptance_gate_map) {
    for (const gateId of entry.gate_ids) if (!validateGateDefinition(definitions[gateId])) blockers.push(`INVALID_ACCEPTANCE_GATE:${gateId}`);
  }
  const generic = new Set(spec.generic_quality_gates);
  for (const name of ["lint", "typecheck", "test", "build", "git_diff_check"]) {
    if (!generic.has(name) || !validateGateDefinition(spec.generic_gate_definitions?.[name])) blockers.push(`UNMAPPED_GENERIC_GATE:${name}`);
  }
  for (const name of spec.verification_gates) {
    if (!generic.has(name) && !validateGateDefinition(spec.verification_gate_map[name])) blockers.push(`UNMAPPED_VERIFICATION_GATE:${name}`);
  }
  for (const action of spec.autonomous_actions_allowed) {
    if (BLOCKED_ACTIONS.has(action)) blockers.push(`SENSITIVE_ACTION:${action}`);
  }
  if (spec.sensitive_boundaries_triggered.length) blockers.push("APPROVAL_BOUNDARY_TRIGGERED");
  return [...new Set(blockers)];
}

function pathAllowed(changedPath, allowedPaths, forbiddenPaths) {
  if (typeof changedPath !== "string" || !changedPath || path.isAbsolute(changedPath) || changedPath.includes("\\")) return false;
  const normalized = path.posix.normalize(changedPath);
  if (normalized === ".." || normalized.startsWith("../") || normalized.split("/").includes("..")) return false;
  if (forbiddenPaths.some((pattern) => minimatch(normalized, pattern, { dot: true, matchBase: false }))) return false;
  return allowedPaths.some((pattern) => minimatch(normalized, pattern, { dot: true, matchBase: false }));
}

function enforcePathScope(changedPaths, allowedPaths, forbiddenPaths) {
  return changedPaths.filter((changedPath) => !pathAllowed(changedPath, allowedPaths, forbiddenPaths));
}

function transitionRun(run, nextState, now = new Date().toISOString()) {
  if (!TRANSITIONS[run.status]?.includes(nextState)) throw new Error(`Invalid execution transition ${run.status} -> ${nextState}`);
  if (nextState === "PREPARING") run.started_at = now;
  run.status = nextState;
  run.transitions.push({ state: nextState, at: now });
  if (["COMPLETED", ...FAILURE_STATES].includes(nextState)) run.completed_at = now;
  return run;
}

function createExecutionRun(spec, now = new Date().toISOString()) {
  return {
    schema_version: 1,
    execution_id: spec.execution_id,
    project_id: spec.project_id,
    task_id: spec.task_id,
    status: "READY",
    simulation: true,
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
    checks: {},
  };
}

function failureState(error) {
  const safety = error?.safety === true || /APPROVAL|PRODUCTION|PATH_SCOPE|DIRTY|REMOTE|SOURCE_BRANCH|DEPENDENC|UNMAPPED/i.test(error?.message || "");
  return { status: safety ? (error?.approval ? "AWAITING_APPROVAL" : "BLOCKED") : "FAILED", retryable: !safety };
}

function retryAllowed(run, maximumAttempts = 2) {
  return run.status === "FAILED" && run.retryable === true && run.attempt < maximumAttempts;
}

function canCompleteTask(result) {
  return Boolean(result.worker_succeeded && result.path_scope_passed && result.task_gates_passed &&
    result.generic_gates_passed && result.staging_safety_passed && result.commit_created && result.push_succeeded &&
    result.result_sha && result.result_sha === result.remote_result_sha && result.evidence_persisted &&
    result.production_untouched === true && result.approval_required === false &&
    result.force_push === false && result.merge_to_main === false);
}

function runGit(repo, args, runner = spawnSync) {
  const gitArgs = ["-c", `safe.directory=${repo}`, "-C", repo, ...args];
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    return runner("runuser", ["-u", "afuzaid", "--", "env", "HOME=/home/afuzaid", "git", ...gitArgs], { cwd: repo, encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024 });
  }
  return runner("git", gitArgs, { cwd: repo, encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024 });
}

function inspectSourceRepository(lane, sourceBranch, contract, runner = spawnSync, taskWorkspace = {}) {
  const repo = lane.repository;
  const run = (args) => runGit(repo, args, runner);
  const status = run(["status", "--porcelain=v1", "--untracked-files=all"]);
  const currentBranch = run(["branch", "--show-current"]);
  const sourceRef = run(["rev-parse", "--verify", `refs/heads/${sourceBranch}`]);
  const origin = run(["remote", "get-url", "origin"]);
  const remoteRef = run(["ls-remote", "origin", `refs/heads/${sourceBranch}`]);
  const sourceSha = sourceRef.status === 0 ? sourceRef.stdout.trim() : null;
  const remoteSha = remoteRef.status === 0 ? remoteRef.stdout.trim().split(/\s+/)[0] || null : null;
  const expectedOrigin = contract.remote_urls?.[lane.id];
  const checks = {
    clean: status.status === 0 && status.stdout.trim() === "",
    source_branch_checked_out: currentBranch.status === 0 && currentBranch.stdout.trim() === sourceBranch,
    source_branch_exists: sourceRef.status === 0,
    origin_matches: origin.status === 0 && origin.stdout.trim() === expectedOrigin,
    origin_reachable: remoteRef.status === 0 && Boolean(remoteSha),
    source_sha_matches_remote: Boolean(sourceSha && remoteSha && sourceSha === remoteSha),
  };
  if (taskWorkspace.taskBranch) {
    const localTaskBranch = run(["show-ref", "--verify", "--quiet", `refs/heads/${taskWorkspace.taskBranch}`]);
    const remoteTaskBranch = run(["ls-remote", "origin", `refs/heads/${taskWorkspace.taskBranch}`]);
    checks.task_branch_available = localTaskBranch.status === 1 && remoteTaskBranch.status === 0 && remoteTaskBranch.stdout.trim() === "";
    checks.task_worktree_available = !fs.existsSync(taskWorkspace.workspacePath);
  }
  return { checks, source_sha: sourceSha, remote_sha: remoteSha, current_branch: currentBranch.stdout?.trim() || null };
}

function buildExecutionPlan({ lane, authorization, backlog, contract, repoCheck, stagingCheck, executionId }) {
  const selection = require("./delivery-orchestrator.cjs").selectNextTask(lane, { authorization, backlog });
  const task = backlog?.tasks?.find((item) => item.id === selection.task);
  const descriptor = contract.tasks?.[selection.task];
  const blockers = [];
  if (selection.status !== "READY" || !task) blockers.push(selection.blocker || `TASK_${selection.status}`);
  if (!authorization || authorization.status !== "APPROVED" || authorization.approval_id !== "AX-06" || !authorization.authorization_constraints?.production_untouched) blockers.push("AUTHORIZATION_INVALID");
  if (!descriptor || descriptor.project_id !== lane.id) blockers.push("TASK_CONTRACT_MISSING");
  if (repoCheck) {
    for (const [name, passed] of Object.entries(repoCheck.checks)) if (!passed) blockers.push(`REPOSITORY_PREFLIGHT:${name}`);
  }
  if (stagingCheck && stagingCheck.status !== "READY") blockers.push(`STAGING_SAFETY:${stagingCheck.status}`);
  if (contract.worker_provider !== "fake") blockers.push("UNSUPPORTED_WORKER_PROVIDER");
  if (descriptor && task) {
    const spec = createExecutionSpec({
      lane,
      authorization,
      backlog,
      task,
      descriptor: { ...descriptor, generic_quality_gates: contract.generic_quality_gates, forbidden_paths: contract.forbidden_paths },
      startingSha: repoCheck?.source_sha || "unavailable",
      sourceBranch: contract.source_branches[lane.id],
      executionId,
    });
    blockers.push(...validateExecutionSpec(spec));
    return { selection, spec, blockers: [...new Set(blockers)], staging_check: stagingCheck || null };
  }
  return { selection, spec: null, blockers: [...new Set(blockers)], staging_check: stagingCheck || null };
}

function createFakeWorker() {
  return {
    provider: "fake",
    async prepare(taskSpec) {
      return { workspace_path: taskSpec.workspace_path, created: false, detail: "Workspace plan only; no git worktree was created." };
    },
    async execute() {
      return { changed_paths: [], source_mutation: false, detail: "Fake worker made no app source changes." };
    },
    async validate(spec) {
      return { contract_valid: validateExecutionSpec(spec).length === 0, gates_executed: false, detail: "Gate definitions validated; real app gates were not run." };
    },
    async commit(spec) {
      return { created: false, sha: spec.starting_sha, detail: "Commit simulated; no Git commit was created." };
    },
    async publish(spec) {
      return { pushed: false, sha: spec.starting_sha, detail: "Publish simulated; no network operation was performed." };
    },
    async finalize(spec) {
      return { task_completed: false, result_sha: spec.starting_sha };
    },
  };
}

async function simulateLifecycle(spec, worker = createFakeWorker(), options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const run = createExecutionRun(spec, now());
  let lastSuccessfulState = "READY";
  const phases = [
    ["PREPARING", "prepare"], ["RUNNING", "execute"], ["VALIDATING", "validate"],
    ["COMMITTING", "commit"], ["PUBLISHING", "publish"],
  ];
  try {
    if (worker.provider !== "fake") throw Object.assign(new Error("Only fake worker provider is enabled"), { safety: true });
    if (validateExecutionSpec(spec).length) throw Object.assign(new Error(validateExecutionSpec(spec).join(",")), { safety: true });
    for (const [state, method] of phases) {
      transitionRun(run, state, now());
      if (options.failAt === state) throw new Error(`Simulated failure at ${state}`);
      run.checks[method] = await worker[method](spec);
      lastSuccessfulState = state;
    }
    if (run.checks.execute.changed_paths?.length) {
      const rejected = enforcePathScope(run.checks.execute.changed_paths, spec.allowed_paths, spec.forbidden_paths);
      if (rejected.length) throw Object.assign(new Error(`PATH_SCOPE_VIOLATION:${rejected.join(",")}`), { safety: true });
    }
    const final = await worker.finalize(spec);
    run.result_sha = final.result_sha || spec.starting_sha;
    run.task_completed = final.task_completed === true && worker.provider !== "fake";
    transitionRun(run, "COMPLETED", now());
    run.retryable = false;
    return run;
  } catch (error) {
    const failure = failureState(error);
    run.failure_reason = error.message;
    run.resume_from = lastSuccessfulState;
    run.retryable = failure.retryable;
    transitionRun(run, failure.status, now());
    return run;
  }
}

function safeRepoPath(repo, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new Error(`Unsafe gate path: ${relativePath}`);
  }
  const target = path.resolve(repo, relativePath);
  if (!target.startsWith(`${path.resolve(repo)}${path.sep}`)) throw new Error(`Unsafe gate path: ${relativePath}`);
  return target;
}

async function executeGate(repo, name, definition, context = {}, runner = spawnSync) {
  if (!validateGateDefinition(definition)) return { name, status: "FAIL", detail: "Invalid or unsupported gate definition" };
  try {
    if (definition.type === "command") {
      const allowed = Object.values(context.genericQualityGates || {}).some((candidate) =>
        candidate.command === definition.command && JSON.stringify(candidate.args) === JSON.stringify(definition.args));
      if (!allowed) return { name, status: "FAIL", detail: "Command is not in the approved generic gate registry" };
      const result = runner(definition.command, definition.args, { cwd: repo, encoding: "utf8", timeout: context.timeout || 300000, maxBuffer: 4 * 1024 * 1024, shell: false, env: context.env || process.env });
      return { name, status: result.status === 0 ? "PASS" : "FAIL", detail: result.status === 0 ? `${definition.command} ${definition.args.join(" ")} passed` : (result.stderr || result.stdout || `exit ${result.status}`).trim() };
    }
    if (definition.type === "git_diff_check") {
      const result = runGit(repo, ["diff", "--check"], runner);
      return { name, status: result.status === 0 ? "PASS" : "FAIL", detail: result.status === 0 ? "git diff --check passed" : result.stderr.trim() };
    }
    if (definition.type === "file_exists") {
      const passed = fs.existsSync(safeRepoPath(repo, definition.file));
      return { name, status: passed ? "PASS" : "FAIL", detail: passed ? `${definition.file} exists` : `${definition.file} is missing` };
    }
    if (definition.type === "file_contains") {
      const contents = fs.readFileSync(safeRepoPath(repo, definition.file), "utf8");
      const passed = definition.regex ? new RegExp(definition.value).test(contents) : contents.includes(definition.value);
      return { name, status: passed ? "PASS" : "FAIL", detail: passed ? `${definition.file} contains the required marker` : `${definition.file} is missing the required marker` };
    }
    if (definition.type === "test_name") {
      const args = ["test", "--", "--run", definition.file, "-t", definition.name];
      const result = runner("npm", args, { cwd: repo, encoding: "utf8", timeout: context.timeout || 300000, maxBuffer: 4 * 1024 * 1024, shell: false, env: context.env || process.env });
      return { name, status: result.status === 0 ? "PASS" : "FAIL", detail: result.status === 0 ? `test passed: ${definition.name}` : (result.stderr || result.stdout || `exit ${result.status}`).trim() };
    }
    if (definition.type === "route_exists" || definition.type === "api_contract") {
      const base = context.stagingValidation?.[definition.endpoint];
      if (!base) return { name, status: "FAIL", detail: `Unknown read-only staging endpoint: ${definition.endpoint}` };
      const response = await fetch(new URL(definition.path, base), { method: "GET", redirect: "error", signal: AbortSignal.timeout(context.timeout || 12000) });
      const passed = response.status === definition.status;
      return { name, status: passed ? "PASS" : "FAIL", detail: `HTTP ${response.status}; expected ${definition.status}` };
    }
    if (definition.type === "schema_assertion") {
      const value = JSON.parse(fs.readFileSync(safeRepoPath(repo, definition.file), "utf8"));
      const ajv = new Ajv({ allErrors: true, schemaId: "auto" });
      const passed = ajv.validate(definition.schema, value);
      return { name, status: passed ? "PASS" : "FAIL", detail: passed ? `${definition.file} satisfies the declared schema` : ajv.errorsText() };
    }
    return { name, status: "FAIL", detail: `Gate type is not executable: ${definition.type}` };
  } catch (error) {
    return { name, status: "FAIL", detail: error.message };
  }
}

async function persistExecutionRun(deliveryRoot, run) {
  const { withCanonicalLock } = require("./delivery-orchestrator.cjs");
  return withCanonicalLock(path.join(deliveryRoot, ".canonical-write.lock"), async () => {
    const schema = readJson(path.join(deliveryRoot, "schemas", "execution-run.schema.json"));
    const ajv = new Ajv({ allErrors: true, schemaId: "auto" });
    const evidenceDirectory = path.join(deliveryRoot, "execution-evidence", run.project_id);
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    const evidencePath = path.join(evidenceDirectory, `${run.execution_id}.json`);
    run.evidence_path = path.relative(path.dirname(deliveryRoot), evidencePath);
    if (!ajv.validate(schema, run)) throw new Error(`Execution run schema failed: ${ajv.errorsText()}`);
    fs.writeFileSync(evidencePath, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    const stateDirectory = path.join(deliveryRoot, "execution-state");
    fs.mkdirSync(stateDirectory, { recursive: true });
    fs.writeFileSync(path.join(stateDirectory, `${run.project_id}.json`), `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
    return run;
  });
}

function listExecutionGateDefinitions(spec) {
  return { ...spec.generic_gate_definitions, ...spec.acceptance_gates, ...spec.verification_gate_map };
}

function getExecutionState(deliveryRoot, projectId) {
  const file = path.join(deliveryRoot, "execution-state", `${projectId}.json`);
  return fs.existsSync(file) ? readJson(file) : null;
}

function inspectUntrackedTaskStatus(repo) {
  const result = runGit(repo, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return result.status === 0 ? result.stdout : null;
}

module.exports = {
  ALLOWED_GATE_TYPES,
  BLOCKED_ACTIONS,
  FAILURE_STATES,
  TRANSITIONS,
  buildExecutionPlan,
  canCompleteTask,
  createExecutionRun,
  createExecutionSpec,
  createFakeWorker,
  executeGate,
  enforcePathScope,
  failureState,
  getExecutionState,
  inspectSourceRepository,
  inspectUntrackedTaskStatus,
  listExecutionGateDefinitions,
  pathAllowed,
  persistExecutionRun,
  projectSlug,
  retryAllowed,
  runGit,
  simulateLifecycle,
  taskBranchName,
  transitionRun,
  validateExecutionSpec,
  validateGateDefinition,
  worktreePath,
};