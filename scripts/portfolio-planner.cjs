"use strict";

const READ_ONLY_ACTIONS = new Set(["READ_ONLY_INVENTORY"]);

function buildPortfolioPlan({ ecosystem, permissions, environments, portfolioState, activeBatch = null }) {
  const projects = new Map(ecosystem.projects.projects.map((item) => [item.id, item]));
  const readiness = new Map(ecosystem.readiness.projects.map((item) => [item.project_id, item]));
  const capabilities = new Map(ecosystem.capabilities.capabilities.map((item) => [item.id, item]));
  const queue = ecosystem.executionQueue.items;
  const prior = new Map((portfolioState?.completed_actions || []).map((item) => [item.action_id, item]));
  const decisions = new Map((portfolioState?.decisions || []).filter((item) => item.status === "APPROVED").map((item) => [item.decision_id, item]));
  const completedDecisions = new Set((portfolioState?.decisions || []).filter((item) => item.status === "APPROVED" && item.queue_action_id).map((item) => item.queue_action_id));
  const autonomousLevels = new Set(permissions.levels.filter((level) => level.autonomous).map((level) => level.id));
  const queuedById = new Map(queue.map((item) => [item.id, item]));
  const completed = new Set([...prior.keys(), ...completedDecisions]);
  const activeCollisionMap = new Map();
  const collisions = [];
  for (const item of queue) {
    for (const active of (activeBatch?.items || []).filter((entry) => entry.state === "IN_PROGRESS")) {
      const reasons = item.id === active.action_id
        ? ["An action with the same identity is already active."]
        : collisionReasons(item, active, { action_type: item.action_type || inferActionType(item), parallel_safe: false, approvals: item.approval_requirements || [] }, { action_type: active.action_type, parallel_safe: active.parallel_safe, approvals: [] });
      if (reasons.length) {
        activeCollisionMap.set(item.id, [...(activeCollisionMap.get(item.id) || []), ...reasons]);
        collisions.push({ action_ids: [item.id, active.action_id], reasons });
      }
    }
  }
  const entries = queue.map((item) => {
    const project = projects.get(item.project_id);
    const status = readiness.get(item.project_id);
    const actionType = item.action_type || inferActionType(item);
    const permissionLevel = item.permission_level || (item.classification === "HUMAN_DECISION" ? "L5" : READ_ONLY_ACTIONS.has(actionType) ? "L0" : "L1");
    const approvals = item.approval_requirements || [];
    const approvedDecision = item.decision_id ? decisions.get(item.decision_id) : null;
    const blockedDependencies = [
      ...item.dependencies.filter((id) => !completed.has(id) && queuedById.has(id)),
      ...ecosystem.dependencies.edges.filter((edge) => edge.from_type === "project" && edge.from_id === item.project_id &&
        edge.blocking && edge.status !== "CONFIRMED").map((edge) => `${edge.to_type}:${edge.to_id}`),
      ...(project?.dependencies || []).filter((id) => !["AUTONOMOUS_BUILD_READY", "EXECUTION_SPEC_READY", "IMPLEMENTATION_IN_PROGRESS", "READY_FOR_HUMAN_TEST", "PRODUCTION"].includes(readiness.get(id)?.status)).map((id) => `project:${id}`),
    ];
    const capabilityContext = (project?.capabilities_consumed || []).map((id) => {
      const capability = capabilities.get(id);
      return { capability_id: id, classification: capability?.classification || "UNKNOWN", owner_status: capability?.owner_status || "UNKNOWN", provider_project: capability?.provider_project || null };
    });
    const activeConflicts = activeCollisionMap.get(item.id) || [];
    const environmentReady = Boolean(status?.environment_ready && environments.local?.available && project?.repository_path);
    let classification;
    let reason;
    if (prior.has(item.id) || completedDecisions.has(item.id)) {
      classification = "COMPLETED";
      reason = "Authoritative portfolio decision recorded.";
    } else if (item.classification === "HUMAN_DECISION" || approvals.length || !autonomousLevels.has(permissionLevel)) {
      classification = "HUMAN_DECISION";
      reason = approvals.length ? `Approval required: ${approvals.join(", ")}.` : "Action requires human authorization.";
    } else if (item.risk === "high" && !READ_ONLY_ACTIONS.has(actionType)) {
      classification = "HUMAN_DECISION";
      reason = "High-risk mutation requires an explicit approval requirement.";
    } else if (activeConflicts.length) {
      classification = "WAITING_DEPENDENCY";
      reason = activeConflicts.join("; ");
    } else if (status?.status === "PRD_MISSING_EXTERNAL" || item.classification === "EXTERNAL_SOURCE_REQUIRED") {
      classification = "EXTERNAL_SOURCE_REQUIRED";
      reason = "Authoritative external source evidence is missing.";
    } else if (blockedDependencies.length || item.classification === "WAITING_DEPENDENCY") {
      classification = "WAITING_DEPENDENCY";
      reason = blockedDependencies.length ? `Waiting for ${blockedDependencies.join(", ")}.` : "Declared dependency is unresolved.";
    } else if (item.classification === "SPEC_GAP" || ["SPEC_INCOMPLETE", "PRD_DRAFT", "DEPENDENCY_BLOCKED"].includes(status?.status)) {
      classification = "SPEC_GAP";
      reason = "Specification or readiness evidence is incomplete.";
    } else if (actionType === "BOOTSTRAP" && approvedDecision && item.bootstrap_scope === "REPOSITORY_SKELETON_ONLY" && permissionLevel === "L1" && item.risk === "low") {
      if (item.target_path_available === false) {
        classification = "WAITING_DEPENDENCY";
        reason = "Authorized target path already exists; inspect it before any bootstrap action.";
      } else {
        classification = "RUN_NOW";
        reason = `Authorized by ${approvedDecision.decision_id}; bounded repository-skeleton preparation only.`;
      }
    } else if (["AUTONOMOUS_BUILD_READY", "EXECUTION_SPEC_READY"].includes(status?.status) && item.classification === "READY_TO_PLAN") {
      if (!READ_ONLY_ACTIONS.has(actionType) && !environmentReady) {
        classification = "WAITING_DEPENDENCY";
        reason = "Project repository/runtime environment is not verified and available.";
      } else {
        classification = actionType === "READ_ONLY_INVENTORY" ? "PARALLEL" : "RUN_NOW";
        reason = actionType === "READ_ONLY_INVENTORY" ? "Read-only action is independently eligible for parallel execution." : "Readiness and project environment gates permit execution planning.";
      }
    } else if (status?.external_source_required) {
      classification = "EXTERNAL_SOURCE_REQUIRED";
      reason = "Project still requires authoritative external source evidence.";
    } else {
      classification = "SPEC_GAP";
      reason = "No executable action is supported by current evidence.";
    }
    if (READ_ONLY_ACTIONS.has(actionType) && ["RUN_NOW", "PARALLEL"].includes(classification) && item.risk === "high") {
      classification = "HUMAN_DECISION";
      reason = "High-risk inventory requires an explicit safety review.";
    }
    return {
      project_id: item.project_id,
      action_id: item.id,
      action_type: actionType,
      objective: item.title,
      classification,
      mode: READ_ONLY_ACTIONS.has(actionType) ? "READ_ONLY" : "MUTATING",
      dependencies: [...item.dependencies],
      permission_level: permissionLevel,
      approvals,
      readiness: status?.status || "UNKNOWN",
      risk: item.risk || "unknown",
      environment_available: environmentReady,
      shared_capability_context: capabilityContext,
      shared_capability_leverage: item.shared_capability_leverage || "unknown",
      decision_id: item.decision_id || null,
      bootstrap_scope: item.bootstrap_scope || null,
      target_path: item.target_path || null,
      target_path_available: item.target_path_available !== false,
      expected_outputs: item.expected_outputs || [],
      stop_conditions: item.stop_conditions || [],
      blockers: [...(project?.blockers || []), ...(status?.blockers || [])],
      resource_scopes: [...(item.resource_scopes || [])],
      repository_path: item.repository_path || project?.repository_path || null,
      repository_paths: [...(item.repository_paths || [])],
      infrastructure_mutation: Boolean(item.infrastructure_mutation),
      infrastructure_scopes: [...(item.infrastructure_scopes || [])],
      parallel_safe: actionType === "BOOTSTRAP" && classification === "RUN_NOW",
      collision_reasons: [...activeConflicts],
      reason,
    };
  });

  const candidates = entries.filter((entry) => entry.classification === "PARALLEL" || entry.classification === "RUN_NOW");
  const collisionPairs = [...collisions];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const leftItem = queuedById.get(left.action_id);
      const rightItem = queuedById.get(right.action_id);
      const reasons = collisionReasons(leftItem, rightItem, left, right);
      if (reasons.length) {
        left.collision_reasons.push(...reasons);
        right.collision_reasons.push(...reasons);
        left.classification = "RUN_NOW";
        right.classification = "RUN_NOW";
        left.reason = "Parallel collision detected; execute serially.";
        right.reason = "Parallel collision detected; execute serially.";
        collisionPairs.push({ action_ids: [left.action_id, right.action_id], reasons });
      } else {
        left.parallel_safe = true;
        right.parallel_safe = true;
      }
    }
  }
  for (const candidate of candidates) {
    candidate.parallel_safe = ["PARALLEL", "RUN_NOW"].includes(candidate.classification) && candidate.collision_reasons.length === 0;
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    planning_only: true,
    projects_evaluated: projects.size,
    collisions: collisionPairs,
    entries,
  };
}

