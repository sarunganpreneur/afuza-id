# AX-06 Execution Contract

## Scope and provider

This contract describes a future task-scoped coding worker. The only enabled provider is `fake`; `local-agent`, `vscode-agent`, `codex`, and `other` are identifiers reserved for future adapters and are not executable. The CLI intentionally has no real execution command. `delivery execution-test <project> --fake` simulates the lifecycle, writes canonical execution evidence, and proves the app repository SHA and status are unchanged. A simulated run marked `COMPLETED` means only that the fake lifecycle simulation completed; the backlog task remains `READY` and `task_completed` remains false.

## Worker interface

Adapters implement `prepare(taskSpec)`, `execute(taskSpec)`, `validate(taskSpec)`, `commit(taskSpec)`, `publish(taskSpec)`, and `finalize(taskSpec)`. The fake adapter plans but does not create a worktree, returns no changed paths, validates gate definitions without running project commands, creates no commit, performs no network publication, and never completes a task. No external coding-AI package or credential is configured.

## Task specification

`.afuzactl/delivery/execution-contract.json` binds project/task IDs, approved source branches and origins, explicit path scopes, acceptance-to-gate mappings, generic quality gates, staging endpoints, and production exclusions. Generated specs are validated by `schemas/execution-spec.schema.json`. Missing acceptance mappings block with `UNMAPPED_ACCEPTANCE_GATE`; an unrecognized backlog verification gate blocks with `UNMAPPED_VERIFICATION_GATE`.

## Lifecycle

The permitted success lifecycle is `READY -> PREPARING -> RUNNING -> VALIDATING -> COMMITTING -> PUBLISHING -> COMPLETED`. `BLOCKED`, `FAILED`, and `AWAITING_APPROVAL` are terminal for an attempt. Runs persist start/completion time, source/result SHA, evidence path, failure reason, retryability, attempt, and `resume_from`. The maximum future attempt count is two. Safety/approval failures are not retryable and never trigger automatic retry. Fake state is persisted separately from lane task state.

A future real run may become task `COMPLETED` only after worker success, path-scope pass, every acceptance and generic gate pass, staging safety pass, a scoped commit, successful normal push, equality of local and remote result SHA, and durable evidence. The fake adapter cannot satisfy those real commit/push conditions.

## Workspace and branches

The approved source is each lane's published AX-06 backlog feature branch. A future worker must revalidate a clean checkout, expected source branch, exact origin URL, remote reachability, and local source SHA equality with the remote before work. The deterministic task branch is `ax06/<project-slug>/<task-id>`, for example `ax06/chalwa/CHW-06-01`; its isolated worktree path is `/home/afuzaid/engineering/worktrees/ax06-execution/<project-slug>/<task-id>`. The task branch originates from the approved feature branch SHA. `main` and the persistent staging checkout are never edited, and automatic merge is prohibited.

## Path and action boundaries

Each task has narrow `allowed_paths`; the worker must reject every changed path outside that set and all `forbidden_paths`. Traversal, absolute paths, secrets, credentials, production configuration, systemd/nginx configuration, deployment credentials, generated dependencies/build output, and unrelated projects are denied. Production deploy/configuration, payment/billing, real provider/node work, outbound messages, destructive migrations, secret/credential changes, DNS/domain changes, go-live, force-push, production-data deletion, readiness promotion, and unapproved cross-project architecture changes are permanently blocked by this contract.

## Gates

Gate definitions support fixed-argv `command`, `file_exists`, `file_contains`, `test_name`, read-only GET `route_exists` and `api_contract`, `schema_assertion`, and `git_diff_check`. Generic commands are restricted to the registered lint, typecheck, test, and build scripts. The fake readiness command checks that mappings are valid but does not run task gates or app quality commands. Custom acceptance gates in this initial contract point at tests the future implementation must add; their presence in the contract does not mean they currently pass.

## Staging and production

Staging health, ready, and fake-mode checks are described in each task spec. Feature deployment is disabled. A future staging deployment requires a published task branch, successful validation, an explicitly configured project staging deployment command, then health/ready success. No production deployment or production mutation is permitted.

## Failure, resume, and completion

A safety, approval, path, source, or remote invariant failure produces `BLOCKED` or `AWAITING_APPROVAL` and is non-retryable without a changed approval/state. An ordinary worker/gate error produces `FAILED`, records its last successful phase as `resume_from`, and may be retried explicitly within the configured maximum. There is no automatic retry. A failed gate stops that lane; independently eligible lanes may be evaluated separately. Evidence records simulation versus real provider mode so fake lifecycle completion cannot be mistaken for feature completion.

## Future real worker integration

The provider-neutral adapter interface is `prepare(spec)`, `invoke(spec, workspace)`, `collectResult()`, `validateResult()`, and `finalize()`. The `local-agent` adapter is implemented as an architecture boundary, but it fails closed unless a runtime and sandbox attest to non-interactive operation, scoped working directory and filesystem, isolated environment, disabled network, command allowlisting, and reliable exit status. No task-dispatch CLI is exposed and `worker_provider` remains `fake`.

The worker receives only the execution ID/task ID/title, objective, starting SHA, allowed and forbidden paths, acceptance criteria and executable gate definitions, plus the isolated worktree path. The invocation environment is reconstructed from an allowlist; inherited credentials are not passed. Its capability request is limited to repository editing, named registered gates, and read-only `git status`/`git diff`. Shell, arbitrary commands, Git writes, commit, push, deployment, production, network, and secrets are denied. The worker result is schema-checked and compared with independently discovered filesystem and Git changes; symlink paths, traversal, forbidden paths, and any path outside task scope fail validation.

Preparation rechecks a clean source checkout, approved source branch, exact remote SHA, task branch availability, and canonical disposable worktree path. It creates `ax06/<project-slug>/<task-id>` beneath `/home/afuzaid/engineering/worktrees/ax06-execution/<project-slug>/<task-id>` from that exact SHA and snapshots the source, staging checkout, and worktree. Staging and production paths are outside the worker root. The orchestrator alone may stage scoped paths, commit, perform a normal push, fetch afterward, and require local/remote result SHA equality. It independently runs mapped acceptance gates, verification gates, generic quality gates, and `git diff --check`; worker output cannot complete a task.

Real-run states are `READY -> PREPARING -> WORKSPACE_READY -> WORKER_RUNNING -> WORKER_FINISHED -> VALIDATING -> COMMITTING -> PUBLISHING -> COMPLETED`; failures are `BLOCKED`, `FAILED`, or `AWAITING_APPROVAL`. Transition events are append-only. Safety and approval failures are non-retryable; ordinary failures may be explicitly retried within `max_attempts`, never automatically. Stale worker-running records require disposable-workspace inspection; a worker-finished record can resume validation. Workspace recovery is restricted to the deterministic clean task worktree and requires explicit confirmation.

Runtime discovery found no coding-agent executable in `afuzaid`'s PATH and no installed filesystem sandbox. The bundled Copilot launcher is root-owned/inaccessible to `afuzaid` and reports that the underlying Copilot CLI is absent; `code` is an editor CLI, not an agent CLI. Therefore no real provider qualifies or is selected. `worker-probe`, `worker-status`, and `execution-preflight` are read-only; no real task dispatch command exists. Staging deployment remains disabled and production remains forbidden. Before activating a real provider, install/authenticate nothing implicitly: an operator must separately provision a runtime and sandbox satisfying every declared capability, review its adapter configuration, and run a non-task worker check before any task authorization.
