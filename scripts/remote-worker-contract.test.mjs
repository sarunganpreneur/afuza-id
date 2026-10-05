import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import remote from "./remote-worker-contract.cjs";

const startingSha = "a".repeat(40);
const resultSha = "b".repeat(40);
const taskBranch = "ax06/chalwa/CHW-06-01";
const allowedPaths = ["src/catalog/**", "src/catalog.test.ts"];
const forbiddenPaths = ["**/.env*", "**/*.key", "../**", "/**"];

function makeSpec(overrides = {}) {
  return {
    execution_id: "remote-contract-test",
    project_id: "chalwa.id",
    task_id: "CHW-06-01",
    approval_id: "AX-06",
    source_branch: "feature/ax06-backlog-chalwa",
    starting_sha: startingSha,
    task_branch: taskBranch,
    allowed_paths: allowedPaths,
    forbidden_paths: forbiddenPaths,
    objective: "Add validated catalog types.",
    acceptance_criteria: ["Catalog fields are validated"],
    verification_gate_map: { "catalog-test": { type: "test_name", file: "src/catalog.test.ts", name: "validates fields" } },
    ...overrides,
  };
}

function makeRequest(overrides = {}) {
  return remote.createRemoteRequest(makeSpec(), "git@github.com:sarunganpreneur/chalwa.git", overrides);
}

function makeResult(overrides = {}) {
  return {
    schema_version: 1,
    execution_id: "remote-contract-test",
    worker_id: "afuza-worker-01",
    provider: "remote-codex",
    starting_sha: startingSha,
    result_sha: resultSha,
    changed_paths: ["src/catalog/model.ts"],
    worker_exit_code: 0,
    gate_results: { "catalog-test": "PASS" },
    sandbox_attestation: {
      sandbox_active: true,
      uid: 1001,
      workspace: "/workspace",
      starting_sha: startingSha,
      forbidden_paths_excluded: true,
      forbidden_capabilities_absent: true,
      production_excluded: true,
      privileged: false,
      host_pid: false,
      host_network: false,
      cap_drop_all: true,
      no_new_privileges: true,
      readonly_rootfs: true,
      writable_mounts: ["/workspace"],
      tmpfs_tmp: true,
      inbound_denied: true,
      private_ranges_denied: true,
      runtime: { name: "podman", mode: "rootless", image_digest: `sha256:${"c".repeat(64)}`, container_id: "container-fixture" },
      timeout_enforced: true,
      resource_policy: { memory_mb: 4096, cpu_quota_percent: 200, pids: 256 },
    },
    resource_usage: { elapsed_ms: 3000, peak_memory_mb: 512, cpu_seconds: 2, peak_pids: 12 },
    warnings: [],
    requested_approval: false,
    failure_reason: null,
    git_publication: { branch: taskBranch, pushed: true, force_pushed: false, merged: false, target_branch: taskBranch },
    ...overrides,
  };
}

