"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv");
const execution = require("./execution-contract.cjs");

const PROVIDERS = ["fake", "remote-codex"];
const WORKER_LIFECYCLE = ["RECEIVED", "PREPARING", "SANDBOX_READY", "WORKER_RUNNING", "VALIDATING", "PUBLISHING", "RESULT_READY"];
const CONTROL_LIFECYCLE = ["READY", "DISPATCHING", "RESULT_RECEIVED", "VERIFYING", "COMPLETED"];
const DEFAULT_LIMITS = { timeout_seconds: 1800, memory_mb: 4096, cpu_quota_percent: 200, pids: 256, retry_count: 0 };
const REQUEST_SCHEMA = path.resolve(__dirname, "../.afuzactl/delivery/schemas/remote-worker-request.schema.json");
const RESULT_SCHEMA = path.resolve(__dirname, "../.afuzactl/delivery/schemas/remote-worker-result.schema.json");

function schemaValidator(schemaPath) {
  return new Ajv({ allErrors: true, schemaId: "auto" }).compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
}

function validateRemoteRequest(request) {
  const validate = schemaValidator(REQUEST_SCHEMA);
  if (!validate(request)) return (validate.errors || []).map((error) => `REMOTE_REQUEST_SCHEMA:${error.instancePath || error.dataPath}:${error.keyword}`);
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/@]+:[^/@]+@/i.test(request.repository.clone_url)) return ["REMOTE_REQUEST_EMBEDDED_CREDENTIALS"];
  return [];
}

function createRemoteRequest(spec, cloneUrl, limits = DEFAULT_LIMITS) {
  return {
    schema_version: 1,
    execution_id: spec.execution_id,
    project_id: spec.project_id,
    task_id: spec.task_id,
    approval_id: spec.approval_id,
    repository: {
      clone_url: cloneUrl,
      source_branch: spec.source_branch,
      starting_sha: spec.starting_sha,
      task_branch: spec.task_branch,
    },
    workspace: {
      disposable: true,
      mount_point: "/workspace",
      allowed_paths: [...spec.allowed_paths],
      forbidden_paths: [...spec.forbidden_paths],
    },
    worker: { provider: "codex", sandbox_required: true, runtime_target: "rootless-podman" },
    task: {
      objective: spec.objective,
      acceptance_criteria: [...spec.acceptance_criteria],
      verification_gates: structuredClone(spec.verification_gate_map || {}),
    },
    limits: { ...DEFAULT_LIMITS, ...limits },
    security: {
      production_forbidden: true,
      secrets_policy: "no-task-secrets; dedicated-worker-identity-only",
      network_policy: "outbound-https-via-restricted-egress; deny-inbound; deny-private-ranges",
      allowed_git_operations: ["fetch-source-branch", "create-task-branch", "push-task-branch"],
      credential_profiles: {
        git: "dedicated-repo-scoped-worker-identity",
        codex: "worker-host-local-codex-auth",
        control_plane: "short-lived-signed-request-and-result",
      },
    },
  };
}

