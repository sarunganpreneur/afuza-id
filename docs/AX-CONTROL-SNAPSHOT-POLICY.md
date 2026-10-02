# AX Control-Plane Snapshot Policy

## Source of truth

The canonical engineering repository at `/home/afuzaid/engineering/repos/afuza-id` and its committed Git history are the source of truth for AX control-plane definitions and reviewed control state. `.afuzactl/` is version controlled where it contains schemas, project/readiness records, plans, inventories, and other non-secret state. `recovery-manifest.json` is retained with the recovery provenance and validation record.

Production runtime at `/home/afuzaid/apps/afuza-id` is separate. Production deployments must not own, copy over, or erase AX control state. Do not copy `.afuzactl/` into the runtime tree for convenience.

## Mutable state snapshots

Before mutating runtime/control state, take a dated snapshot of the relevant `.afuzactl/` state under `/home/afuzaid/backups/ax-control-plane/YYYY-MM-DD/`, retaining the source commit ID alongside the snapshot. Create a weekly snapshot while the control plane is active; retain the latest 12 weekly snapshots and the latest 12 month-end snapshots. Restrict backup directory permissions to the operator account.

Snapshots must exclude credentials, tokens, private keys, `.env` files, and inbox payloads that have not been normalized and approved for retention. Never copy secrets into Git or snapshots. Validate that a snapshot can be parsed and its source commit is present before pruning older snapshots.

## Schema and control upgrades

Before a schema migration, control-policy change, or AX control upgrade:

1. Commit or otherwise record the current canonical Git state and source commit.
2. Create a dated state snapshot using the exclusions above.
3. Validate the snapshot and preserve a rollback reference.
4. Apply the change in an isolated branch/worktree and run doctor, full verify, and focused control-plane regressions.
5. Promote only after review; retain the pre-change snapshot and Git reference through the rollback window.

Do not perform these steps as part of production deployment. No Bundle 3 execution is implied by a snapshot or control-plane promotion.
