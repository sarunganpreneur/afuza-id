import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Readiness = { project_id: string; status: string; repository_runtime_verified?: boolean; environment_ready?: boolean; dependencies_resolved?: boolean };
type SourceRecord = { id: string; project: string; external_document_id?: string | null; status?: string; authority_classification?: string; reconciliation_status?: string; last_known_metadata?: { contents_copied_to_repository?: boolean } };
type QueueItem = { id: string; project_id?: string; title?: string; dependencies: string[]; classification: string; risk?: string; resource_scopes?: string[]; repository_path?: string; infrastructure_mutation?: boolean; infrastructure_scopes?: string[] };
type Ecosystem = {
  projects: { projects: Array<{ id: string; repository_path?: string | null; dependencies?: string[]; capabilities_consumed?: string[] }> };
  readiness: { projects: Readiness[] };
  executionQueue: { items: QueueItem[] };
  capabilities: { capabilities: Array<{ id: string; classification: string; owner_status: string; provider_project?: string | null }> };
  dependencies: { edges: Array<{ from_type: string; from_id: string; to_type: string; to_id: string; blocking: boolean; status: string }> };
  sourceInventory: { sources: SourceRecord[] };
};
type PortfolioState = { schema_version: number; active_batch_id: string | null; completed_actions: Array<{ action_id: string }>; inbox_imports: unknown[]; decisions: unknown[]; external_evidence: unknown[] };
type PortfolioContext = {
  ecosystem: Ecosystem;
  permissions: { levels: Array<{ id: string; autonomous: boolean }> };
  environments: Record<string, { available?: boolean }>;
  portfolioState: { completed_actions: Array<{ action_id: string }> };
};
type PlanEntry = { project_id: string; action_id: string; action_type: string; classification: string; parallel_safe: boolean; permission_level: string; readiness: string };
type Plan = { entries: PlanEntry[]; collisions: Array<{ action_ids: string[]; reasons: string[] }>; projects_evaluated: number };
type BatchItem = { action_type: string; parallel_safe: boolean; state: string };
type Batch = { status: string; items: BatchItem[] };
type InboxContext = { ecosystem: Ecosystem; portfolioState: PortfolioState; sourceInventory: { sources: SourceRecord[] } };
type InboxResult = { status: string; sha256: string; reason?: string };

const require = createRequire(import.meta.url);
const control = require("../../scripts/afuza.cjs") as {
  loadContext: () => { ecosystem: unknown; permissions: PortfolioContext["permissions"]; environments: { environments: PortfolioContext["environments"] } };
};
const planner = require("../../scripts/portfolio-planner.cjs") as {
  buildPortfolioPlan: (input: PortfolioContext) => Plan;
  createBatch: (plan: Plan, batchId: string, actionIds: string[]) => Batch;
  collisionReasons: (
    left: QueueItem,
    right: QueueItem,
    leftEntry: { action_type: string; parallel_safe: boolean; approvals: string[] },
    rightEntry: { action_type: string; parallel_safe: boolean; approvals: string[] },
  ) => string[];
  transitionBatch: (batch: Batch, transition: string) => Batch;
};
const { createInbox } = require("../../scripts/portfolio-inbox.cjs") as {
  createInbox: (inboxRoot: string, schemaPath: string) => {
    importArtifact: (filePath: string, context: InboxContext) => InboxResult;
    status: (state: PortfolioState) => Record<string, number>;
  };
};

function createPortfolioContext(): PortfolioContext {
  const loaded = control.loadContext();
  return {
    ecosystem: structuredClone(loaded.ecosystem) as Ecosystem,
    permissions: loaded.permissions,
    environments: loaded.environments.environments,
    portfolioState: { completed_actions: [] },
  };
}

function createInboxContext(inboxRoot: string): { inbox: ReturnType<typeof createInbox>; context: InboxContext } {
  const loaded = createPortfolioContext();
  return {
    inbox: createInbox(inboxRoot, path.resolve(__dirname, "../../.afuzactl/ecosystem/schemas/inbox-artifact.schema.json")),
    context: {
      ecosystem: loaded.ecosystem,
      sourceInventory: loaded.ecosystem.sourceInventory,
      portfolioState: { schema_version: 1, active_batch_id: null, completed_actions: [], inbox_imports: [], decisions: [], external_evidence: [] },
    },
  };
}

