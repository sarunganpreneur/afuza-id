#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const yaml = require("js-yaml");
const Ajv = require("ajv");
const { buildPortfolioPlan, createBatch, inventoryFileName, transitionBatch } = require("./portfolio-planner.cjs");
const { createInbox } = require("./portfolio-inbox.cjs");

const ROOT = path.resolve(__dirname, "..");
const CONTROL = path.join(ROOT, ".afuzactl");
const SCHEMAS = path.join(CONTROL, "schemas");
const STATE_PATH = path.join(CONTROL, "state.json");
const TASK_GRAPH_PATH = path.join(CONTROL, "task-graph.json");
const REPORT_PATH = path.join(CONTROL, "execution-report.md");
const ECOSYSTEM_ROOT = path.join(CONTROL, "ecosystem");
const ECOSYSTEM_REPORT_PATH = path.join(ECOSYSTEM_ROOT, "report.md");
const EXECUTION_PLAN_PATH = path.join(ECOSYSTEM_ROOT, "execution-plan.json");
const ACTIVE_BATCH_PATH = path.join(ECOSYSTEM_ROOT, "active-batch.json");
const PORTFOLIO_STATE_PATH = path.join(ECOSYSTEM_ROOT, "portfolio-state.json");
const INVENTORY_ROOT = path.join(ECOSYSTEM_ROOT, "inventory");
const INBOX_ROOT = path.join(CONTROL, "inbox");
const LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6"];
const GATES = ["configuration_schema", "lint", "typecheck", "tests", "build", "staging_smoke"];
const COMMANDS = {
  lint: ["npm", ["run", "lint"]],
  typecheck: ["npx", ["tsc", "--noEmit", "--pretty", "false"]],
  tests: ["npm", ["run", "test", "--", "--run"]],
  build: ["npm", ["run", "build"]],
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, "utf8"), { schema: yaml.JSON_SCHEMA });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, filePath);
}

function validateAgainstSchema(value, schemaFile, label) {
  const ajv = new Ajv({ allErrors: true, format: "full", schemaId: "auto" });
  if (!ajv.validate(readJson(path.join(ECOSYSTEM_ROOT, "schemas", schemaFile)), value)) {
    throw new Error(`${label} schema: ${formatValidationErrors(ajv.errors)}`);
  }
}

function loadPortfolioState() {
  const state = readJson(PORTFOLIO_STATE_PATH);
  validateAgainstSchema(state, "portfolio-state.schema.json", "portfolio state");
  return state;
}

function formatValidationErrors(errors) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

function loadContext() {
  const ajv = new Ajv({ allErrors: true, format: "full", schemaId: "auto" });
  const requirementSchema = readJson(path.join(SCHEMAS, "requirement.schema.json"));
  const taskSchema = readJson(path.join(SCHEMAS, "task.schema.json"));
  ajv.addSchema(requirementSchema, "requirement.schema.json");
  ajv.addSchema(taskSchema, "task.schema.json");

  const documents = {
    project: readYaml(path.join(CONTROL, "project.yaml")),
    permissions: readYaml(path.join(CONTROL, "permissions.yaml")),
    environments: readYaml(path.join(CONTROL, "environments.yaml")),
    state: readJson(STATE_PATH),
    requirements: readJson(path.join(CONTROL, "requirements.json")),
    taskGraph: readJson(TASK_GRAPH_PATH),
    ecosystem: loadEcosystem(),
  };
  const schemaFiles = {
    project: "project.schema.json",
    permissions: "permissions.schema.json",
    environments: "environments.schema.json",
    state: "state.schema.json",
    requirements: "requirements.schema.json",
    taskGraph: "task-graph.schema.json",
  };
  for (const [key, schemaFile] of Object.entries(schemaFiles)) {
    const valid = ajv.validate(readJson(path.join(SCHEMAS, schemaFile)), documents[key]);
    if (!valid) throw new Error(`${key} schema: ${formatValidationErrors(ajv.errors)}`);
  }
  for (const source of documents.project.source_of_truth) {
    if (!fs.existsSync(path.join(ROOT, source))) throw new Error(`Missing source-of-truth document: ${source}`);
  }

  validatePermissionPolicy(documents.permissions);
  validateGraph(documents.requirements, documents.taskGraph);
  validateReadyState(documents.state, documents.requirements, documents.taskGraph);
  if (documents.state.project !== documents.project.project.id) throw new Error("State project id does not match project.yaml");
  if (documents.state.total_tasks !== documents.taskGraph.tasks.length) throw new Error("State total_tasks does not match task-graph.json");
  if (documents.state.completed_tasks !== documents.taskGraph.tasks.filter((task) => task.state === "DONE").length) {
    throw new Error("State completed_tasks does not match task-graph.json");
  }
  return documents;
}

