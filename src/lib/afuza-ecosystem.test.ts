import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

type Project = {
  id: string;
  spec_readiness?: string;
  autonomous_build_readiness: string;
  execution_state?: string;
  execution_transitions?: Array<{ from_state: string; to_state: string; evidence: string[] }>;
  repository_path: string | null;
  external_source_required: boolean;
};

type Source = {
  id: string;
  project: string;
  status: string;
  conflicts_with: string[];
  source_type?: string;
  external_document_id?: string | null;
  document_title?: string;
  version?: string | null;
  authority_classification?: string;
  last_known_metadata?: {
    contents_copied_to_repository?: boolean;
    document_id_status?: string;
  };
  reconciliation_status?: string;
};

type Requirement = {
  id: string;
  dependencies: string[];
  business_acceptance_criteria: string[];
  unresolved_questions: string[];
  readiness_status: string;
};

type Capability = {
  id: string;
  owner_status: string;
};

type EcosystemData = {
  projects: { projects: Project[] };
  sourceInventory: { sources: Source[] };
  capabilities: { capabilities: Capability[] };
  requirements: { requirements: Requirement[] };
  dependencies: {
    edges: Array<Record<string, string>>;
    cycles: string[][];
    requirement_cycles: string[][];
    queue_cycles: string[][];
    orphan_projects: string[];
    unowned_capabilities: string[];
  };
  readiness: { projects: Array<Record<string, unknown>> };
  executionQueue: { items: Array<Record<string, unknown>> };
};

interface EcosystemControlApi {
  loadContext: () => { state: { status: string; active_workstream: string | null; quality_gates: Record<string, string> }; ecosystem: EcosystemData & { validation: { projects: Map<string, unknown>; sources: Map<string, unknown>; capabilities: Map<string, unknown>; requirements: Map<string, unknown>; queue: Map<string, unknown>; cycles: unknown[]; requirementCycles: unknown[]; queueCycles: unknown[]; orphans: string[]; unowned: string[] } } };
  validateEcosystemData: (data: EcosystemData) => unknown;
  findDirectedCycles: (ids: string[], dependenciesFor: (id: string) => string[]) => string[][];
  createEcosystemReport: (ecosystem: EcosystemData & {
    config: { ecosystem: { id: string } };
    dependencies: { edges: unknown[] };
    executionQueue: { planning_only: boolean; items: Array<{ classification: string; title: string; project_id: string }> };
    validation: { projects: Map<string, Project>; sources: Map<string, Source>; capabilities: Map<string, unknown>; requirements: Map<string, Requirement>; queue: Map<string, unknown>; readiness: Map<string, { project_id: string; status: string; external_source_required: boolean }>; edges: unknown[]; cycles: unknown[]; requirementCycles: unknown[]; queueCycles: unknown[]; orphans: string[]; unowned: string[] };
  }) => string;
}

const require = createRequire(import.meta.url);
const control = require("../../scripts/afuza.cjs") as EcosystemControlApi;

function ecosystemFixture(): EcosystemData {
  return structuredClone(control.loadContext().ecosystem);
}

