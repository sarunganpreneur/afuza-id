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

Before enabling a real provider, implement and review its adapter, define how it receives bounded task context, provision a disposable worktree, enforce path and command restrictions, execute task-specific and generic gates, implement scoped commit/push and remote SHA verification, and add failure/recovery tests. Staging deployment remains separately disabled until a project-specific command and post-deploy checks are explicitly configured. No real worker is available in this phase.