function uniqueIndex(items, key, label) {
  const indexed = new Map();
  for (const item of items) {
    const id = item[key];
    if (indexed.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
    indexed.set(id, item);
  }
  return indexed;
}

function findProjectCycles(projectIds, edges) {
  const adjacency = new Map(projectIds.map((id) => [id, []]));
  for (const edge of edges) {
    if (edge.from_type === "project" && edge.to_type === "project" && edge.status !== "UNRESOLVED") {
      adjacency.get(edge.from_id).push(edge.to_id);
    }
  }
  const visiting = [];
  const visited = new Set();
  const found = new Map();
  function visit(id) {
    const cycleIndex = visiting.indexOf(id);
    if (cycleIndex >= 0) {
      const cycle = visiting.slice(cycleIndex).concat(id);
      found.set([...new Set(cycle)].sort().join("|"), cycle);
      return;
    }
    if (visited.has(id)) return;
    visiting.push(id);
    for (const next of adjacency.get(id) || []) visit(next);
    visiting.pop();
    visited.add(id);
  }
  for (const id of projectIds) visit(id);
  return [...found.values()];
}

function findDirectedCycles(ids, dependenciesFor) {
  const visiting = [];
  const visited = new Set();
  const found = new Map();
  function visit(id) {
    const cycleIndex = visiting.indexOf(id);
    if (cycleIndex >= 0) {
      const cycle = visiting.slice(cycleIndex).concat(id);
      found.set([...new Set(cycle)].sort().join("|"), cycle);
      return;
    }
    if (visited.has(id)) return;
    visiting.push(id);
    for (const dependency of dependenciesFor(id)) visit(dependency);
    visiting.pop();
    visited.add(id);
  }
  for (const id of ids) visit(id);
  return [...found.values()];
}

function findDirectedCycles(ids, dependenciesFor) {
  const visiting = [];
  const visited = new Set();
  const found = new Map();
  function visit(id) {
    const cycleIndex = visiting.indexOf(id);
    if (cycleIndex >= 0) {
      const cycle = visiting.slice(cycleIndex).concat(id);
      found.set([...new Set(cycle)].sort().join("|"), cycle);
      return;
    }
    if (visited.has(id)) return;
    visiting.push(id);
    for (const dependency of dependenciesFor(id)) visit(dependency);
    visiting.pop();
    visited.add(id);
  }
  for (const id of ids) visit(id);
  return [...found.values()];
}

function validateEcosystemData(data) {
  const projects = uniqueIndex(data.projects.projects, "id", "project");
  const sources = uniqueIndex(data.sourceInventory.sources, "id", "source");
  const capabilities = uniqueIndex(data.capabilities.capabilities, "id", "capability");
  const requirements = uniqueIndex(data.requirements.requirements, "id", "requirement");
  const queue = uniqueIndex(data.executionQueue.items, "id", "queue item");
  const readiness = uniqueIndex(data.readiness.projects, "project_id", "readiness project");
  if (projects.size !== readiness.size || [...projects.keys()].some((id) => !readiness.has(id))) {
    throw new Error("Readiness matrix must contain exactly one entry per registered project");
  }

  const ensureRefs = (values, index, label, owner) => {
    for (const value of values) if (!index.has(value)) throw new Error(`${owner} references unknown ${label}: ${value}`);
  };
  for (const project of projects.values()) {
    if (project.parent) ensureRefs([project.parent], projects, "parent project", project.id);
    ensureRefs(project.dependencies, projects, "project dependency", project.id);
    ensureRefs(project.capabilities_consumed, capabilities, "capability", project.id);
    ensureRefs(project.capabilities_provided, capabilities, "capability", project.id);
    const status = readiness.get(project.id);
    if (project.autonomous_build_readiness !== status.status) {
      throw new Error(`Project ${project.id} readiness differs between registry and readiness matrix`);
    }
    if (status.status === "AUTONOMOUS_BUILD_READY" &&
        (!status.acceptance_criteria_complete || !status.dependencies_resolved || !status.architecture_available ||
         !status.environment_ready || !status.permission_policy_ready || !status.repository_runtime_verified ||
         !status.staging_path_available || status.ownership_conflict_status !== "NONE" ||
         !status.authoritative_specification_available || !status.implementation_sequence_available ||
         status.prd_completeness !== "COMPLETE" ||
         status.source_of_truth_quality !== "STRONG" ||
         !["STRATEGY_DEFINED", "TESTED"].includes(status.testability) || status.external_source_required || status.blockers.length > 0)) {
      throw new Error(`Project ${project.id} cannot be AUTONOMOUS_BUILD_READY with unresolved readiness gates`);
    }
    if (status.status === "EXECUTION_SPEC_READY" &&
        (status.prd_completeness !== "COMPLETE" || !status.acceptance_criteria_complete || !status.architecture_available ||
         !status.authoritative_specification_available || !status.implementation_sequence_available ||
         !["STRATEGY_DEFINED", "TESTED"].includes(status.testability) ||
         status.source_of_truth_quality !== "STRONG" || status.external_source_required)) {
      throw new Error(`Project ${project.id} cannot be EXECUTION_SPEC_READY with incomplete specification/readiness gates`);
    }
    if (!status.external_source_required && project.documentation_sources.some((sourcePath) => sourcePath.startsWith("external://Google Drive/"))) {
      const hasAuthoritativeReference = [...sources.values()].some((source) => source.project === project.id &&
        source.source_type === "google_drive_document" && source.authority_classification === "AUTHORITATIVE" &&
        ["REFERENCE_IDENTIFIED_ID_UNAVAILABLE", "DOCUMENT_ID_PROVIDED_CONTENT_UNAVAILABLE", "ID_VERIFIED", "METADATA_VERIFIED"].includes(source.reconciliation_status));
      if (!hasAuthoritativeReference) throw new Error(`Project ${project.id} cannot clear external-source readiness without an identified authoritative reference`);
    }
  }
  for (const source of sources.values()) {
    if (source.project !== "afuza.ecosystem") ensureRefs([source.project], projects, "source project", source.id);
    ensureRefs(source.conflicts_with, sources, "conflicting source", source.id);
    if (source.source_type && source.source_type.startsWith("google_drive_")) {
      if (source.status !== source.authority_classification) throw new Error(`Google Drive source ${source.id} has inconsistent authority classification`);
      if (source.last_known_metadata.contents_copied_to_repository !== false) {
        throw new Error(`Google Drive source ${source.id} must not copy contents into the repository`);
      }
      if (source.external_document_id === null && source.last_known_metadata.document_id_status !== "NOT_PROVIDED") {
        throw new Error(`Google Drive source ${source.id} has no document ID but does not record that gap`);
      }
      if (source.external_document_id !== null && source.last_known_metadata.document_id_status !== "AVAILABLE") {
        throw new Error(`Google Drive source ${source.id} has a document ID but metadata does not mark it available`);
      }
    }
  }
  for (const project of projects.values()) {
    const readinessStatus = readiness.get(project.id);
    const authoritativeExternalReferences = [...sources.values()].filter((source) =>
      source.project === project.id && source.source_type === "google_drive_document" &&
      source.authority_classification === "AUTHORITATIVE" && source.document_title &&
      ["REFERENCE_IDENTIFIED_ID_UNAVAILABLE", "DOCUMENT_ID_PROVIDED_CONTENT_UNAVAILABLE", "ID_VERIFIED", "METADATA_VERIFIED", "CONTENT_RECONCILED"].includes(source.reconciliation_status));
    if (readinessStatus.status === "PRD_MISSING_EXTERNAL" && authoritativeExternalReferences.length > 0) {
      throw new Error(`Project ${project.id} still requires an external PRD although authoritative title/version references are registered`);
    }
    if (readinessStatus.status === "PRD_MISSING_EXTERNAL" && !readinessStatus.external_source_required) {
      throw new Error(`Project ${project.id} is PRD_MISSING_EXTERNAL but does not flag its external source requirement`);
    }
  }
  for (const capability of capabilities.values()) {
    if (capability.provider_project) {
      ensureRefs([capability.provider_project], projects, "capability provider", capability.id);
      if (!projects.get(capability.provider_project).capabilities_provided.includes(capability.id)) {
        throw new Error(`Capability ${capability.id} provider does not declare it as provided`);
      }
    }
    ensureRefs(capability.consuming_projects, projects, "capability consumer", capability.id);
    for (const consumerId of capability.consuming_projects) {
      if (!projects.get(consumerId).capabilities_consumed.includes(capability.id)) {
        throw new Error(`Capability ${capability.id} consumer ${consumerId} does not declare it as consumed`);
      }
    }
  }
  for (const requirement of requirements.values()) {
    ensureRefs([requirement.project_id], projects, "requirement project", requirement.id);
    ensureRefs(requirement.shared_capability_dependencies, capabilities, "requirement capability", requirement.id);
    ensureRefs(requirement.dependencies, requirements, "requirement dependency", requirement.id);
    if (!data.sourceInventory.sources.some((source) => source.source_path === requirement.source_reference)) {
      throw new Error(`Requirement ${requirement.id} references a source absent from the inventory`);
    }
    if (requirement.readiness_status === "AUTONOMOUS_BUILD_READY" &&
        (requirement.business_acceptance_criteria.length === 0 || requirement.unresolved_questions.length > 0 ||
         requirement.dependencies.some((dependency) => !["EXECUTION_SPEC_READY", "AUTONOMOUS_BUILD_READY", "IMPLEMENTATION_IN_PROGRESS", "READY_FOR_HUMAN_TEST", "PRODUCTION"].includes(requirements.get(dependency).readiness_status)))) {
      throw new Error(`Requirement ${requirement.id} cannot be AUTONOMOUS_BUILD_READY with incomplete acceptance or dependencies`);
    }
  }
  const dependencyTypes = { project: projects, capability: capabilities, requirement: requirements, task: queue };
  for (const edge of data.dependencies.edges) {
    ensureRefs([edge.from_id], dependencyTypes[edge.from_type], edge.from_type, edge.id);
    ensureRefs([edge.to_id], dependencyTypes[edge.to_type], edge.to_type, edge.id);
  }
  for (const item of queue.values()) {
    ensureRefs([item.project_id], projects, "queue project", item.id);
    ensureRefs(item.dependencies, queue, "queue dependency", item.id);
  }

  const cycles = findProjectCycles([...projects.keys()], data.dependencies.edges);
  const requirementCycles = findDirectedCycles([...requirements.keys()], (id) => requirements.get(id).dependencies);
  const queueCycles = findDirectedCycles([...queue.keys()], (id) => queue.get(id).dependencies);
  const normalizeCycles = (items) => items.map((cycle) => [...new Set(cycle)].sort().join("|")).sort();
  if (JSON.stringify(normalizeCycles(cycles)) !== JSON.stringify(normalizeCycles(data.dependencies.cycles))) {
    throw new Error("Recorded project dependency cycles do not match computed dependency graph cycles");
  }
  if (JSON.stringify(normalizeCycles(requirementCycles)) !== JSON.stringify(normalizeCycles(data.dependencies.requirement_cycles))) {
    throw new Error("Recorded requirement dependency cycles do not match computed requirement graph cycles");
  }
  if (JSON.stringify(normalizeCycles(queueCycles)) !== JSON.stringify(normalizeCycles(data.dependencies.queue_cycles))) {
    throw new Error("Recorded planning-task cycles do not match computed planning graph cycles");
  }
  if (JSON.stringify(normalizeCycles(requirementCycles)) !== JSON.stringify(normalizeCycles(data.dependencies.requirement_cycles))) {
    throw new Error("Recorded requirement dependency cycles do not match computed requirement graph cycles");
  }
  if (JSON.stringify(normalizeCycles(queueCycles)) !== JSON.stringify(normalizeCycles(data.dependencies.queue_cycles))) {
    throw new Error("Recorded planning-task cycles do not match computed planning graph cycles");
  }
  const connected = new Set();
  for (const edge of data.dependencies.edges) {
    if (edge.from_type === "project" && edge.to_type === "project" && edge.status !== "UNRESOLVED") {
      connected.add(edge.from_id);
      connected.add(edge.to_id);
    }
  }
  const orphans = [...projects.keys()].filter((id) => id !== "afuza.ecosystem" && !connected.has(id)).sort();
  if (JSON.stringify([...data.dependencies.orphan_projects].sort()) !== JSON.stringify(orphans)) {
    throw new Error("Recorded orphan project list does not match the dependency graph");
  }
  const unowned = [...capabilities.values()].filter((item) => item.owner_status === "UNASSIGNED").map((item) => item.id).sort();
  if (JSON.stringify([...data.dependencies.unowned_capabilities].sort()) !== JSON.stringify(unowned)) {
    throw new Error("Recorded unowned capability list does not match capability ownership");
  }
  return { projects, sources, capabilities, requirements, queue, readiness, edges: data.dependencies.edges, cycles, requirementCycles, queueCycles, orphans, unowned };
}

function loadEcosystem() {
  const config = readYaml(path.join(ECOSYSTEM_ROOT, "ecosystem.yaml"));
  const data = {
    config,
    projects: readJson(path.join(ROOT, config.registry_path)),
    capabilities: readJson(path.join(ROOT, config.shared_capabilities_path)),
    dependencies: readJson(path.join(ROOT, config.dependencies_path)),
    readiness: readJson(path.join(ROOT, config.readiness_path)),
    executionQueue: readJson(path.join(ROOT, config.execution_queue_path)),
    sourceInventory: readJson(path.join(ROOT, config.source_inventory_path)),
    requirements: readJson(path.join(ROOT, config.requirements_path)),
  };
  const ajv = new Ajv({ allErrors: true, format: "full", schemaId: "auto" });
  const itemSchemas = ["project", "source", "capability", "normalized-requirement", "dependency", "readiness", "execution-item"];
  for (const name of itemSchemas) ajv.addSchema(readJson(path.join(ECOSYSTEM_ROOT, "schemas", `${name}.schema.json`)), `${name}.schema.json`);
  const collections = [
    ["ecosystem config", "ecosystem-config.schema.json", config],
    ["projects", "projects.schema.json", data.projects],
    ["source inventory", "source-inventory.schema.json", data.sourceInventory],
    ["capabilities", "capabilities.schema.json", data.capabilities],
    ["requirements", "requirements.schema.json", data.requirements],
    ["dependencies", "dependencies.schema.json", data.dependencies],
    ["readiness", "readiness-matrix.schema.json", data.readiness],
    ["execution queue", "execution-queue.schema.json", data.executionQueue],
  ];
  for (const [label, filename, value] of collections) {
    const valid = ajv.validate(readJson(path.join(ECOSYSTEM_ROOT, "schemas", filename)), value);
    if (!valid) throw new Error(`${label} schema: ${formatValidationErrors(ajv.errors)}`);
  }
  data.validation = validateEcosystemData(data);
  return data;
}

function validatePermissionPolicy(permissions) {
  const byId = new Map(permissions.levels.map((level) => [level.id, level]));
  for (const id of LEVELS) {
    if (!byId.has(id)) throw new Error(`Permission policy is missing ${id}`);
    const expected = LEVELS.indexOf(id) <= 4;
    if (byId.get(id).autonomous !== expected) throw new Error(`${id} autonomous policy contradicts AX-01`);
  }
  if (!permissions.approval_policy.require_human_for_levels.includes("L5") ||
      !permissions.approval_policy.require_human_for_levels.includes("L6")) {
    throw new Error("L5 and L6 must require human approval");
  }
}

function validateGraph(requirementSet, taskGraph) {
  const requirements = new Map();
  for (const requirement of requirementSet.requirements) {
    if (requirements.has(requirement.id)) throw new Error(`Duplicate requirement id: ${requirement.id}`);
    requirements.set(requirement.id, requirement);
  }
  for (const requirement of requirementSet.requirements) {
    const evidenceByCriterion = new Map();
    for (const evidence of requirement.verification_evidence) {
      if (!requirement.acceptance_criteria.includes(evidence.acceptance_criterion)) {
        throw new Error(`Requirement ${requirement.id} has evidence for an unknown acceptance criterion`);
      }
      if (evidenceByCriterion.has(evidence.acceptance_criterion)) {
        throw new Error(`Requirement ${requirement.id} has duplicate evidence for an acceptance criterion`);
      }
      evidenceByCriterion.set(evidence.acceptance_criterion, evidence);
    }
    for (const dependency of requirement.dependencies) {
      if (!requirements.has(dependency)) throw new Error(`Requirement ${requirement.id} depends on missing ${dependency}`);
    }
  }

  const tasks = new Map();
  for (const task of taskGraph.tasks) {
    if (tasks.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    tasks.set(task.id, task);
    for (const requirementId of task.requirement_ids) {
      if (!requirements.has(requirementId)) throw new Error(`Task ${task.id} references missing requirement ${requirementId}`);
    }
  }
  for (const task of taskGraph.tasks) {
    for (const dependency of task.dependencies) {
      if (!tasks.has(dependency)) throw new Error(`Task ${task.id} depends on missing task ${dependency}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(taskId) {
    if (visiting.has(taskId)) throw new Error(`Task dependency cycle includes ${taskId}`);
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependency of tasks.get(taskId).dependencies) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  }
  for (const taskId of tasks.keys()) visit(taskId);
}

function readinessFailures(state, requirementSet, taskGraph) {
  const failures = [];
  if (requirementSet.requirements.length === 0) failures.push("requirements have not been compiled");
  if (taskGraph.tasks.length === 0) failures.push("task graph is empty");
  if (requirementSet.requirements.some((requirement) => requirement.implementation_status !== "VERIFIED")) {
    failures.push("not all requirements are verified");
  }
  if (requirementSet.requirements.some((requirement) => requirement.acceptance_criteria.some((criterion) =>
    !requirement.verification_evidence.some((evidence) => evidence.acceptance_criterion === criterion && evidence.result === "PASS" && evidence.evidence.trim().length > 0)))) {
    failures.push("not every acceptance criterion has passing verification evidence");
  }
  if (taskGraph.tasks.some((task) => task.state !== "DONE")) failures.push("not all tasks are done");
  for (const gate of ["configuration_schema", "lint", "typecheck", "tests", "build", "staging_smoke"]) {
    if (state.quality_gates[gate] !== "PASS") failures.push(`${gate} has not passed`);
  }
  if (state.blockers.length > 0) failures.push("blocking issues remain");
  if (state.current_task !== null) failures.push("a task is still active");
  if (state.approvals_required.length > 0) failures.push("approvals remain outstanding");
  return failures;
}

function validateReadyState(state, requirements, taskGraph) {
  if (state.status !== "READY_FOR_HUMAN_TEST") return;
  const failures = readinessFailures(state, requirements, taskGraph);
  if (failures.length > 0) throw new Error(`READY_FOR_HUMAN_TEST is not evidence-based: ${failures.join(", ")}`);
}

function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function atomicWriteText(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, value, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function synchronizeCounts(state, taskGraph) {
  state.total_tasks = taskGraph.tasks.length;
  state.completed_tasks = taskGraph.tasks.filter((task) => task.state === "DONE").length;
  state.updated_at = new Date().toISOString();
}

function approvalRequirementsFor(task, permissions) {
  const policy = permissions.levels.find((level) => level.id === task.permission_level);
  const required = [...task.approval_requirements];
  if (!policy.autonomous && !required.includes(task.permission_level)) required.push(task.permission_level);
  return required;
}

function taskEligibility(task, taskGraph, permissions) {
  const taskById = new Map(taskGraph.tasks.map((candidate) => [candidate.id, candidate]));
  const unmet = task.dependencies.filter((dependency) => taskById.get(dependency).state !== "DONE");
  if (unmet.length > 0) return { eligible: false, reason: `waiting for ${unmet.join(", ")}` };
  const approvals = approvalRequirementsFor(task, permissions);
  if (approvals.length > 0) return { eligible: false, reason: `human approval required: ${approvals.join(", ")}` };
  return { eligible: true, reason: "dependencies and permissions clear" };
}

function stagingSmokeDisposition(staging, requested) {
  if (!requested) return "SKIPPED_NOT_REQUESTED";
  if (!staging.available || !staging.service || !staging.internal_endpoint || !staging.health_path) {
    return "SKIPPED_NOT_CONFIGURED";
  }
  return "RUN";
}

function stagingTargetsAllowed(staging) {
  try {
    const internal = new URL(staging.internal_endpoint);
    if (internal.username || internal.password || !["localhost", "127.0.0.1", "::1"].includes(internal.hostname)) return false;
    if (staging.public_endpoint) {
      const publicEndpoint = new URL(staging.public_endpoint);
      if (publicEndpoint.protocol !== "https:" || publicEndpoint.hostname === "afuza.id" || publicEndpoint.hostname.endsWith(".afuza.id")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function createReport(context) {
  const { project, state, taskGraph, requirements } = context;
  const stagingEnvironment = context.environments.environments.staging;
  const progress = taskGraph.tasks.length === 0
    ? "0/0 tasks; requirements not yet compiled"
    : `${state.completed_tasks}/${state.total_tasks} tasks`;
  const completed = taskGraph.tasks.filter((task) => task.state === "DONE");
  const blockers = state.blockers.length ? state.blockers.map((item) => `- ${item}`).join("\n") : "- None recorded";
  const approvals = state.approvals_required.length ? state.approvals_required.map((item) => `- ${item}`).join("\n") : "- None";
  const completedLines = completed.length ? completed.map((task) => `- ${task.id}`).join("\n") : "- None";
  const gates = Object.entries(state.quality_gates).map(([name, result]) => `- ${name}: ${result}`).join("\n");
  const staging = state.quality_gates.staging_smoke;
  let next = "Compile requirements from an approved PRD/spec and create the dependency-ordered task graph.";
  if (requirements.requirements.length > 0) next = "Run `./afuza plan` and continue the next dependency- and permission-eligible task.";
  if (state.status === "READY_FOR_HUMAN_TEST") next = "Begin human acceptance testing against the verified acceptance criteria.";
  if (state.status === "BLOCKED") next = "Resolve the recorded blocker using its authoritative source, then rerun `./afuza verify`.";
  return `# AFUZA Execution Report\n\n- Project: ${project.project.name} (${project.project.id})\n- Target: ${state.target}\n- Status: ${state.status}\n- Progress: ${progress}\n- Workstream: ${state.active_workstream || "None"}\n- Current task: ${state.current_task || "None"}\n- Requirements compiled: ${requirements.requirements.length}\n\n## Verification\n\n${gates}\n\n## Completed Items\n\n${completedLines}\n\n## Blockers\n\n${blockers}\n\n## Approval Requirements\n\n${approvals}\n\n## Staging\n\n- Service: ${stagingEnvironment.service || "not configured"}\n- Endpoint: ${stagingEnvironment.internal_endpoint || "not configured"}${stagingEnvironment.health_path || ""}\n- Smoke: ${staging}\n- Staging checkout: ${stagingEnvironment.checkout_path || "not configured"}\n\n## Recommended Next Action\n\n${next}\n`;
}

function writeReport(context) {
  const report = createReport(context);
  atomicWriteText(REPORT_PATH, report);
  return report;
}

function printStatus(context) {
  const { project, state, taskGraph, requirements } = context;
  console.log(`${project.project.name} (${project.project.id})`);
  console.log(`Target: ${state.target} | Status: ${state.status}`);
  console.log(`Workstream: ${state.active_workstream || "None"} | Current task: ${state.current_task || "None"}`);
  console.log(`Progress: ${state.completed_tasks}/${state.total_tasks} tasks | ${requirements.requirements.length} requirements compiled`);
  console.log(`Verification: ${Object.entries(state.quality_gates).map(([name, result]) => `${name}=${result}`).join(", ")}`);
  console.log(`Blockers: ${state.blockers.length} | Approvals required: ${state.approvals_required.join(", ") || "none"}`);
  if (taskGraph.tasks.length === 0) console.log("No task execution has been claimed.");
}

function printEcosystemStatus(ecosystem) {
  const { projects, sources, capabilities, requirements, queue, readiness } = ecosystem.validation;
  const statusCounts = countBy([...readiness.values()], (item) => item.status);
  console.log(`${ecosystem.config.ecosystem.name} (${ecosystem.config.ecosystem.id})`);
  console.log(`Projects: ${projects.size} registered | Sources: ${sources.size} | Capabilities: ${capabilities.size} | Requirements: ${requirements.size} | Planning items: ${queue.size}`);
  console.log(`External source required: ${[...projects.values()].filter((item) => item.external_source_required).length} projects`);
  for (const [status, count] of Object.entries(statusCounts).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`${status}: ${count}`);
  }
}

function countBy(items, keyFor) {
  const counts = {};
  for (const item of items) {
    const key = keyFor(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function printEcosystemDiscovery(ecosystem) {
  const registeredPaths = new Set([...ecosystem.validation.projects.values()].map((project) => project.repository_path).filter(Boolean));
  const roots = ecosystem.config.source_roots.filter((root) => root.startsWith("/"));
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      console.log(`UNAVAILABLE ${root}`);
      continue;
    }
    const children = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !["node_modules", "dist", "build", "backups", "cache", ".next", "docs", "public", "scripts", "src", "supabase", "tests", "packages", "apps", "generated", "runtime", "tools"].includes(entry.name))
      .map((entry) => ({ name: entry.name, path: path.join(root, entry.name) }))
      .sort((left, right) => left.name.localeCompare(right.name));
    console.log(`${root}: ${children.length} local directories`);
    for (const child of children) {
      const registered = registeredPaths.has(child.path) || [...registeredPaths].some((registeredPath) => child.path.startsWith(`${registeredPath}/`));
      console.log(`  ${registered ? "REGISTERED" : "UNCLASSIFIED"} ${child.name}`);
    }
  }
  const external = ecosystem.config.source_roots.filter((root) => root.startsWith("external://"));
  for (const source of external) console.log(`EXTERNAL_SOURCE_REQUIRED ${source}`);
  console.log(`Registry entries: ${ecosystem.validation.projects.size}; unknown external project documentation remains explicitly flagged.`);
}

function printEcosystemSources(ecosystem) {
  const sources = [...ecosystem.validation.sources.values()];
  const counts = countBy(sources, (item) => item.status);
  console.log(`Sources: ${sources.length}`);
  for (const [status, count] of Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))) console.log(`${status}: ${count}`);
  for (const source of sources.filter((item) => item.status === "CONFLICTING" || item.status === "STALE" || item.external_source_required)) {
    console.log(`${source.status} ${source.project} ${source.source_path}${source.external_source_required ? " [external review required]" : ""}`);
  }
}

function printEcosystemCapabilities(ecosystem) {
  const capabilities = [...ecosystem.validation.capabilities.values()];
  const counts = countBy(capabilities, (item) => item.classification);
  console.log(`Capabilities: ${capabilities.length}`);
  for (const [classification, count] of Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))) console.log(`${classification}: ${count}`);
  for (const capability of capabilities) {
    console.log(`${capability.id}: ${capability.classification}; provider=${capability.provider_project || "unknown"}; consumers=${capability.consuming_projects.length}; owner=${capability.owner_status}`);
  }
}