function validateRemoteResult(result, expected, actualChangedPaths, options = {}) {
  const errors = [];
  const validate = schemaValidator(RESULT_SCHEMA);
  if (!validate(result)) errors.push(...(validate.errors || []).map((error) => `REMOTE_RESULT_SCHEMA:${error.instancePath || error.dataPath}:${error.keyword}`));
  if (!result || typeof result !== "object" || Array.isArray(result)) return [...new Set(errors.length ? errors : ["REMOTE_RESULT_INVALID"])];
  for (const key of ["execution_id", "provider", "starting_sha"]) {
    if (result[key] !== expected[key]) errors.push(`REMOTE_RESULT_MISMATCH:${key}`);
  }
  if (result.worker_id !== expected.worker_id) errors.push("FOREIGN_WORKER_ID");
  if (options.seenExecutionIds?.includes(result.execution_id)) errors.push("STALE_OR_REPLAYED_EXECUTION_ID");
  if (expected.result_sha && result.result_sha !== expected.result_sha) errors.push("RESULT_SHA_MISMATCH");
  if (result.sandbox_attestation?.starting_sha !== expected.starting_sha) errors.push("ATTESTATION_STARTING_SHA_MISMATCH");
  if (result.sandbox_attestation?.sandbox_active !== true) errors.push("SANDBOX_NOT_ATTESTED");
  if (result.sandbox_attestation?.uid !== expected.worker_uid || !Number.isInteger(expected.worker_uid) || expected.worker_uid < 1) errors.push("WORKER_UID_MISMATCH");
  if (result.sandbox_attestation?.workspace !== "/workspace") errors.push("WORKSPACE_ATTESTATION_MISMATCH");
  for (const key of ["forbidden_paths_excluded", "forbidden_capabilities_absent", "production_excluded", "timeout_enforced"]) {
    if (result.sandbox_attestation?.[key] !== true) errors.push(`SANDBOX_ATTESTATION_FAILED:${key}`);
  }
  for (const key of ["cap_drop_all", "no_new_privileges", "readonly_rootfs", "tmpfs_tmp", "inbound_denied", "private_ranges_denied"]) {
    if (result.sandbox_attestation?.[key] !== true) errors.push(`SANDBOX_POLICY_FAILED:${key}`);
  }
  for (const key of ["privileged", "host_pid", "host_network"]) {
    if (result.sandbox_attestation?.[key] !== false) errors.push(`SANDBOX_POLICY_FAILED:${key}`);
  }
  if (JSON.stringify(result.sandbox_attestation?.writable_mounts) !== JSON.stringify(["/workspace"])) errors.push("SANDBOX_WRITABLE_MOUNTS_INVALID");
  for (const key of ["memory_mb", "cpu_quota_percent", "pids"]) {
    if (expected.resource_policy && result.sandbox_attestation?.resource_policy?.[key] !== expected.resource_policy[key]) {
      errors.push(`SANDBOX_RESOURCE_POLICY_MISMATCH:${key}`);
    }
  }
  if (expected.image_digest && result.sandbox_attestation?.runtime?.image_digest !== expected.image_digest) errors.push("SANDBOX_IMAGE_DIGEST_MISMATCH");
  if (result.git_publication?.branch !== expected.task_branch || result.git_publication?.target_branch !== expected.task_branch) errors.push("FORBIDDEN_BRANCH_PUBLICATION");
  if (result.git_publication?.pushed !== true) errors.push("TASK_BRANCH_NOT_PUBLISHED");
  if (result.git_publication?.force_pushed === true) errors.push("FORCE_PUSH_FORBIDDEN");
  if (result.git_publication?.merged === true) errors.push("WORKER_MERGE_FORBIDDEN");
  if (result.requested_approval === true) errors.push("AWAITING_APPROVAL");
  if (result.worker_exit_code !== 0 || result.failure_reason !== null) errors.push("REMOTE_WORKER_FAILED");
  if (result.gate_results && Object.values(result.gate_results).some((status) => status !== "PASS")) errors.push("REMOTE_GATES_FAILED");
  if (Array.isArray(result.changed_paths)) {
    const sortedReported = [...result.changed_paths].sort();
    const sortedActual = [...(actualChangedPaths || [])].sort();
    if (JSON.stringify(sortedReported) !== JSON.stringify(sortedActual)) errors.push("REMOTE_CHANGED_PATHS_UNTRUSTED");
    if (result.changed_paths.some((changedPath) => !execution.pathAllowed(changedPath, expected.allowed_paths || [], expected.forbidden_paths || []))) {
      errors.push("FORBIDDEN_CHANGED_PATHS");
    }
  }
  return [...new Set(errors)];
}

function verifyFetchedResult(repository, expected, runner) {
  const errors = [];
  if (!/^ax06\/(chalwa|klodhost|marketing-agency)\/(CHW|KLO|MKT)-06-[0-9]{2}$/.test(expected.task_branch || "")) {
    return { valid: false, errors: ["FORBIDDEN_BRANCH_PUBLICATION"], result_sha: null, changed_paths: [] };
  }
  const reference = `refs/remotes/ax06-worker/${expected.task_branch}`;
  const run = (args) => execution.runGit(repository, args, runner);
  const refResult = run(["rev-parse", "--verify", reference]);
  const resultSha = refResult.status === 0 ? refResult.stdout.trim() : null;
  if (!resultSha) errors.push("FETCHED_TASK_REF_MISSING");
  if (expected.result_sha && resultSha !== expected.result_sha) errors.push("RESULT_SHA_MISMATCH");
  const ancestry = resultSha ? run(["merge-base", "--is-ancestor", expected.starting_sha, resultSha]) : { status: 1 };
  if (ancestry.status !== 0) errors.push("RESULT_NOT_DESCENDANT_OF_STARTING_SHA");
  const diff = resultSha ? run(["diff", "--name-only", "-z", expected.starting_sha, resultSha]) : { status: 1, stdout: "" };
  if (diff.status !== 0) errors.push("RESULT_DIFF_UNAVAILABLE");
  const changedPaths = diff.status === 0 ? diff.stdout.split("\0").filter(Boolean) : [];
  if (changedPaths.some((changedPath) => !execution.pathAllowed(changedPath, expected.allowed_paths || [], expected.forbidden_paths || []))) {
    errors.push("FORBIDDEN_CHANGED_PATHS");
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], result_sha: resultSha, changed_paths: changedPaths };
}

function remoteWorkerPlanState(contract) {
  const provider = contract.worker_provider || "fake";
  return {
    configured_provider: provider,
    candidate_provider: null,
    dispatch_enabled: false,
    remote_worker_enabled: false,
    supported_provider_ids: PROVIDERS,
    worker_runtime_target: "rootless-podman",
    control_lifecycle: CONTROL_LIFECYCLE,
    worker_lifecycle: WORKER_LIFECYCLE,
  };
}

module.exports = {
  CONTROL_LIFECYCLE,
  DEFAULT_LIMITS,
  PROVIDERS,
  WORKER_LIFECYCLE,
  createRemoteRequest,
  remoteWorkerPlanState,
  validateRemoteRequest,
  validateRemoteResult,
  verifyFetchedResult,
};