describe("Afuza ecosystem registry", () => {
  it("loads the portfolio inventory without changing AX-01 closure state", () => {
    const context = control.loadContext();
    expect(context.state.active_workstream).toBe("AX-01");
    expect(["EXECUTION_FOUNDATION_COMPLETE", "BLOCKED"]).toContain(context.state.status);
    expect(context.ecosystem.validation.projects.size).toBeGreaterThanOrEqual(15);
    expect(context.ecosystem.validation.sources.size).toBeGreaterThanOrEqual(35);
  });

  it("rejects duplicate project and requirement identities", () => {
    const data = ecosystemFixture();
    data.projects.projects.push(structuredClone(data.projects.projects[0]));
    expect(() => control.validateEcosystemData(data)).toThrow("Duplicate project id");
  });

  it("rejects dangling source-conflict references", () => {
    const data = ecosystemFixture();
    data.sourceInventory.sources[0].conflicts_with.push("missing-source");
    expect(() => control.validateEcosystemData(data)).toThrow("unknown conflicting source");
  });

  it("rejects dependency edges with unknown endpoints", () => {
    const data = ecosystemFixture();
    data.dependencies.edges[0].to_id = "not-registered";
    expect(() => control.validateEcosystemData(data)).toThrow("references unknown project");
  });

  it("rejects cycle summaries that do not match the dependency graph", () => {
    const data = ecosystemFixture();
    data.dependencies.cycles.push(["fake", "cycle"]);
    expect(() => control.validateEcosystemData(data)).toThrow("cycle");
  });

  it("rejects duplicate normalized requirement identities", () => {
    const data = ecosystemFixture();
    data.requirements.requirements.push(structuredClone(data.requirements.requirements[0]));
    expect(() => control.validateEcosystemData(data)).toThrow("Duplicate requirement id");
  });

  it("rejects autonomous readiness while acceptance criteria remain incomplete", () => {
    const data = ecosystemFixture();
    const project = data.projects.projects.find((item) => item.id === "afuza.ecosystem");
    const readiness = data.readiness.projects.find((item) => item.project_id === "afuza.ecosystem");
    if (!project || !readiness) throw new Error("portfolio readiness fixture is incomplete");
    project.autonomous_build_readiness = "AUTONOMOUS_BUILD_READY";
    readiness.status = "AUTONOMOUS_BUILD_READY";
    readiness.acceptance_criteria_complete = false;
    expect(() => control.validateEcosystemData(data)).toThrow("cannot be AUTONOMOUS_BUILD_READY");
  });

  it("rejects EXECUTION_SPEC_READY when acceptance criteria remain incomplete", () => {
    const data = ecosystemFixture();
    const project = data.projects.projects.find((item) => item.id === "afuza.ecosystem");
    const readiness = data.readiness.projects.find((item) => item.project_id === "afuza.ecosystem");
    if (!project || !readiness) throw new Error("portfolio readiness fixture is incomplete");
    project.autonomous_build_readiness = "EXECUTION_SPEC_READY";
    readiness.status = "EXECUTION_SPEC_READY";
    readiness.acceptance_criteria_complete = false;
    expect(() => control.validateEcosystemData(data)).toThrow("cannot be EXECUTION_SPEC_READY");
  });

  it("allows EXECUTION_SPEC_READY with complete spec evidence while infrastructure gates remain open", () => {
    const data = ecosystemFixture();
    const project = data.projects.projects.find((item) => item.id === "chalwa.id");
    const readiness = data.readiness.projects.find((item) => item.project_id === "chalwa.id");
    if (!project || !readiness) throw new Error("CHALWA readiness fixture is incomplete");
    project.autonomous_build_readiness = "EXECUTION_SPEC_READY";
    readiness.status = "EXECUTION_SPEC_READY";
    readiness.source_of_truth_quality = "STRONG";
    readiness.prd_completeness = "COMPLETE";
    readiness.authoritative_specification_available = true;
    readiness.acceptance_criteria_complete = true;
    readiness.architecture_available = true;
    readiness.implementation_sequence_available = true;
    readiness.testability = "STRATEGY_DEFINED";
    readiness.dependencies_resolved = false;
    readiness.environment_ready = false;
    readiness.permission_policy_ready = false;
    readiness.external_source_required = false;
    readiness.blockers = ["Repository and environment inventory remain pending."];
    expect(() => control.validateEcosystemData(data)).not.toThrow();

    readiness.authoritative_specification_available = false;
    expect(() => control.validateEcosystemData(data)).toThrow("cannot be EXECUTION_SPEC_READY");
  });

  it("rejects EXECUTION_SPEC_READY without implementation sequencing", () => {
    const data = ecosystemFixture();
    const project = data.projects.projects.find((item) => item.id === "chalwa.id");
    const readiness = data.readiness.projects.find((item) => item.project_id === "chalwa.id");
    if (!project || !readiness) throw new Error("CHALWA readiness fixture is incomplete");
    project.autonomous_build_readiness = "EXECUTION_SPEC_READY";
    readiness.status = "EXECUTION_SPEC_READY";
    readiness.source_of_truth_quality = "STRONG";
    readiness.prd_completeness = "COMPLETE";
    readiness.authoritative_specification_available = true;
    readiness.acceptance_criteria_complete = true;
    readiness.architecture_available = true;
    readiness.implementation_sequence_available = false;
    readiness.testability = "STRATEGY_DEFINED";
    readiness.external_source_required = false;
    expect(() => control.validateEcosystemData(data)).toThrow("cannot be EXECUTION_SPEC_READY");
  });

  it("requires verified runtime, staging, and ownership status for autonomous readiness", () => {
    const data = ecosystemFixture();
    const project = data.projects.projects.find((item) => item.id === "chalwa.id");
    const readiness = data.readiness.projects.find((item) => item.project_id === "chalwa.id");
    if (!project || !readiness) throw new Error("CHALWA readiness fixture is incomplete");
    project.autonomous_build_readiness = "AUTONOMOUS_BUILD_READY";
    Object.assign(readiness, {
      status: "AUTONOMOUS_BUILD_READY",
      source_of_truth_quality: "STRONG",
      prd_completeness: "COMPLETE",
      authoritative_specification_available: true,
      acceptance_criteria_complete: true,
      architecture_available: true,
      implementation_sequence_available: true,
      repository_runtime_verified: true,
      staging_path_available: true,
      ownership_conflict_status: "NONE",
      dependencies_resolved: true,
      environment_ready: true,
      testability: "STRATEGY_DEFINED",
      permission_policy_ready: true,
      external_source_required: false,
      blockers: [],
    });
    expect(() => control.validateEcosystemData(data)).not.toThrow();

    readiness.repository_runtime_verified = false;
    expect(() => control.validateEcosystemData(data)).toThrow("cannot be AUTONOMOUS_BUILD_READY");
  });

  it("detects requirement and planning dependency cycles", () => {
    const dependencies = new Map([["REQ-A", ["REQ-B"]], ["REQ-B", ["REQ-A"]]]);
    expect(control.findDirectedCycles(["REQ-A", "REQ-B"], (id) => dependencies.get(id) ?? [])).toHaveLength(1);
  });

  it("keeps absent external documentation distinct from a confirmed missing PRD", () => {
    const data = ecosystemFixture();
    const pasok = data.projects.projects.find((item) => item.id === "pasok.in");
    expect(pasok?.autonomous_build_readiness).toBe("PRD_MISSING_EXTERNAL");
    expect(data.readiness.projects.find((item) => item.project_id === "pasok.in")?.external_source_required).toBe(true);
  });

  it("records authorized repository paths while preserving unknown paths for unresolved external-source projects", () => {
    const data = ecosystemFixture();
    for (const id of ["pasok.in", "hiksas", "konsultanhalal"]) {
      const project = data.projects.projects.find((item) => item.id === id);
      expect(project?.repository_path).toBeNull();
    }
    expect(data.projects.projects.find((item) => item.id === "chalwa.id")?.repository_path).toBe("/home/afuzaid/apps/chalwa");
    expect(data.projects.projects.find((item) => item.id === "klodhost")?.repository_path).toBe("/home/afuzaid/apps/klodhost");
    expect(data.projects.projects.find((item) => item.id === "marketing-agency")?.repository_path).toBe("/home/afuzaid/apps/marketing-agency");
    for (const id of ["chalwa.id", "klodhost", "marketing-agency"]) {
      expect(data.projects.projects.find((item) => item.id === id)?.external_source_required).toBe(false);
    }
    for (const id of ["pasok.in", "hiksas", "konsultanhalal"]) {
      expect(data.projects.projects.find((item) => item.id === id)?.external_source_required).toBe(true);
    }
  });

  it("records all verified Drive document titles and IDs without copying contents", () => {
    const data = ecosystemFixture();
    const documents = data.sourceInventory.sources.filter((source) => source.source_type === "google_drive_document");
    expect(documents).toHaveLength(24);
    const identifiedIds = documents.filter((source) => typeof source.external_document_id === "string" && source.external_document_id.length > 10);
    expect(identifiedIds.length).toBeGreaterThan(0);
    expect(documents.filter((source) => source.external_document_id === null)).toHaveLength(21);
    expect(documents.every((source) => source.document_title && source.last_known_metadata?.contents_copied_to_repository === false)).toBe(true);
    expect(documents.filter((source) => source.last_known_metadata?.document_id_status === "AVAILABLE")).toHaveLength(3);
    expect(documents.filter((source) => source.last_known_metadata?.document_id_status === "NOT_PROVIDED")).toHaveLength(21);
    expect(documents.filter((source) => source.reconciliation_status === "CONTENT_RECONCILED")).toHaveLength(0);
    expect(documents.filter((source) => source.authority_classification === "AUTHORITATIVE").map((source) => source.project).sort()).toEqual([
      "chalwa.id", "chalwa.id", "chalwa.id",
      "klodhost", "klodhost", "klodhost",
      "marketing-agency", "marketing-agency", "marketing-agency",
    ].sort());
  });

  it("binds supplied authoritative PRD IDs to the correct external source records", () => {
    const data = ecosystemFixture();
    const ids = new Map(data.sourceInventory.sources.map((source) => [source.id, source.external_document_id]));
    expect(ids.get("chalwa-prd-v1")).toBe("1QUzwYjYo5XMkBfELQzwBYGxWqAgVtGnCFp5TLs8rCss");
    expect(ids.get("klodhost-master-prd-v1")).toBe("1ZAPRKHLbBhuFtv4IgFdGZJMF39W09PLeHw0cSqqCQGA");
    expect(ids.get("marketing-prd")).toBe("1NqRk1bWu8eSaT482238CHK3l40XmFPMk9xHXjdUss_s");
  });

  it("rejects Google Drive source records that copy document contents into the repository", () => {
    const data = ecosystemFixture();
    const source = data.sourceInventory.sources.find((item) => item.id === "chalwa-prd-v1");
    if (!source?.last_known_metadata) throw new Error("Drive source fixture is missing metadata");
    source.last_known_metadata.contents_copied_to_repository = true;
    expect(() => control.validateEcosystemData(data)).toThrow("must not copy contents");
  });

  it("applies reconciled specification readiness without claiming autonomous build readiness", () => {
    const data = ecosystemFixture();
    for (const id of ["chalwa.id", "klodhost", "marketing-agency"]) {
      const readiness = data.readiness.projects.find((item) => item.project_id === id);
      expect(readiness?.status).toBe("AUTONOMOUS_BUILD_READY");
      expect(readiness?.authoritative_specification_available).toBe(true);
      expect(readiness?.acceptance_criteria_complete).toBe(true);
      expect(readiness?.architecture_available).toBe(true);
      expect(readiness?.implementation_sequence_available).toBe(true);
      expect(readiness?.testability).toBe("STRATEGY_DEFINED");
      expect(readiness?.repository_runtime_verified).toBe(true);
      expect(readiness?.environment_ready).toBe(true);
      expect(readiness?.dependencies_resolved).toBe(true);
      expect(readiness?.implementation_evidence).toBe("STRONG");
      expect(data.projects.projects.find((item) => item.id === id)?.autonomous_build_readiness).toBe("AUTONOMOUS_BUILD_READY");
    }
    for (const id of ["pasok.in", "hiksas", "konsultanhalal"]) {
      expect(data.readiness.projects.find((item) => item.project_id === id)?.external_source_required).toBe(true);
      expect(data.projects.projects.find((item) => item.id === id)?.autonomous_build_readiness).toBe("PRD_MISSING_EXTERNAL");
    }
    expect(data.projects.projects.filter((project) => project.id === "chalwa.id" || project.id === "klodhost" || project.id === "marketing-agency").every((project) => project.autonomous_build_readiness === "AUTONOMOUS_BUILD_READY")).toBe(true);
  });

  it("records the three AX-02X next safe inventory actions at the head of the queue", () => {
    const data = ecosystemFixture();
    expect(data.executionQueue.items.slice(0, 3).map((item) => item.id)).toEqual([
      "queue-chalwa-inventory",
      "queue-klodhost-inventory",
      "queue-marketing-phase0-inventory",
    ]);
    expect(data.executionQueue.items.slice(0, 3).every((item) => item.readiness === "EXECUTION_SPEC_READY")).toBe(true);
  });

  it("reports readiness buckets, source-ID gaps and per-project transitions", () => {
    const ecosystem = control.loadContext().ecosystem as Parameters<EcosystemControlApi["createEcosystemReport"]>[0];
    const report = control.createEcosystemReport(ecosystem);
    expect(report).toContain("AUTONOMOUS_BUILD_READY: 3");
    expect(report).toContain("EXECUTION_SPEC_READY: 3");
    expect(report).toContain("BUNDLE_4_READY: 3");
    expect(report).toContain("BUNDLE_2_READY | BUNDLE_3_READY: 3 (CHALWA.id, KlodHost, Marketing Agency)");
    expect(report).toContain("BUNDLE_3_READY | BUNDLE_4_READY: 3 (CHALWA.id, KlodHost, Marketing Agency)");
    expect(report).toContain("- CHALWA.id: Spec: EXECUTION_SPEC_READY; Autonomous: AUTONOMOUS_BUILD_READY; Execution: BUNDLE_4_READY");
    expect(report).toContain("- KlodHost: Spec: EXECUTION_SPEC_READY; Autonomous: AUTONOMOUS_BUILD_READY; Execution: BUNDLE_4_READY");
    expect(report).toContain("- Marketing Agency: Spec: EXECUTION_SPEC_READY; Autonomous: AUTONOMOUS_BUILD_READY; Execution: BUNDLE_4_READY");
    expect(report).toContain("Drive document IDs supplied: 3");
    expect(report).toContain("Contents unavailable pending Google sign-in: 21");
    expect(report).toContain("PASOK.IN");
    expect(report).toContain("HIKSAS");
    expect(report).toContain("KonsultanHalal");
  });

  it("keeps execution state unchanged when autonomous readiness changes", () => {
    const ecosystem = control.loadContext().ecosystem as Parameters<EcosystemControlApi["createEcosystemReport"]>[0];
    const project = ecosystem.validation.projects.get("chalwa.id");
    if (!project) throw new Error("CHALWA project is missing");
    project.autonomous_build_readiness = "IMPLEMENTATION_IN_PROGRESS";
    expect(project.execution_state).toBe("BUNDLE_4_READY");
    expect(control.createEcosystemReport(ecosystem)).toContain("BUNDLE_4_READY: 3");
  });

  it("keeps specification readiness unchanged when execution state changes", () => {
    const ecosystem = control.loadContext().ecosystem as Parameters<EcosystemControlApi["createEcosystemReport"]>[0];
    const project = ecosystem.validation.projects.get("chalwa.id");
    if (!project) throw new Error("CHALWA project is missing");
    project.execution_state = "BUNDLE_2_READY";
    expect(project.spec_readiness).toBe("EXECUTION_SPEC_READY");
    expect(control.createEcosystemReport(ecosystem)).toContain("EXECUTION_SPEC_READY: 3");
  });

  it("counts execution lifecycle from project execution state, not readiness", () => {
    const ecosystem = control.loadContext().ecosystem as Parameters<EcosystemControlApi["createEcosystemReport"]>[0];
    const readiness = ecosystem.validation.readiness.get("chalwa.id");
    if (!readiness) throw new Error("CHALWA readiness record is missing");
    readiness.status = "READY_FOR_HUMAN_TEST";
    expect(control.createEcosystemReport(ecosystem)).toContain("BUNDLE_4_READY: 3");
  });

  it("reports missing legacy execution state as NOT_RECORDED, never as Bundle 2", () => {
    const ecosystem = control.loadContext().ecosystem as Parameters<EcosystemControlApi["createEcosystemReport"]>[0];
    const project = ecosystem.validation.projects.get("afuza.ecosystem");
    if (!project) throw new Error("legacy project is missing");
    delete project.execution_state;
    const report = control.createEcosystemReport(ecosystem);
    expect(report).toContain("NOT_RECORDED: 14");
    expect(report).toContain("BUNDLE_4_READY: 3");
    expect(report).not.toContain("BUNDLE_2_READY: 3");
  });

  it("retains acquisition policy conflicts instead of choosing implementation as business authority", () => {
    const data = ecosystemFixture();
    const scoreSources = data.sourceInventory.sources.filter((source) => ["revenue-data-model", "revenue-scoring-v2", "current-lead-implementation"].includes(source.id));
    expect(scoreSources.map((source) => source.status)).toEqual(["CONFLICTING", "CONFLICTING", "IMPLEMENTATION_EVIDENCE"]);
    expect(data.requirements.requirements.every((requirement) => requirement.readiness_status === "ACCEPTANCE_INCOMPLETE")).toBe(true);
  });
});