function printEcosystemDependencies(ecosystem) {
  const { edges, cycles, orphans, unowned } = ecosystem.validation;
  console.log(`Dependency edges: ${edges.length}`);
  for (const edge of edges) console.log(`${edge.status} ${edge.from_type}:${edge.from_id} -> ${edge.to_type}:${edge.to_id}${edge.blocking ? " [blocking]" : ""}`);
  console.log(`Cycles: ${cycles.length ? JSON.stringify(cycles) : "none detected"}`);
  console.log(`Requirement cycles: ${ecosystem.validation.requirementCycles.length ? JSON.stringify(ecosystem.validation.requirementCycles) : "none detected"}`);
  console.log(`Planning-task cycles: ${ecosystem.validation.queueCycles.length ? JSON.stringify(ecosystem.validation.queueCycles) : "none detected"}`);
  console.log(`Requirement cycles: ${ecosystem.validation.requirementCycles.length ? JSON.stringify(ecosystem.validation.requirementCycles) : "none detected"}`);
  console.log(`Planning-task cycles: ${ecosystem.validation.queueCycles.length ? JSON.stringify(ecosystem.validation.queueCycles) : "none detected"}`);
  console.log(`Orphan projects: ${orphans.join(", ") || "none"}`);
  console.log(`Unowned capabilities: ${unowned.join(", ") || "none"}`);
}

