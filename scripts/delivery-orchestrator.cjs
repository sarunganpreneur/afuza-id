"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const Ajv = require("ajv");

const PROJECTS = ["chalwa.id", "klodhost", "marketing-agency"];
const PROJECT_ALIASES = { chalwa: "chalwa.id" };
const BLOCKED_ACTIONS = new Set([
  "production-change", "real-payment", "real-provider", "outbound-message",
  "destructive-migration", "credential-rotation", "dns-change",
  "cross-project-architecture", "readiness-promotion", "go-live",
  "force-push", "production-data-deletion",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function discoverLanes(registry) {
  if (!registry || !Array.isArray(registry.lanes)) throw new Error("Invalid delivery lane registry");
  const ids = registry.lanes.map((lane) => lane.id);
  if (new Set(ids).size !== ids.length || PROJECTS.some((id) => !ids.includes(id)) || ids.length !== PROJECTS.length) {
    throw new Error("Delivery lane registry must contain exactly the three authorized projects");
  }
  return registry.lanes;
}

function selectNextTask(lane, sources = {}) {
  const authorization = sources.authorization;
  const backlog = sources.backlog;
  if (!authorization || authorization.status !== "APPROVED" || !authorization.decision_id ||
      !authorization.approving_authority || !backlog || backlog.approval_id !== authorization.decision_id ||
      backlog.project_id !== lane.id || !Array.isArray(backlog.tasks) || backlog.tasks.length === 0) {
    return {
      status: "AWAITING_APPROVAL",
      task: "AX-06 milestone selection",
      blocker: `Approved AX-06 milestone/backlog missing: ${lane.next_task_source}`,
      approval_required: true,
    };
  }
  const candidate = backlog.tasks.find((task) => ["PLANNED", "READY"].includes(task.status));
  if (!candidate) return { status: "COMPLETED", task: "No eligible task", blocker: null, approval_required: false };
  return { status: candidate.status, task: candidate.id, blocker: null, approval_required: false };
}

function authorizeAction(action) {
  return BLOCKED_ACTIONS.has(action)
    ? { allowed: false, status: "BLOCKED", approval_required: true, blocker: `Approval boundary: ${action}` }
    : { allowed: true, status: "READY", approval_required: false, blocker: null };
}

function classifyChecks(checks) {
  const entries = Object.entries(checks).filter(([name]) => name !== "milestone");
  const failed = entries.filter(([, result]) => result.status !== "PASS");
  if (!failed.length) return "AWAITING_APPROVAL";
  if (failed.some(([name]) => ["health", "ready", "service", "listener", "production", "fake_mode", "secret_scan", "canonical_secret_scan", "git_clean", "diff_check"].includes(name))) return "FAILED";
  return "BLOCKED";
}

function command(commandName, args, cwd, timeout = 15000) {
  return spawnSync(commandName, args, { cwd, encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
}

function git(repo, args) {
  return command("git", ["-c", `safe.directory=${repo}`, "-C", repo, ...args], repo);
}

function systemdSnapshot(service) {
  const result = command("systemctl", ["show", service, "-p", "ActiveState", "-p", "MainPID", "-p", "ActiveEnterTimestamp", "-p", "FragmentPath", "-p", "DropInPaths", "--no-pager"], process.cwd());
  if (result.status !== 0) return null;
  return Object.fromEntries(result.stdout.trim().split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function productionIdentity() {
  const service = systemdSnapshot("afuza-id.service");
  if (!service || service.ActiveState !== "active" || !service.MainPID || !service.FragmentPath) return null;
  return service;
}

function check(name, passed, detail) {
  return { name, status: passed ? "PASS" : "FAIL", detail };
}

function checkTrackedSecrets(repo) {
  const files = git(repo, ["ls-files", "-z"]);
  if (files.status !== 0) return check("secret_scan", false, "Unable to enumerate tracked files");
  const suspiciousPath = files.stdout.split("\0").filter(Boolean).find((file) =>
    /(^|\/)(\.env$|[^/]+\.(pem|key|p12|pfx)$)|(^|\/)[^/]*secret[^/]*\.(json|txt)$/i.test(file));
  if (suspiciousPath) return check("secret_scan", false, `Secret-like tracked path: ${suspiciousPath}`);
  const content = git(repo, ["grep", "-I", "-n", "-E", "(-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]+)", "--", "."]);
  if (content.status === 0) return check("secret_scan", false, "Tracked content contains a private-key or live-secret pattern");
  if (content.status !== 1) return check("secret_scan", false, "Unable to scan tracked content");
  return check("secret_scan", true, "No tracked secret indicators");
}

function checkListener(port) {
  const result = command("ss", ["-ltnH"], process.cwd());
  if (result.status !== 0) return check("listener", false, "Unable to inspect listening sockets");
  const matches = result.stdout.split("\n").filter((line) => line.trim().split(/\s+/)[3]?.endsWith(`:${port}`));
  const loopbackOnly = matches.length > 0 && matches.every((line) => {
    const local = line.trim().split(/\s+/)[3];
    return local.startsWith(`127.0.0.1:${port}`) || local.startsWith(`[::1]:${port}`);
  });
  return check("listener", loopbackOnly, loopbackOnly ? `Port ${port} is loopback-only` : `Port ${port} is absent or not loopback-only`);
}

async function checkHttp(url, name) {
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(12000) });
    return check(name, response.status === 200, `HTTP ${response.status}`);
  } catch (error) {
    return check(name, false, `${error.name === "TimeoutError" ? "timeout" : "request failed"}: ${url}`);
  }
}

async function inspectLane(lane, options = {}) {
  const checks = {};
  const repo = lane.repository;
  const branchStatus = git(repo, ["status", "--porcelain=v1", "--untracked-files=normal"]);
  checks.git_clean = check("git_clean", branchStatus.status === 0 && branchStatus.stdout.trim() === "", branchStatus.status === 0 ? (branchStatus.stdout.trim() ? "Working tree is dirty" : "Working tree clean") : "Unable to read Git status");
  const head = git(repo, ["rev-parse", "HEAD"]);
  checks.app_head = check("app_head", head.status === 0 && /^[0-9a-f]{40}$/i.test(head.stdout.trim()), head.status === 0 ? head.stdout.trim() : "Unable to read HEAD");
  const diff = git(repo, ["diff", "--check"]);
  checks.diff_check = check("diff_check", diff.status === 0, diff.status === 0 ? "git diff --check passed" : "git diff --check failed");
  checks.secret_scan = checkTrackedSecrets(repo);
  if (options.canonicalRepo) {
    const canonicalSecrets = checkTrackedSecrets(options.canonicalRepo);
    checks.canonical_secret_scan = check("canonical_secret_scan", canonicalSecrets.status === "PASS", canonicalSecrets.detail);
  }

  let packageData;
  try { packageData = readJson(path.join(repo, "package.json")); } catch { packageData = null; }
  const scripts = packageData?.scripts || {};
  const requiredScripts = ["lint", "typecheck", "test", "build"];
  const npmAvailable = command("npm", ["--version"], repo).status === 0;
  checks.commands = check("commands", Boolean(packageData) && requiredScripts.every((name) => typeof scripts[name] === "string") && npmAvailable,
    packageData ? `${requiredScripts.map((name) => `${name}:${scripts[name] ? "available" : "missing"}`).join(", ")}; npm:${npmAvailable ? "available" : "missing"}` : "package.json unavailable");

  const service = systemdSnapshot(lane.staging_service);
  checks.service = check("service", service?.ActiveState === "active", service?.ActiveState || "Unable to inspect staging service");
  checks.health = await checkHttp(lane.health_url, "health");
  checks.ready = await checkHttp(lane.ready_url, "ready");
  checks.listener = checkListener(lane.port);

  try {
    const response = await fetch(lane.staging_url, { redirect: "error", signal: AbortSignal.timeout(12000) });
    const html = (await response.text()).toLowerCase();
    const missing = lane.required_mode_markers.filter((marker) => !html.includes(marker.toLowerCase()));
    const unsafe = lane.forbidden_live_markers.filter((marker) => html.includes(marker.toLowerCase()));
    checks.fake_mode = check("fake_mode", response.status === 200 && missing.length === 0 && unsafe.length === 0,
      response.status !== 200 ? `HTTP ${response.status}` : `missing=${missing.join(",") || "none"}; live-markers=${unsafe.join(",") || "none"}`);
  } catch (error) {
    checks.fake_mode = check("fake_mode", false, `${error.name === "TimeoutError" ? "timeout" : "request failed"}: staging page`);
  }

  const sourcePath = path.join(repo, lane.next_task_source);
  const authorizationPath = path.join(options.controlRoot || ".", "authorizations", "AX-06.json");
  let authorization = null;
  let backlog = null;
  try { authorization = readJson(authorizationPath); } catch { /* Missing approval is the expected initial state. */ }
  try { backlog = readJson(sourcePath); } catch { /* Missing backlog is the expected initial state. */ }
  const selection = selectNextTask(lane, { authorization, backlog });
  checks.milestone = check("milestone", selection.status !== "AWAITING_APPROVAL", selection.blocker || "Approved backlog available");

  const status = classifyChecks(checks);
  return {
    schema_version: 1,
    project_id: lane.id,
    task: selection.status === "AWAITING_APPROVAL" ? "AX-06 milestone selection" : selection.task,
    status: status === "AWAITING_APPROVAL" ? selection.status : status,
    approval_required: selection.approval_required || status !== "AWAITING_APPROVAL",
    updated_at: new Date().toISOString(),
    last_commit: checks.app_head.status === "PASS" ? checks.app_head.detail : null,
    test_result: "NOT_RUN (dry-run checks command availability only)",
    staging_status: [checks.service, checks.health, checks.ready, checks.listener].every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    checks,
    blocker: status === "AWAITING_APPROVAL" ? selection.blocker : Object.entries(checks).filter(([, value]) => value.status !== "PASS").map(([name, value]) => `${name}: ${value.detail}`).join("; "),
    next_action: status === "AWAITING_APPROVAL" ? "Create and approve AX-06 canonical authorization and lane backlog." : "Resolve failed preflight checks; do not deploy.",
    evidence_file: null,
  };
}

function createRunId(now = new Date()) {
  return `${now.toISOString().replace(/[:.]/g, "-")}-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
}

async function withCanonicalLock(lockPath, action) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Canonical delivery report/state write already in progress");
    throw error;
  }
  try {
    fs.writeFileSync(descriptor, `${process.pid}\n`);
    return await action();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lockPath);
  }
}

async function runIndependentLanes(lanes, runner, persist) {
  const results = await Promise.all(lanes.map((lane) => runner(lane)));
  await persist(results);
  return results;
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, content, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, filePath);
}

function markdownReport(state) {
  const rows = Object.values(state.lanes).map((lane) => `| ${lane.project_id} | ${lane.task} | ${lane.status} | ${lane.last_commit || "unknown"} | ${lane.test_result} | ${lane.staging_status} | ${lane.blocker || "None"} | ${lane.next_action} | ${lane.approval_required ? "Yes" : "No"} |`).join("\n");
  return `# AX-05F Autonomous Delivery\n\nUpdated: ${state.updated_at}\n\nNo source feature code, tests, builds, deploys, or restarts are run by dry-run.\n\n| Project | Task | Status | Last commit | Test result | Staging status | Blocker | Next action | Approval required |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n`;
}

async function persistResults(controlRoot, results, runId) {
  const deliveryRoot = path.join(controlRoot, "delivery");
  return withCanonicalLock(path.join(deliveryRoot, ".canonical-write.lock"), async () => {
    const ajv = new Ajv({ allErrors: true, format: "full" });
    const schema = readJson(path.join(deliveryRoot, "schemas", "task-state.schema.json"));
    const statePath = path.join(deliveryRoot, "state.json");
    const state = readJson(statePath);
    for (const result of results) {
      if (!ajv.validate(schema, result)) throw new Error(`Delivery state schema failed for ${result.project_id}: ${ajv.errorsText()}`);
      const evidencePath = path.join(deliveryRoot, "evidence", result.project_id, `${runId}.json`);
      result.evidence_file = path.relative(controlRoot, evidencePath);
      atomicWrite(evidencePath, `${JSON.stringify({ run_id: runId, mode: "DRY_RUN", ...result }, null, 2)}\n`);
      state.lanes[result.project_id] = result;
      atomicWrite(path.join(deliveryRoot, "lanes", `${result.project_id}.json`), `${JSON.stringify(result, null, 2)}\n`);
    }
    state.updated_at = new Date().toISOString();
    atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
    atomicWrite(path.join(deliveryRoot, "report.md"), markdownReport(state));
    return state;
  });
}

async function executeLane(lane, options) {
  const preProduction = productionIdentity();
  const pre = await inspectLane(lane, { controlRoot: options.deliveryRoot, canonicalRepo: options.canonicalRepo });
  const preProductionCheck = check("production", Boolean(preProduction), preProduction ? "afuza-id.service active identity captured" : "Production unit unavailable");
  pre.checks.production = preProductionCheck;
  pre.status = classifyChecks(pre.checks);
  if (pre.status !== "AWAITING_APPROVAL") {
    pre.approval_required = true;
    pre.blocker = Object.entries(pre.checks).filter(([, value]) => value.status !== "PASS").map(([name, value]) => `${name}: ${value.detail}`).join("; ");
    pre.next_action = "Resolve failed preflight checks; no source mutation or deployment was run.";
    pre.preflight = { checks: pre.checks, status: pre.status };
    pre.postflight = { status: "NOT_RUN", reason: "Stopped on preflight failure" };
    return pre;
  }
  const post = await inspectLane(lane, { controlRoot: options.deliveryRoot, canonicalRepo: options.canonicalRepo });
  const postProduction = productionIdentity();
  pre.checks.production = check("production", Boolean(preProduction && postProduction && JSON.stringify(preProduction) === JSON.stringify(postProduction)),
    preProduction && postProduction && JSON.stringify(preProduction) === JSON.stringify(postProduction) ? "afuza-id.service identity unchanged" : "Production unit unavailable or changed during dry-run");
  post.checks.production = pre.checks.production;
  post.status = classifyChecks(post.checks);
  post.approval_required = post.status === "AWAITING_APPROVAL" || post.status === "BLOCKED";
  post.preflight = { status: pre.status, checks: pre.checks };
  post.postflight = { status: post.status, checks: post.checks };
  post.checks.postflight = check("postflight", post.status === "AWAITING_APPROVAL", post.status === "AWAITING_APPROVAL" ? "Postflight checks passed" : `Postflight status ${post.status}`);
  if (post.status !== "AWAITING_APPROVAL") {
    post.blocker = Object.entries(post.checks).filter(([, value]) => value.status !== "PASS").map(([name, value]) => `${name}: ${value.detail}`).join("; ");
    post.next_action = "Resolve failed safety/preflight checks; no source mutation or deployment was run.";
  }
  return post;
}

async function runDryRun(lanes, projectId, options) {
  projectId = PROJECT_ALIASES[projectId] || projectId;
  if (projectId && !lanes.some((lane) => lane.id === projectId)) throw new Error(`Unknown delivery project: ${projectId}`);
  const selected = projectId ? lanes.filter((lane) => lane.id === projectId) : lanes;
  const runId = createRunId();
  const results = await runIndependentLanes(selected, (lane) => executeLane(lane, { ...options, canonicalRepo: options.canonicalRepo || options.controlRoot }),
    (values) => persistResults(options.controlRoot, values, runId));
  return { run_id: runId, results };
}

function loadLanes(deliveryRoot) {
  return discoverLanes(readJson(path.join(deliveryRoot, "lanes.json")));
}

function printTable(state) {
  for (const lane of Object.values(state.lanes)) {
    process.stdout.write(`${lane.project_id}\t${lane.status}\t${lane.staging_status}\t${lane.blocker || "None"}\n`);
  }
}

function loadState(deliveryRoot) {
  return readJson(path.join(deliveryRoot, "state.json"));
}

function validateAction(action) {
  return authorizeAction(action);
}

module.exports = {
  authorizeAction,
  classifyChecks,
  discoverLanes,
  executeLane,
  loadLanes,
  loadState,
  markdownReport,
  persistResults,
  printTable,
  runDryRun,
  runIndependentLanes,
  selectNextTask,
  validateAction,
  PROJECT_ALIASES,
  withCanonicalLock,
};
