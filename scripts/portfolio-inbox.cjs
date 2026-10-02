"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Ajv = require("ajv");

function createInbox(inboxRoot, schemaPath) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, format: "full", schemaId: "auto" });
  const validate = ajv.compile(schema);

  function status(portfolioState) {
    return {
      processed: portfolioState.inbox_imports.length,
      decisions: portfolioState.decisions.length,
      external_evidence: portfolioState.external_evidence.length,
      rejected: fs.existsSync(path.join(inboxRoot, "rejected"))
        ? fs.readdirSync(path.join(inboxRoot, "rejected")).filter((item) => item.endsWith(".json")).length : 0,
    };
  }

  function importArtifact(filePath, { ecosystem, portfolioState, sourceInventory }) {
    fs.mkdirSync(path.join(inboxRoot, "processed"), { recursive: true });
    fs.mkdirSync(path.join(inboxRoot, "rejected"), { recursive: true });
    const bytes = fs.readFileSync(filePath);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    let artifact;
    try {
      artifact = JSON.parse(bytes.toString("utf8"));
    } catch {
      return reject(sha256, "Input is not valid JSON.");
    }
    if (!validate(artifact)) return reject(sha256, ajv.errorsText(validate.errors, { separator: "; " }));
    const prior = portfolioState.inbox_imports.find((item) => item.artifact_id === artifact.artifact_id);
    if (prior) {
      if (prior.sha256 === sha256) return { status: "IDEMPOTENT", artifact_id: artifact.artifact_id, sha256 };
      return reject(sha256, "artifact_id already exists with a different checksum.");
    }

    const projectIds = new Set(ecosystem.projects.projects.map((item) => item.id));
    if (artifact.artifact_type === "source_reconciliation") {
      const sources = new Map(sourceInventory.sources.map((item) => [item.id, item]));
      for (const record of artifact.records) {
        const source = sources.get(record.source_id);
        if (!source || source.project !== record.project_id || !projectIds.has(record.project_id) ||
            source.source_type !== "google_drive_document" || source.external_document_id !== record.external_document_id) {
          return reject(sha256, `Source identity/ownership mismatch for source_id ${record.source_id}.`);
        }
      }
      for (const record of artifact.records) {
        const source = sources.get(record.source_id);
        source.status = record.authority_classification;
        source.authority_classification = record.authority_classification;
        source.reconciliation_status = record.reconciliation_status;
        source.reason = `Imported normalized evidence: ${record.evidence_summary.join("; ")}`.slice(0, 1000);
        source.last_known_metadata.verification_basis = `Inbox artifact ${artifact.artifact_id}; SHA-256 ${sha256}; normalized metadata only`;
        source.last_known_metadata.contents_copied_to_repository = false;
      }
    } else if (artifact.artifact_type === "business_decision") {
      if (artifact.records.some((record) => !projectIds.has(record.project_id))) return reject(sha256, "Decision references an unknown project.");
      portfolioState.decisions.push(...artifact.records.map((record) => ({
        decision_id: record.decision_id,
        project_id: record.project_id,
        category: "EXTERNAL_BUSINESS_DECISION",
        title: record.topic,
        status: record.status,
        authority: "INBOX_EXTERNAL_EVIDENCE",
        recorded_at: artifact.created_at,
        source: `Inbox artifact ${artifact.artifact_id}; SHA-256 ${sha256}`,
        statements: [record.outcome, ...record.evidence_summary],
      })));
    } else {
      if (artifact.records.some((record) => !projectIds.has(record.project_id))) return reject(sha256, "Evidence references an unknown project.");
      portfolioState.external_evidence.push(...artifact.records.map((record) => ({ ...record, artifact_id: artifact.artifact_id, sha256 })));
    }
    portfolioState.inbox_imports.push({
      artifact_id: artifact.artifact_id,
      artifact_type: artifact.artifact_type,
      sha256,
      imported_at: new Date().toISOString(),
      record_count: artifact.records.length,
    });
    writeReceipt("processed", sha256, {
      artifact_id: artifact.artifact_id,
      artifact_type: artifact.artifact_type,
      sha256,
      status: "PROCESSED",
      record_count: artifact.records.length,
    });
    return { status: "PROCESSED", artifact_id: artifact.artifact_id, sha256, record_count: artifact.records.length };
  }

  function reject(sha256, reason) {
    fs.mkdirSync(path.join(inboxRoot, "rejected"), { recursive: true });
    writeReceipt("rejected", sha256, { sha256, status: "REJECTED", reason: String(reason).slice(0, 1000) });
    return { status: "REJECTED", sha256, reason };
  }

  function writeReceipt(directory, sha256, receipt) {
    const target = path.join(inboxRoot, directory, `${sha256}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, target);
  }

  return { importArtifact, status };
}

module.exports = { createInbox };
