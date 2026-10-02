# External Evidence Inbox

Place a normalized JSON artifact in this directory and run `./afuza inbox import <file>`.

Supported `artifact_type` values are `source_reconciliation`, `business_decision`, and `external_evidence`. The importer validates the envelope and each record, hashes the exact input bytes, rejects conflicting artifact IDs, and is idempotent by checksum. Only allowlisted normalized fields are applied; artifact contents never execute commands. Imports do not trigger production actions or promote autonomous readiness automatically.

Successful imports create a checksum receipt under `processed/`. Invalid or conflicting imports create a rejection receipt under `rejected/`; raw artifact bodies are not copied into either receipt. Never include secrets or full business documents.
