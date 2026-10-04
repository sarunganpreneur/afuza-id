# Autonomous Delivery Layer

AX-05F provides a read-only dry-run orchestrator for the CHALWA, KlodHost, and Marketing Agency lanes. Delivery-task state is independent of ecosystem readiness and execution lifecycle. The implementation intentionally does not execute source edits, tests, builds, deploys, or restarts in a lane: until an approved AX-06 milestone exists, task selection remains `AWAITING_APPROVAL`.

## CLI

- `./afuza delivery status`
- `./afuza delivery plan`
- `./afuza delivery run chalwa.id --dry-run`
- `./afuza delivery run klodhost --dry-run`
- `./afuza delivery run marketing-agency --dry-run`
- `./afuza delivery run-all --dry-run`
- `./afuza delivery report`

Dry-run checks repo cleanliness and HEAD, script availability, `git diff --check`, tracked-secret indicators, staging service, health/ready endpoints, loopback-only listener, tester/fake-mode markers, and production-service identity before and after each lane. `run-all` checks lanes concurrently but commits state, per-lane state, evidence, and the canonical report under one exclusive lock.

`run <project>` without `--dry-run` is refused. Production, live provider/payment/message, destructive migration, credential rotation, DNS, cross-project architecture, readiness promotion, go-live, force-push, and production-data deletion actions are approval boundaries and are never run by this layer.

## AX-06 authorization source of truth

For task selection to move beyond `AWAITING_APPROVAL`, create and approve both:

1. Canonical decision: `.afuzactl/delivery/authorizations/AX-06.json`, containing decision ID, approving authority, date, scope, allowed lanes/actions, and explicit exclusions.
2. One lane backlog in each authorized app repo: `docs/AX-06-BACKLOG.md`, with milestone, ordered tasks, acceptance criteria, dependencies, verification gates, and a reference to the canonical decision ID.

The canonical decision and lane backlog must agree on project scope and approval. A file's presence alone is not authorization. Until the selector validates both, no AX-06 task is selected.

## State and evidence

- `lanes.json`: project lane configuration.
- `policy.json`: states and mandatory action boundaries.
- `schemas/task-state.schema.json`: delivery state contract.
- `state.json` and `lanes/*.json`: machine-readable current state.
- `report.md`: serialized human report.
- `evidence/<project>/<run-id>.json`: per-run preflight evidence.