describe("AX-03 portfolio planner", () => {
  it("classifies the three independent read-only inventories in parallel and preserves blockers", () => {
    const input = createPortfolioContext();
    const plan = planner.buildPortfolioPlan(input);
    const inventory = plan.entries.filter((entry) => entry.action_type === "READ_ONLY_INVENTORY" && entry.classification === "PARALLEL");
    expect(inventory.map((entry) => entry.project_id)).toEqual(["chalwa.id", "klodhost", "marketing-agency"]);
    expect(inventory.every((entry) => entry.classification === "PARALLEL" && entry.parallel_safe && entry.permission_level === "L0")).toBe(true);
    expect(plan.collisions).toHaveLength(0);
    expect(plan.projects_evaluated).toBe(17);
    expect(plan.entries.filter((entry) => entry.classification === "EXTERNAL_SOURCE_REQUIRED").map((entry) => entry.project_id)).toEqual(expect.arrayContaining(["pasok.in", "hiksas", "konsultanhalal"]));
    expect(plan.entries.filter((entry) => entry.classification === "HUMAN_DECISION").every((entry) => entry.permission_level === "L5")).toBe(true);
  });

  it("blocks queue work on unfinished dependencies and uses capability/dependency graphs", () => {
    const input = createPortfolioContext();
    const item = input.ecosystem.executionQueue.items.find((entry) => entry.id === "queue-lp-factory-boundary");
    expect(item?.dependencies).toContain("queue-portfolio-source-sync");
    const plan = planner.buildPortfolioPlan(input);
    expect(plan.entries.find((entry) => entry.action_id === "queue-lp-factory-boundary")?.classification).toBe("WAITING_DEPENDENCY");
  });

  it("detects shared resource, repository, infrastructure, dependency, and approval collisions", () => {
    const left: QueueItem = { id: "left", dependencies: [], classification: "READY_TO_PLAN", resource_scopes: ["repo:shared"], repository_path: "/repo/shared", infrastructure_mutation: true, infrastructure_scopes: ["nginx"] };
    const right: QueueItem = { id: "right", dependencies: ["left"], classification: "READY_TO_PLAN", resource_scopes: ["repo:shared"], repository_path: "/repo/shared", infrastructure_mutation: true, infrastructure_scopes: ["nginx"] };
    const reasons = planner.collisionReasons(left, right,
      { action_type: "IMPLEMENT", parallel_safe: false, approvals: [] },
      { action_type: "READ_ONLY_INVENTORY", parallel_safe: true, approvals: ["owner"] });
    expect(reasons.join(" ")).toContain("Shared resource scopes");
    expect(reasons.join(" ")).toContain("same repository");
    expect(reasons.join(" ")).toContain("share mutable infrastructure");
    expect(reasons.join(" ")).toContain("depend on one another");
    expect(reasons.join(" ")).toContain("requires approval");
  });

  it("demotes parallel candidates that collide and blocks mutations without a project environment", () => {
    const collisionInput = createPortfolioContext();
    const first = collisionInput.ecosystem.executionQueue.items.find((item) => item.id === "queue-chalwa-inventory");
    const second = collisionInput.ecosystem.executionQueue.items.find((item) => item.id === "queue-klodhost-inventory");
    if (!first || !second) throw new Error("inventory queue fixture is incomplete");
    first.resource_scopes = ["readonly:portfolio-roots"];
    second.resource_scopes = ["readonly:portfolio-roots"];
    const collided = planner.buildPortfolioPlan(collisionInput);
    expect(collided.collisions).toHaveLength(1);
    expect(collided.entries.filter((entry) => ["queue-chalwa-inventory", "queue-klodhost-inventory"].includes(entry.action_id)).every((entry) => entry.classification === "RUN_NOW" && !entry.parallel_safe)).toBe(true);

    const environmentInput = createPortfolioContext();
    const project = environmentInput.ecosystem.projects.projects.find((entry) => entry.id === "chalwa.id");
    const readiness = environmentInput.ecosystem.readiness.projects.find((entry) => entry.project_id === "chalwa.id");
    if (!project || !readiness) throw new Error("CHALWA planner fixture is incomplete");
    environmentInput.ecosystem.executionQueue.items.push({ id: "queue-chalwa-safe-build", project_id: "chalwa.id", title: "Test eligible build action", dependencies: [], classification: "READY_TO_PLAN", risk: "low" });
    const waiting = planner.buildPortfolioPlan(environmentInput);
    expect(waiting.entries.find((entry) => entry.action_id === "queue-chalwa-safe-build")?.classification).toBe("RUN_NOW");

    project.repository_path = "/home/afuzaid/apps/chalwa";
    readiness.environment_ready = true;
    const ready = planner.buildPortfolioPlan(environmentInput);
    expect(ready.entries.find((entry) => entry.action_id === "queue-chalwa-safe-build")?.classification).toBe("RUN_NOW");
  });

  it("does not promote readiness when repository, runtime, environment, or dependencies are unverified", () => {
    const input = createPortfolioContext();
    const plan = planner.buildPortfolioPlan(input);
    for (const id of ["chalwa.id", "klodhost", "marketing-agency"]) {
      const readiness = input.ecosystem.readiness.projects.find((entry) => entry.project_id === id);
      expect(readiness?.status).toBe("READY_FOR_HUMAN_TEST");
      expect(readiness?.repository_runtime_verified).toBe(true);
      expect(readiness?.environment_ready).toBe(true);
      expect(readiness?.dependencies_resolved).toBe(true);
      expect(plan.entries.find((entry) => entry.project_id === id)?.readiness).toBe("READY_FOR_HUMAN_TEST");
    }
    expect(input.ecosystem.readiness.projects.filter((entry) => entry.project_id === "chalwa.id" || entry.project_id === "klodhost" || entry.project_id === "marketing-agency").every((entry) => entry.status === "READY_FOR_HUMAN_TEST")).toBe(true);
  });

  it("guards read-only batch start and completion transitions", () => {
    const plan = planner.buildPortfolioPlan(createPortfolioContext());
    const actions = plan.entries.filter((entry) => entry.classification === "PARALLEL").map((entry) => entry.action_id);
    const batch = planner.createBatch(plan, "test-batch", actions);
    expect(batch.status).toBe("READY");
    planner.transitionBatch(batch, "START");
    expect(batch.items.every((item) => item.state === "IN_PROGRESS")).toBe(true);
    expect(() => planner.transitionBatch(batch, "COMPLETE")).toThrow("all completed items");
    for (const item of batch.items) item.state = "COMPLETED";
    planner.transitionBatch(batch, "COMPLETE");
    expect(batch.status).toBe("COMPLETED");
    expect(() => planner.transitionBatch(batch, "START")).toThrow("collision-free safe-preparation batch");
  });
});