function inferActionType(item) {
  if (item.classification === "HUMAN_DECISION") return "HUMAN_APPROVAL";
  return item.id.includes("inventory") ? "READ_ONLY_INVENTORY" : "IMPLEMENT";
}

function collisionReasons(left, right, leftEntry, rightEntry) {
  const reasons = [];
  const shared = (left.resource_scopes || []).filter((scope) => (right.resource_scopes || []).includes(scope));
  if (shared.length) reasons.push(`Shared resource scopes: ${shared.join(", ")}`);
  if ((left.repository_path && left.repository_path === right.repository_path) ||
      (left.repository_paths || []).some((item) => (right.repository_paths || []).includes(item))) {
    reasons.push("Actions inspect or edit the same repository.");
  }
  if ((left.infrastructure_mutation || right.infrastructure_mutation) &&
      (left.infrastructure_scopes || []).some((scope) => (right.infrastructure_scopes || []).includes(scope))) {
    reasons.push("Actions share mutable infrastructure.");
  }
  if (left.dependencies.includes(right.id) || right.dependencies.includes(left.id)) reasons.push("Actions depend on one another.");
  if (!leftEntry.parallel_safe && !READ_ONLY_ACTIONS.has(leftEntry.action_type)) reasons.push("Left action lacks a read-only parallel-safety declaration.");
  if (!rightEntry.parallel_safe && !READ_ONLY_ACTIONS.has(rightEntry.action_type)) reasons.push("Right action lacks a read-only parallel-safety declaration.");
  if (leftEntry.approvals.length || rightEntry.approvals.length) reasons.push("At least one action requires approval.");
  return [...new Set(reasons)];
}