function printEcosystemReadiness(ecosystem) {
  const entries = [...ecosystem.validation.readiness.values()];
  const counts = countBy(entries, (item) => item.status);
  for (const [status, count] of Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))) console.log(`${status}: ${count}`);
  for (const entry of entries) {
    const project = ecosystem.validation.projects.get(entry.project_id);
    console.log(`${entry.status} ${project.name}${entry.external_source_required ? " [external source required]" : ""}`);
  }
}

function createEcosystemReport(ecosystem) {
  const projects = [...ecosystem.validation.projects.values()];
  const specReadinessCounts = countBy(projects, (item) => item.spec_readiness || "NOT_RECORDED");
  const autonomousReadinessCounts = countBy(projects, (item) => item.autonomous_build_readiness || "NOT_RECORDED");
  const executionLifecycleCounts = countBy(projects, (item) => item.execution_state || "NOT_RECORDED");
  const sourceCounts = countBy([...ecosystem.validation.sources.values()], (item) => item.status);
  const capabilityCounts = countBy([...ecosystem.validation.capabilities.values()], (item) => item.classification);
  const sourceDocuments = [...ecosystem.validation.sources.values()].filter((item) => item.source_type === "google_drive_document");
  const executionTransitions = projects.flatMap((project) => (project.execution_transitions || []).map((transition) => ({ project, transition })));
  const normalizedTransitions = countBy(executionTransitions, ({ transition }) => `${transition.from_state} | ${transition.to_state}`);
  const rows = projects.map((project) => `| ${project.name} | ${project.autonomous_build_readiness} | ${project.external_source_required ? "Yes" : "No"} | ${project.blockers.join("; ") || "None recorded"} |`).join("\n");
  const projectStateLines = projects.map((project) => `- ${project.name}: Spec: ${project.spec_readiness || "NOT_RECORDED"}; Autonomous: ${project.autonomous_build_readiness}; Execution: ${project.execution_state || "NOT_RECORDED"}`);
  const sourceLines = Object.entries(sourceCounts).sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `- ${key}: ${count}`).join("\n");
  const capabilityLines = Object.entries(capabilityCounts).sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `- ${key}: ${count}`).join("\n");
  const readinessLines = [
    "Spec readiness:",
    ...Object.entries(specReadinessCounts).filter(([key]) => key !== "N/A").sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "Autonomous readiness:",
    ...Object.entries(autonomousReadinessCounts).filter(([key]) => key !== "N/A").sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "Execution lifecycle:",
    ...Object.entries(executionLifecycleCounts).filter(([key]) => key !== "N/A").sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "Project state:",
    ...projectStateLines,
  ].join("\n");
  const transitionLines = Object.entries(normalizedTransitions).sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => {
    const projectNames = executionTransitions.filter(({ transition }) => `${transition.from_state} | ${transition.to_state}` === key).map(({ project }) => project.name).sort().join(", ");
    return `- ${key}: ${count} (${projectNames})`;
  }).join("\n");
  const queueLines = ecosystem.executionQueue.items.map((item) => `- ${item.classification}: ${item.title} (${item.project_id})`).join("\n");
  const driveIdsSupplied = sourceDocuments.filter((item) => typeof item.external_document_id === "string" && item.external_document_id.length > 10).length;
  const contentsBlocked = sourceDocuments.filter((item) => item.external_document_id === null && item.last_known_metadata?.document_id_status === "NOT_PROVIDED").length;
  return `# Afuza Ecosystem Discovery Report\n\n- Registry: ${ecosystem.config.ecosystem.id}\n- Projects registered: ${projects.length}\n- Source documents/references: ${ecosystem.validation.sources.size}\n- Normalized requirements: ${ecosystem.validation.requirements.size}\n- Dependency edges: ${ecosystem.dependencies.edges.length}\n- Planning only: ${ecosystem.executionQueue.planning_only}\n\n## Readiness\n\n${readinessLines}\n\n## Normalized transitions\n\n${transitionLines}\n\n| Project | Readiness | External source required | Blockers / gaps |\n| --- | --- | --- | --- |\n${rows}\n\n## Source Classification\n\n${sourceLines}\n\n## Source metadata\n\n- Drive document IDs supplied: ${driveIdsSupplied}\n- Contents unavailable pending Google sign-in: ${contentsBlocked}\n\n## Capabilities\n\n${capabilityLines}\n\n## Dependency Findings\n\n- Cycles: ${ecosystem.validation.cycles.length ? JSON.stringify(ecosystem.validation.cycles) : "none detected"}\n- Orphan projects: ${ecosystem.validation.orphans.join(", ") || "none"}\n- Unowned capabilities: ${ecosystem.validation.unowned.join(", ") || "none"}\n\n## Portfolio Planning Queue\n\n${queueLines}\n\n## Safety\n\nAX-02 is discovery and planning metadata only. Product execution, production changes and outbound external actions are disabled. AX-03 owns future prioritization.\n`;
}