describe("AX-03 evidence inbox", () => {
  it("validates source ownership, imports normalized fields, hashes content, and is idempotent", () => {
    const root = mkdtempSync(path.join(tmpdir(), "afuza-inbox-"));
    try {
      const { inbox, context } = createInboxContext(root);
      const artifact = {
        schema_version: 1, artifact_type: "source_reconciliation", artifact_id: "test-source-001", created_at: new Date().toISOString(),
        records: [{ source_id: "chalwa-prd-v1", project_id: "chalwa.id", external_document_id: "1QUzwYjYo5XMkBfELQzwBYGxWqAgVtGnCFp5TLs8rCss", authority_classification: "AUTHORITATIVE", reconciliation_status: "CONTENT_RECONCILED", evidence_summary: ["Acceptance evidence verified."], contents_copied_to_repository: false }],
      };
      const file = path.join(root, "source.json");
      writeFileSync(file, JSON.stringify(artifact));
      const result = inbox.importArtifact(file, context);
      expect(result.status).toBe("PROCESSED");
      expect(context.portfolioState.inbox_imports).toHaveLength(1);
      const source = context.sourceInventory.sources.find((item) => item.id === "chalwa-prd-v1");
      expect(source?.reconciliation_status).toBe("CONTENT_RECONCILED");
      expect(source?.last_known_metadata?.contents_copied_to_repository).toBe(false);
      expect(inbox.importArtifact(file, context).status).toBe("IDEMPOTENT");
      expect(context.portfolioState.inbox_imports).toHaveLength(1);
      const receipt = readFileSync(path.join(root, "processed", `${result.sha256}.json`), "utf8");
      expect(receipt).not.toContain("Acceptance evidence verified.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects malformed and ownership-mismatched artifacts without applying them", () => {
    const root = mkdtempSync(path.join(tmpdir(), "afuza-inbox-"));
    try {
      const { inbox, context } = createInboxContext(root);
      const malformed = path.join(root, "malformed.json");
      writeFileSync(malformed, "{bad json");
      expect(inbox.importArtifact(malformed, context).status).toBe("REJECTED");
      const mismatch = path.join(root, "mismatch.json");
      writeFileSync(mismatch, JSON.stringify({
        schema_version: 1, artifact_type: "source_reconciliation", artifact_id: "bad-owner", created_at: new Date().toISOString(),
        records: [{ source_id: "chalwa-prd-v1", project_id: "klodhost", external_document_id: "1QUzwYjYo5XMkBfELQzwBYGxWqAgVtGnCFp5TLs8rCss", authority_classification: "AUTHORITATIVE", reconciliation_status: "CONTENT_RECONCILED", evidence_summary: [] }],
      }));
      expect(inbox.importArtifact(mismatch, context).status).toBe("REJECTED");
      expect(context.portfolioState.inbox_imports).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports normalized business decisions and external evidence without triggering execution", () => {
    const root = mkdtempSync(path.join(tmpdir(), "afuza-inbox-"));
    try {
      const { inbox, context } = createInboxContext(root);
      const records = [
        ["business_decision", { decision_id: "d1", project_id: "chalwa.id", topic: "repo", outcome: "separate repository", status: "APPROVED", evidence_summary: ["owner record"] }],
        ["external_evidence", { evidence_id: "e1", project_id: "klodhost", category: "runtime", summary: "local runtime checked", source_reference: "inventory/klodhost.json" }],
      ] as const;
      for (const [artifactType, record] of records) {
        const file = path.join(root, `${artifactType}.json`);
        writeFileSync(file, JSON.stringify({ schema_version: 1, artifact_type: artifactType, artifact_id: artifactType, created_at: new Date().toISOString(), records: [record] }));
        expect(inbox.importArtifact(file, context).status).toBe("PROCESSED");
      }
      expect(context.portfolioState.decisions).toHaveLength(1);
      expect(context.portfolioState.external_evidence).toHaveLength(1);
      expect(context.portfolioState.active_batch_id).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