function createBatch(plan, batchId, actionIds) {
  const selected = actionIds.map((id) => plan.entries.find((entry) => entry.action_id === id));
  if (selected.some((entry) => !entry)) throw new Error("Batch references an unknown planner action");
  if (selected.some((entry) => !["READ_ONLY_INVENTORY", "BOOTSTRAP"].includes(entry.action_type) || !["RUN_NOW", "PARALLEL"].includes(entry.classification))) {
    throw new Error("Portfolio batch includes an unsupported or ineligible action");
  }
  if (selected.length > 1 && selected.some((entry) => !entry.parallel_safe)) throw new Error("Batch contains a parallel-safety collision");
  return {
    schema_version: 1,
    batch_id: batchId,
    status: "READY",
    created_at: new Date().toISOString(),
    mode: selected.every((entry) => entry.action_type === "READ_ONLY_INVENTORY") ? "READ_ONLY" : "SAFE_PREPARATION",
    items: selected.map((entry) => ({
      project_id: entry.project_id,
      action_id: entry.action_id,
      action_type: entry.action_type,
      objective: entry.objective,
      mode: entry.mode,
      dependencies: entry.dependencies,
      permission_level: entry.permission_level,
      parallel_safe: entry.parallel_safe,
      resource_scopes: entry.resource_scopes,
      repository_path: entry.repository_path,
      repository_paths: entry.repository_paths,
      infrastructure_mutation: entry.infrastructure_mutation,
      infrastructure_scopes: entry.infrastructure_scopes,
      decision_id: entry.decision_id,
      bootstrap_scope: entry.bootstrap_scope,
      target_path: entry.target_path,
      stop_conditions: entry.stop_conditions.length ? entry.stop_conditions : ["Any write/mutation beyond the declared action scope is proposed", "Secret value would need to be exposed", "An existing non-empty target conflicts with the decision"],
      expected_outputs: entry.expected_outputs.length ? entry.expected_outputs : [`inventory/${inventoryFileName(entry.project_id)}`],
      verification: entry.action_type === "BOOTSTRAP" ? "Confirm only the approved standalone skeleton exists; no dependencies installed, services changed, or feature code added." : "Validate inventory result against inventory-result.schema.json; confirm no secrets and no writes.",
      state: "READY",
    })),
  };
}

function inventoryFileName(projectId) {
  return `${projectId === "chalwa.id" ? "chalwa" : projectId.replaceAll(".", "-")}.json`;
}

function transitionBatch(batch, transition) {
  if (transition === "START") {
    if (batch.status !== "READY" || !batch.items.length || batch.items.some((item) => !item.parallel_safe || !["READ_ONLY_INVENTORY", "BOOTSTRAP"].includes(item.action_type))) {
      throw new Error("Only a non-empty collision-free safe-preparation batch may start");
    }
    batch.status = "IN_PROGRESS";
    for (const item of batch.items) item.state = "IN_PROGRESS";
    return batch;
  }
  if (transition === "COMPLETE") {
    if (!["READY", "IN_PROGRESS"].includes(batch.status) || batch.items.some((item) => item.state !== "COMPLETED")) {
      throw new Error("Only a verified batch with all completed items may complete");
    }
    batch.status = "COMPLETED";
    return batch;
  }
  if (transition === "BLOCK") {
    if (!["READY", "IN_PROGRESS"].includes(batch.status)) throw new Error("Only an active batch may be blocked");
    batch.status = "BLOCKED";
    for (const item of batch.items.filter((entry) => entry.state !== "COMPLETED")) item.state = "BLOCKED";
    return batch;
  }
  throw new Error(`Unsupported batch transition: ${transition}`);
}

module.exports = { buildPortfolioPlan, createBatch, collisionReasons, inventoryFileName, transitionBatch };