function runEcosystemCommand(ecosystem, subcommand) {
  switch (subcommand) {
    case "status":
      printEcosystemStatus(ecosystem);
      return 0;
    case "discover":
      printEcosystemDiscovery(ecosystem);
      return 0;
    case "sources":
      printEcosystemSources(ecosystem);
      return 0;
    case "capabilities":
      printEcosystemCapabilities(ecosystem);
      return 0;
    case "dependencies":
      printEcosystemDependencies(ecosystem);
      return 0;
    case "readiness":
      printEcosystemReadiness(ecosystem);
      return 0;
    case "report": {
      const report = createEcosystemReport(ecosystem);
      atomicWriteText(ECOSYSTEM_REPORT_PATH, report);
      process.stdout.write(report);
      return 0;
    }
    default:
      console.log("Usage: ./afuza ecosystem <status|discover|sources|capabilities|dependencies|readiness|report>");
      return 2;
  }
}

function portfolioPlan(context) {
  const state = loadPortfolioState();
  const planningContext = structuredClone(context.ecosystem);
  planningContext.executionQueue.items = planningContext.executionQueue.items.map((item) => item.target_path
    ? { ...item, target_path_available: !fs.existsSync(item.target_path) }
    : item);
  const plan = buildPortfolioPlan({
    ecosystem: planningContext,
    permissions: context.permissions,
    environments: context.environments.environments,
    portfolioState: state,
  });
  validateAgainstSchema(plan, "execution-plan.schema.json", "execution plan");
  writeJson(EXECUTION_PLAN_PATH, plan);
  return plan;
}