function createResultRepository() {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "ax06-remote-result-"));
  const git = (args) => {
    const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
    return result.stdout.trim();
  };
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Remote Contract Test"]);
  git(["config", "user.email", "remote-contract@example.invalid"]);
  fs.mkdirSync(path.join(repository, "src", "catalog"), { recursive: true });
  fs.writeFileSync(path.join(repository, "src/catalog/model.ts"), "export const catalog = true;\n");
  git(["add", "."]);
  git(["commit", "-m", "starting"]);
  const base = git(["rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(repository, "src/catalog/model.ts"), "export const catalog = false;\n");
  git(["add", "."]);
  git(["commit", "-m", "worker result"]);
  const head = git(["rev-parse", "HEAD"]);
  git(["update-ref", `refs/remotes/ax06-worker/${taskBranch}`, head]);
  return { repository, base, head, cleanup: () => fs.rmSync(repository, { recursive: true, force: true }) };
}

const expected = {
  execution_id: "remote-contract-test",
  worker_id: "afuza-worker-01",
  provider: "remote-codex",
  starting_sha: startingSha,
  result_sha: resultSha,
  worker_uid: 1001,
  task_branch: taskBranch,
  allowed_paths: allowedPaths,
  forbidden_paths: forbiddenPaths,
  resource_policy: { memory_mb: 4096, cpu_quota_percent: 200, pids: 256 },
  image_digest: `sha256:${"c".repeat(64)}`,
};

describe("AX-06 remote worker contract", () => {
  it("accepts a schema-valid bounded request and result", () => {
    expect(remote.validateRemoteRequest(makeRequest())).toEqual([]);
    expect(remote.validateRemoteResult(makeResult(), expected, ["src/catalog/model.ts"])).toEqual([]);
  });

  it("rejects missing request fields and unsafe provider/runtime settings", () => {
    const request = makeRequest();
    delete request.approval_id;
    request.worker.sandbox_required = false;
    expect(remote.validateRemoteRequest(request).join(" ")).toMatch(/REMOTE_REQUEST_SCHEMA/);
  });

  it("rejects production credential material and credential-bearing clone URLs", () => {
    const request = makeRequest();
    request.repository.clone_url = "https://worker:token@example.invalid/repo.git";
    expect(remote.validateRemoteRequest(request)).toContain("REMOTE_REQUEST_EMBEDDED_CREDENTIALS");
    request.repository.clone_url = "git@github.com:sarunganpreneur/chalwa.git";
    request.security.production_ssh_key = "must-not-be-accepted";
    expect(remote.validateRemoteRequest(request).join(" ")).toMatch(/REMOTE_REQUEST_SCHEMA/);
    expect(makeRequest().security.credential_profiles.git).toBe("dedicated-repo-scoped-worker-identity");
    expect(JSON.stringify(makeRequest())).not.toMatch(/production[_-]?(ssh|token|credential)|af uza-core/i);
  });

  it("enforces the approved starting SHA in the result and attestation", () => {
    expect(remote.validateRemoteResult(makeResult({ starting_sha: "d".repeat(40) }), expected, ["src/catalog/model.ts"])).toContain("REMOTE_RESULT_MISMATCH:starting_sha");
    expect(remote.validateRemoteResult(makeResult({ sandbox_attestation: { ...makeResult().sandbox_attestation, starting_sha: "d".repeat(40) } }), expected, ["src/catalog/model.ts"])).toContain("ATTESTATION_STARTING_SHA_MISMATCH");
  });

  it("requires the control plane's independently observed result SHA", () => {
    expect(remote.validateRemoteResult(makeResult({ result_sha: "e".repeat(40) }), expected, ["src/catalog/model.ts"])).toContain("RESULT_SHA_MISMATCH");
  });

  it("independently verifies the fetched task ref SHA, ancestry, and changed paths", () => {
    const fixture = createResultRepository();
    try {
      const verified = remote.verifyFetchedResult(fixture.repository, {
        ...expected,
        starting_sha: fixture.base,
        result_sha: fixture.head,
      });
      expect(verified).toMatchObject({ valid: true, result_sha: fixture.head, changed_paths: ["src/catalog/model.ts"] });
      expect(remote.verifyFetchedResult(fixture.repository, {
        ...expected,
        starting_sha: fixture.base,
        result_sha: "e".repeat(40),
      }).errors).toContain("RESULT_SHA_MISMATCH");
      expect(remote.verifyFetchedResult(fixture.repository, {
        ...expected,
        task_branch: "main",
        starting_sha: fixture.base,
      }).errors).toContain("FORBIDDEN_BRANCH_PUBLICATION");
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects forbidden branches, force pushes, and worker merges", () => {
    expect(remote.validateRemoteResult(makeResult({ git_publication: { ...makeResult().git_publication, branch: "main", target_branch: "main" } }), expected, ["src/catalog/model.ts"])).toContain("FORBIDDEN_BRANCH_PUBLICATION");
    expect(remote.validateRemoteResult(makeResult({ git_publication: { ...makeResult().git_publication, force_pushed: true } }), expected, ["src/catalog/model.ts"])).toContain("FORCE_PUSH_FORBIDDEN");
    expect(remote.validateRemoteResult(makeResult({ git_publication: { ...makeResult().git_publication, merged: true } }), expected, ["src/catalog/model.ts"])).toContain("WORKER_MERGE_FORBIDDEN");
  });

  it("rejects missing or false sandbox attestation", () => {
    const result = makeResult();
    delete result.sandbox_attestation;
    expect(remote.validateRemoteResult(result, expected, ["src/catalog/model.ts"]).join(" ")).toMatch(/REMOTE_RESULT_SCHEMA|SANDBOX_NOT_ATTESTED/);
    expect(remote.validateRemoteResult(makeResult({ sandbox_attestation: { ...makeResult().sandbox_attestation, sandbox_active: false } }), expected, ["src/catalog/model.ts"])).toContain("SANDBOX_NOT_ATTESTED");
  });

  it("rejects weakened isolation flags and mismatched resource policy", () => {
    const result = makeResult();
    result.sandbox_attestation.host_network = true;
    result.sandbox_attestation.writable_mounts = ["/", "/workspace"];
    result.sandbox_attestation.resource_policy.memory_mb = 8192;
    const errors = remote.validateRemoteResult(result, expected, ["src/catalog/model.ts"]);
    expect(errors).toContain("SANDBOX_POLICY_FAILED:host_network");
    expect(errors).toContain("SANDBOX_WRITABLE_MOUNTS_INVALID");
    expect(errors).toContain("SANDBOX_RESOURCE_POLICY_MISMATCH:memory_mb");
  });

  it("rejects a foreign worker identity", () => {
    expect(remote.validateRemoteResult(makeResult({ worker_id: "other-worker" }), expected, ["src/catalog/model.ts"])).toContain("FOREIGN_WORKER_ID");
  });

  it("rejects forbidden changed paths and untrusted path inventories", () => {
    expect(remote.validateRemoteResult(makeResult({ changed_paths: [".env.production"] }), expected, [".env.production"])).toContain("FORBIDDEN_CHANGED_PATHS");
    expect(remote.validateRemoteResult(makeResult(), expected, ["src/catalog/model.ts", "src/admin.ts"])).toContain("REMOTE_CHANGED_PATHS_UNTRUSTED");
  });

  it("rejects stale or replayed execution identifiers", () => {
    expect(remote.validateRemoteResult(makeResult(), expected, ["src/catalog/model.ts"], { seenExecutionIds: [expected.execution_id] })).toContain("STALE_OR_REPLAYED_EXECUTION_ID");
  });

  it("reports timeout and worker failures as non-acceptable results", () => {
    expect(remote.validateRemoteResult(makeResult({ worker_exit_code: 124, failure_reason: "timeout" }), expected, ["src/catalog/model.ts"])).toContain("REMOTE_WORKER_FAILED");
    expect(remote.validateRemoteResult(makeResult({ gate_results: { "catalog-test": "FAIL" } }), expected, ["src/catalog/model.ts"])).toContain("REMOTE_GATES_FAILED");
  });

  it("does not allow a worker to declare task completion", () => {
    const result = { ...makeResult(), task_completed: true };
    expect(remote.validateRemoteResult(result, expected, ["src/catalog/model.ts"]).join(" ")).toMatch(/REMOTE_RESULT_SCHEMA/);
  });

  it("pins production exclusion and keeps remote-codex unactivated", () => {
    expect(makeRequest().security.production_forbidden).toBe(true);
    expect(remote.remoteWorkerPlanState({ worker_provider: "fake" })).toMatchObject({
      configured_provider: "fake", candidate_provider: null, dispatch_enabled: false, remote_worker_enabled: false,
    });
    expect(remote.PROVIDERS).toEqual(["fake", "remote-codex"]);
  });
});