function runPortfolioCommand(context, [subcommand, ...args]) {
  const state = loadPortfolioState();
  let plan = fs.existsSync(EXECUTION_PLAN_PATH) ? readJson(EXECUTION_PLAN_PATH) : portfolioPlan(context);
  validateAgainstSchema(plan, "execution-plan.schema.json", "execution plan");
  if (subcommand === "plan") {
    plan = portfolioPlan(context);
    for (const entry of plan.entries) console.log(`${entry.classification} ${entry.project_id} ${entry.action_type}: ${entry.objective} (${entry.reason})`);
    console.log(`Projects evaluated: ${plan.projects_evaluated}; collisions: ${plan.collisions.length}; planning only: ${plan.planning_only}`);
    return 0;
  }
  if (subcommand === "batch") {
    if (args[0] === "start") {
      const batch = readJson(ACTIVE_BATCH_PATH);
      validateAgainstSchema(batch, "active-batch.schema.json", "active batch");
      const state = loadPortfolioState();
      for (const item of batch.items.filter((entry) => entry.action_type === "BOOTSTRAP")) {
        const approved = state.decisions.some((decision) => decision.decision_id === item.decision_id && decision.status === "APPROVED");
        if (!approved || item.bootstrap_scope !== "REPOSITORY_SKELETON_ONLY" || !item.target_path || fs.existsSync(item.target_path)) {
          throw new Error(`Bootstrap preconditions failed for ${item.project_id}; no action was started`);
        }
      }
      transitionBatch(batch, "START");
      writeJson(ACTIVE_BATCH_PATH, batch);
      console.log(`Batch ${batch.batch_id} is IN_PROGRESS (${batch.items.length} bounded actions; mode=${batch.mode}).`);
      return 0;
    }
    if (args[0] === "complete") return completePortfolioBatch(context, state);
    let batch = readJson(ACTIVE_BATCH_PATH);
    if (["COMPLETED", "BLOCKED"].includes(batch.status)) {
      plan = portfolioPlan(context);
      const candidates = plan.entries.filter((entry) => entry.classification === "PARALLEL" && entry.action_type === "READ_ONLY_INVENTORY" || entry.classification === "RUN_NOW" && entry.action_type === "BOOTSTRAP");
      if (candidates.length) {
        const batchId = `portfolio-preparation-${String(Date.now())}`;
        batch = createBatch(plan, batchId, candidates.map((entry) => entry.action_id));
        state.active_batch_id = batchId;
        writeJson(PORTFOLIO_STATE_PATH, state);
        writeJson(ACTIVE_BATCH_PATH, batch);
      } else {
        console.log(`Batch ${batch.batch_id}: ${batch.status}; mode=${batch.mode}; items=${batch.items.length}`);
        for (const item of batch.items) console.log(`${item.state} ${item.project_id} ${item.action_type} ${item.permission_level} parallel_safe=${item.parallel_safe}`);
        return 0;
      }
    }
    if (batch.items.length === 0) {
      plan = portfolioPlan(context);
      const candidates = plan.entries.filter((entry) => entry.classification === "PARALLEL" && entry.action_type === "READ_ONLY_INVENTORY" || entry.classification === "RUN_NOW" && entry.action_type === "BOOTSTRAP");
      const batchId = `portfolio-preparation-${String(Date.now())}`;
      batch = createBatch(plan, batchId, candidates.map((entry) => entry.action_id));
      state.active_batch_id = batchId;
      writeJson(PORTFOLIO_STATE_PATH, state);
      writeJson(ACTIVE_BATCH_PATH, batch);
    }
    validateAgainstSchema(batch, "active-batch.schema.json", "active batch");
    console.log(`Batch ${batch.batch_id}: ${batch.status}; mode=${batch.mode}; items=${batch.items.length}`);
    for (const item of batch.items) console.log(`${item.state} ${item.project_id} ${item.action_type} ${item.permission_level} parallel_safe=${item.parallel_safe}`);
    return 0;
  }
  if (subcommand === "status") {
    const batch = readJson(ACTIVE_BATCH_PATH);
    validateAgainstSchema(batch, "active-batch.schema.json", "active batch");
    console.log(`Projects evaluated: ${plan.projects_evaluated}`);
    console.log(`Active batch: ${batch.batch_id} (${batch.status}; ${batch.items.length} items)`);
    for (const [classification, count] of Object.entries(countBy(plan.entries, (item) => item.classification)).sort(([a], [b]) => a.localeCompare(b))) console.log(`${classification}: ${count}`);
    return 0;
  }
  if (subcommand === "readiness") {
    plan = portfolioPlan(context);
    const projectsFor = (classification) => [...new Set(plan.entries.filter((entry) => entry.classification === classification).map((entry) => entry.project_id))];
    for (const status of ["AUTONOMOUS_BUILD_READY", "EXECUTION_SPEC_READY"]) {
      const projects = context.ecosystem.readiness.projects.filter((entry) => entry.status === status).map((entry) => entry.project_id);
      console.log(`${status}: ${projects.join(", ") || "None"}`);
    }
    for (const classification of ["RUN_NOW", "PARALLEL", "WAITING_DEPENDENCY", "SPEC_GAP", "EXTERNAL_SOURCE_REQUIRED", "HUMAN_DECISION", "COMPLETED"]) {
      const projects = projectsFor(classification);
      console.log(`${classification}: ${projects.join(", ") || "None"}`);
    }
    return 0;
  }
  if (subcommand === "inventory") {
    const files = fs.existsSync(INVENTORY_ROOT) ? fs.readdirSync(INVENTORY_ROOT).filter((name) => name.endsWith(".json")) : [];
    if (!files.length) console.log("No inventory results recorded.");
    for (const filename of files) {
      const inventory = readJson(path.join(INVENTORY_ROOT, filename));
      validateAgainstSchema(inventory, "inventory-result.schema.json", `${filename} inventory`);
      console.log(`${inventory.project_id}: ${inventory.repository.classification}; readiness=${inventory.autonomous_build_readiness}; ${filename}`);
    }
    return 0;
  }
  console.log("Usage: ./afuza portfolio <status|plan|batch [complete]|readiness|inventory>");
  return 2;
}

function completePortfolioBatch(context, portfolioState) {
  const batch = readJson(ACTIVE_BATCH_PATH);
  validateAgainstSchema(batch, "active-batch.schema.json", "active batch");
  for (const item of batch.items) {
    let resultPath;
    let completedAt;
    if (item.action_type === "READ_ONLY_INVENTORY") {
      resultPath = path.join(INVENTORY_ROOT, inventoryFileName(item.project_id));
      const result = readJson(resultPath);
      validateAgainstSchema(result, "inventory-result.schema.json", `${item.project_id} inventory`);
      if (result.project_id !== item.project_id) throw new Error(`Inventory result project does not match batch item ${item.action_id}`);
      completedAt = result.inventory_timestamp;
    } else if (item.action_type === "BOOTSTRAP" && item.bootstrap_scope === "REPOSITORY_SKELETON_ONLY") {
      const decision = portfolioState.decisions.find((entry) => entry.decision_id === item.decision_id && entry.status === "APPROVED");
      const targetPath = item.target_path;
      if (!decision || !targetPath || !fs.existsSync(path.join(targetPath, ".git")) || !fs.existsSync(path.join(targetPath, "README.md")) ||
          fs.statSync(targetPath).uid !== Number(spawnSync("id", ["-u", "afuzaid"], { encoding: "utf8" }).stdout.trim())) {
        throw new Error(`Bootstrap output failed ownership/decision verification for ${item.project_id}`);
      }
      const runOwnedGit = (gitArgs) => spawnSync("runuser", ["-u", "afuzaid", "--", "git", "-C", targetPath, ...gitArgs], { encoding: "utf8" });
      const branch = runOwnedGit(["branch", "--show-current"]);
      if (branch.status !== 0 || branch.stdout.trim() !== "main") throw new Error(`Bootstrap branch verification failed for ${item.project_id}`);
      const head = runOwnedGit(["rev-parse", "--verify", "HEAD"]);
      if (head.status === 0) throw new Error(`Bootstrap unexpectedly contains a commit for ${item.project_id}`);
      const porcelain = runOwnedGit(["status", "--porcelain"]);
      if (porcelain.status !== 0 || porcelain.stdout.trim().split("\n").filter(Boolean).sort().join("|") !== "?? .gitignore|?? README.md") {
        throw new Error(`Bootstrap contains files outside the approved skeleton for ${item.project_id}`);
      }
      resultPath = path.join(targetPath, "README.md");
      completedAt = new Date().toISOString();
    } else {
      throw new Error(`Unsupported action type in batch completion: ${item.action_type}`);
    }
    item.state = "COMPLETED";
    portfolioState.completed_actions = portfolioState.completed_actions.filter((action) => action.action_id !== item.action_id);
    portfolioState.completed_actions.push({ action_id: item.action_id, project_id: item.project_id, completed_at: completedAt, ...(item.action_type === "READ_ONLY_INVENTORY" ? { inventory_path: path.relative(ROOT, resultPath) } : { result_path: resultPath, action_type: item.action_type }) });
  }
  transitionBatch(batch, "COMPLETE");
  portfolioState.active_batch_id = batch.batch_id;
  writeJson(ACTIVE_BATCH_PATH, batch);
  writeJson(PORTFOLIO_STATE_PATH, portfolioState);
  portfolioPlan(context);
  console.log(`Batch ${batch.batch_id} completed after validating ${batch.items.length} inventory results.`);
  return 0;
}

function runInboxCommand(context, [subcommand, ...args]) {
  const inbox = createInbox(INBOX_ROOT, path.join(ECOSYSTEM_ROOT, "schemas", "inbox-artifact.schema.json"));
  const state = loadPortfolioState();
  if (subcommand === "status") {
    console.log(JSON.stringify(inbox.status(state), null, 2));
    return 0;
  }
  if (subcommand === "import" && args[0]) {
    const ecosystemConfig = context.ecosystem.config;
    const sourceInventory = readJson(path.join(ROOT, ecosystemConfig.source_inventory_path));
    const result = inbox.importArtifact(path.resolve(args[0]), { ecosystem: context.ecosystem, portfolioState: state, sourceInventory });
    if (result.status === "PROCESSED") {
      writeJson(path.join(ROOT, ecosystemConfig.source_inventory_path), sourceInventory);
      writeJson(PORTFOLIO_STATE_PATH, state);
    }
    console.log(`${result.status}${result.artifact_id ? ` ${result.artifact_id}` : ""}${result.reason ? `: ${result.reason}` : ""}`);
    return result.status === "REJECTED" ? 1 : 0;
  }
  console.log("Usage: ./afuza inbox <status|import <file>>");
  return 2;
}

function printPlan(context) {
  const { taskGraph, permissions } = context;
  if (taskGraph.tasks.length === 0) {
    console.log("No compiled requirements or tasks. No implementation has been marked complete.");
    return;
  }
  const candidates = taskGraph.tasks.filter((task) => ["PLANNED", "READY"].includes(task.state));
  if (candidates.length === 0) {
    console.log("No planned or ready tasks. Inspect the current task states with `./afuza status`.");
    return;
  }
  for (const task of candidates) {
    const eligibility = taskEligibility(task, taskGraph, permissions);
    console.log(`${eligibility.eligible ? "READY" : "WAITING"} ${task.id} (${task.permission_level}): ${eligibility.reason}`);
    console.log(`  capability: ${task.responsible.capability}`);
  }
}

function redactOutput(text) {
  let safe = text;
  const secretNames = /(PASSWORD|TOKEN|API[_-]?KEY|SECRET|SERVICE[_-]?ROLE|AUTH|CREDENTIAL)/i;
  for (const [name, value] of Object.entries(process.env)) {
    if (secretNames.test(name) && value && value.length >= 4) safe = safe.split(value).join("[REDACTED]");
  }
  safe = safe.replace(/\bBearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
  safe = safe.replace(/\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]");
  return safe.split(/\r?\n/).filter((line) => !/(password|token|secret|api[_-]?key|authorization|service[_-]?role|credential)\s*[:=]/i.test(line));
}

function runCommand(command, args, cwd = ROOT, env = process.env) {
  console.log(`Running ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
  });
  const code = result.status === null ? 1 : result.status;
  if (code !== 0) {
    const detail = redactOutput(`${result.stdout || ""}\n${result.stderr || ""}`).filter(Boolean).slice(-12);
    console.error(`FAIL (${code})${detail.length ? `\n${detail.join("\n").slice(-4000)}` : ""}`);
    return false;
  }
  console.log("PASS");
  return true;
}

function runIsolatedBuild() {
  const outputDirectory = path.join(ROOT, ".next-afuza-verify");
  if (fs.existsSync(outputDirectory)) {
    console.error("FAIL: isolated build output directory already exists; refusing to overwrite it.");
    return false;
  }
  try {
    return runCommand("npm", ["run", "build"], ROOT, { ...process.env, AFUZA_VERIFY_BUILD: "1" });
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}

async function runStagingSmoke(staging, requested) {
  const disposition = stagingSmokeDisposition(staging, requested);
  if (disposition !== "RUN") {
    console.log(disposition);
    return disposition;
  }
  if (!stagingTargetsAllowed(staging)) {
    console.error("FAIL: staging endpoint must be loopback-only and any public endpoint must be non-production HTTPS.");
    return false;
  }
  let parsed;
  try {
    parsed = new URL(staging.health_path, staging.internal_endpoint);
  } catch {
    console.error("FAIL: staging endpoint configuration is invalid.");
    return false;
  }
  if (!/^[a-zA-Z0-9_.@-]+\.service$/.test(staging.service)) {
    console.error("FAIL: staging systemd service name is invalid.");
    return false;
  }
  const service = spawnSync("systemctl", ["is-active", staging.service], { encoding: "utf8", timeout: 10000 });
  if (service.status !== 0 || service.stdout.trim() !== "active") {
    console.error("FAIL: staging systemd service is not active.");
    return false;
  }
  console.log(`PASS: staging service ${staging.service} is active.`);
  try {
    const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.status !== "ok") throw new Error("health response status is not ok");
    console.log("PASS: staging health endpoint responded successfully.");
    return true;
  } catch (error) {
    console.error(`FAIL: staging health check failed (${error.name === "TimeoutError" ? "timeout" : "unhealthy response or connection error"}).`);
    return false;
  }
}

async function verify(context, options = {}) {
  const { state, taskGraph } = context;
  const startedAt = new Date().toISOString();
  const results = Object.fromEntries(GATES.map((gate) => [gate, "NOT_RUN"]));
  state.status = state.status === "READY_FOR_HUMAN_TEST" ? "VERIFYING" : state.status;
  state.updated_at = startedAt;
  atomicWriteJson(STATE_PATH, state);

  results.configuration_schema = "PASS";
  let pipelinePass = true;
  for (const gate of ["lint", "typecheck", "tests", "build"]) {
    const [command, args] = COMMANDS[gate];
    const passed = gate === "build" ? runIsolatedBuild() : runCommand(command, args);
    results[gate] = passed ? "PASS" : "FAIL";
    if (results[gate] === "FAIL") pipelinePass = false;
  }

  const staging = context.environments.environments.staging;
  const smokeRequested = !options.skipStagingSmoke && (options.stagingSmoke || staging.available);
  const smokeResult = await runStagingSmoke(staging, smokeRequested);
  results.staging_smoke = smokeResult === true ? "PASS"
    : typeof smokeResult === "string" ? smokeResult : "FAIL";
  if (results.staging_smoke === "FAIL") pipelinePass = false;

  state.quality_gates = results;
  state.last_execution = {
    command: options.commandName || "verify",
    result: pipelinePass ? "PASS" : "FAIL",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
  const staleMigrationBlocker = "Full Vitest suite has an existing lifecycle contract test that requires missing companion file ../schema/migrations/20260911_phase5g3b_fix_analysis_completion_status.sql; no authoritative copy is present in this workspace.";
  if (results.tests === "PASS") state.blockers = state.blockers.filter((blocker) => blocker !== staleMigrationBlocker);
  const closurePass = GATES.every((gate) => results[gate] === "PASS") && state.blockers.length === 0 &&
    state.approvals_required.length === 0 && state.current_task === null;
  if (closurePass) state.status = "EXECUTION_FOUNDATION_COMPLETE";
  else if (results.tests === "FAIL" || results.staging_smoke === "FAIL") state.status = "BLOCKED";
  else if (state.status === "VERIFYING") state.status = "AUTONOMOUS_BUILD_READY";
  synchronizeCounts(state, taskGraph);
  atomicWriteJson(STATE_PATH, state);
  context.state = state;
  writeReport(context);
  console.log(`Verification ${pipelinePass ? "PASS" : "FAIL"}; staging smoke ${results.staging_smoke}.`);
  return pipelinePass;
}

function dispatchTask(context) {
  const { taskGraph, state, permissions } = context;
  if (state.current_task) {
    const current = taskGraph.tasks.find((task) => task.id === state.current_task);
    console.log(`Resuming ${current.id} (${current.state}); responsible capability: ${current.responsible.capability}.`);
    console.log("Continue the declared task, then set its state to VERIFYING before `./afuza resume`.");
    return 0;
  }
  if (taskGraph.tasks.length === 0) {
    console.log("No compiled tasks to execute. Compile requirements and task graph from an approved specification first.");
    return 0;
  }
  const candidate = taskGraph.tasks.find((task) => {
    if (!(["PLANNED", "READY"].includes(task.state))) return false;
    return taskEligibility(task, taskGraph, permissions).eligible;
  });
  if (!candidate) {
    printPlan(context);
    return 1;
  }
  candidate.state = "IN_PROGRESS";
  state.status = "BUILDING";
  state.current_task = candidate.id;
  state.active_workstream = candidate.workstream || state.active_workstream;
  synchronizeCounts(state, taskGraph);
  atomicWriteJson(TASK_GRAPH_PATH, taskGraph);
  atomicWriteJson(STATE_PATH, state);
  context.state = state;
  writeReport(context);
  console.log(`Dispatched ${candidate.id} to ${candidate.responsible.capability} (${candidate.permission_level}).`);
  for (const action of candidate.actions) console.log(`- ${action.type}: ${action.description}`);
  console.log("No arbitrary shell action was run. The responsible agent performs the task and records VERIFYING before resume.");
  return 0;
}

async function resume(context, options) {
  if (!context.state.current_task) return dispatchTask(context);
  const task = context.taskGraph.tasks.find((candidate) => candidate.id === context.state.current_task);
  if (task.state !== "VERIFYING") {
    console.log(`Task ${task.id} is ${task.state}; continue its declared work, then set state to VERIFYING.`);
    return 0;
  }
  const passed = await verify(context, { ...options, commandName: "resume" });
  const required = task.verification_gates;
  const failed = required.filter((gate) => context.state.quality_gates[gate] !== "PASS");
  if (!passed || failed.length > 0) {
    task.retries += 1;
    task.blocker_reason = `Failed required gates: ${failed.join(", ") || "verification pipeline"}`;
    if (task.retries >= context.project.execution.max_safe_retries) {
      task.state = "BLOCKED";
      context.state.status = "BLOCKED";
      context.state.current_task = null;
      context.state.blockers.push(`${task.id}: ${task.blocker_reason}`);
    }
    synchronizeCounts(context.state, context.taskGraph);
    atomicWriteJson(TASK_GRAPH_PATH, context.taskGraph);
    atomicWriteJson(STATE_PATH, context.state);
    writeReport(context);
    console.error(`Task ${task.id} is ${task.state}; failed required gates: ${failed.join(", ") || "verification pipeline"}.`);
    return 1;
  }
  task.state = "DONE";
  task.blocker_reason = null;
  context.state.current_task = null;
  context.state.status = "BUILDING";
  synchronizeCounts(context.state, context.taskGraph);
  atomicWriteJson(TASK_GRAPH_PATH, context.taskGraph);
  atomicWriteJson(STATE_PATH, context.state);
  writeReport(context);
  console.log(`Task ${task.id} verified and marked DONE.`);
  return 0;
}

function doctor(context) {
  const scripts = readJson(path.join(ROOT, "package.json")).scripts;
  for (const name of ["lint", "test", "build"]) {
    if (!scripts[name]) throw new Error(`Required verification script is missing: npm run ${name}`);
  }
  if (!fs.existsSync(path.join(ROOT, "tsconfig.json"))) throw new Error("TypeScript configuration is missing");
  console.log("Configuration, state, requirement set, task graph, permissions, and source documents: PASS");
  console.log(`Ecosystem schemas, references, cycles, and readiness invariants: PASS (${context.ecosystem.validation.projects.size} projects)`);
  loadPortfolioState();
  validateAgainstSchema(readJson(EXECUTION_PLAN_PATH), "execution-plan.schema.json", "execution plan");
  validateAgainstSchema(readJson(ACTIVE_BATCH_PATH), "active-batch.schema.json", "active batch");
  createInbox(INBOX_ROOT, path.join(ECOSYSTEM_ROOT, "schemas", "inbox-artifact.schema.json"));
  for (const filename of fs.readdirSync(INVENTORY_ROOT).filter((name) => name.endsWith(".json"))) {
    validateAgainstSchema(readJson(path.join(INVENTORY_ROOT, filename)), "inventory-result.schema.json", `${filename} inventory`);
  }
  console.log("Portfolio plan, batch, state, and inventory schemas: PASS");
  console.log(`Ecosystem registry, schemas, references, and readiness invariants: PASS (${context.ecosystem.validation.projects.size} projects)`);
  console.log("Verification tooling: lint, tsc, Vitest, and Next.js build available");
  const staging = context.environments.environments.staging;
  const service = spawnSync("systemctl", ["is-active", staging.service], { encoding: "utf8", timeout: 10000 });
  console.log(`Staging service ${staging.service}: ${service.status === 0 && service.stdout.trim() === "active" ? "active" : "not active"}`);
  console.log(`Staging endpoint configuration: ${staging.available ? "configured" : "not configured"}`);
  console.log("Production deploy and external action execution: disabled by this control entry point");
  return 0;
}

function usage() {
  console.log("Usage: ./afuza <status|doctor|plan|verify|report|run|resume|ecosystem|portfolio|inbox> [options]");
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command === "ecosystem") {
    const context = loadContext();
    return runEcosystemCommand(context.ecosystem, args[0]);
  }
  if (command === "ecosystem") {
    const context = loadContext();
    return runEcosystemCommand(context.ecosystem, args[0]);
  }
  if (!command || !["status", "doctor", "plan", "verify", "report", "run", "resume", "portfolio", "inbox"].includes(command)) {
    usage();
    return command ? 2 : 0;
  }
  const options = { stagingSmoke: args.includes("--staging-smoke"), skipStagingSmoke: args.includes("--no-staging-smoke"), commandName: command };
  const context = loadContext();
  if (command === "portfolio") return runPortfolioCommand(context, args);
  if (command === "inbox") return runInboxCommand(context, args);
  switch (command) {
    case "status":
      printStatus(context);
      return 0;
    case "doctor":
      return doctor(context);
    case "plan":
      printPlan(context);
      return 0;
    case "verify":
      return (await verify(context, options)) ? 0 : 1;
    case "report":
      process.stdout.write(writeReport(context));
      return 0;
    case "run":
      return dispatchTask(context);
    case "resume":
      return resume(context, options);
    default:
      return 2;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(`afuza: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { approvalRequirementsFor, createEcosystemReport, findDirectedCycles, findProjectCycles, loadContext, readinessFailures, runStagingSmoke, stagingSmokeDisposition, stagingTargetsAllowed, taskEligibility, validateEcosystemData };
