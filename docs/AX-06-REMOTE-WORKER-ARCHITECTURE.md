# AX-06 Remote Worker Execution Architecture

## Status

Design and contract only. No worker host is provisioned, no remote provider is enabled, and no task is dispatched. The canonical state remains `configured_provider=fake`, `candidate_provider=null`, and `dispatch_enabled=false`.

## Topology and trust boundaries

`afuza-core-01` is the control plane. It owns authorization, backlog selection, approval boundaries, execution-spec generation, dispatch coordination, evidence/state, independent Git verification, quality-gate acceptance, and the only task-completion decision.

`afuza-worker-01` is a separate execution plane. It receives one short-lived request, fetches one approved repository and source branch, checks out the exact starting SHA, creates one disposable workspace, invokes Codex inside a sandbox, runs the requested local validation, and reports/pushes only the task branch allowed by the contract. It cannot authorize work, select another task, change lifecycle state in the control plane, or declare `COMPLETED`.

Production services must not run on the worker host. The worker host must have no production files, production service credentials, control-plane filesystem mounts, production network route, or host service/container-management sockets. Worker compromise is treated as compromise of that job and its dedicated, limited credentials, not as trust in worker claims.

## Provider and dispatch contract

The provider abstraction recognizes `fake` and the future `remote-codex` identifier. The execution contract remains configured for `fake`; `remote-codex` is listed only as a future provider. There is no remote adapter dispatch implementation in this phase. Planning and preflight commands are local and read-only:

```text
node scripts/afuza.cjs delivery remote-worker-plan
node scripts/afuza.cjs delivery remote-worker-inspect
node scripts/afuza.cjs delivery remote-worker-preflight <project>
```

Preflight may read approved backlog/authorization files and the local source-branch ref to build a request candidate. It does not query a remote, fetch, push, start a worker, or execute task code. A passing design preflight does not enable dispatch.

## Request and result schemas

The machine-readable request is `.afuzactl/delivery/schemas/remote-worker-request.schema.json`. It binds `execution_id`, `project_id`, `task_id`, and `approval_id` to the repository clone URL, source branch, exact `starting_sha`, canonical task branch, `/workspace` path scope, Codex sandbox requirement, task objective and gates, resource limits, production exclusion, credential profiles, network policy, and exact permitted Git operations.

The result is `.afuzactl/delivery/schemas/remote-worker-result.schema.json`. It includes the worker identity/provider, starting and result SHAs, changed paths, exit code, gate results, sandbox attestation, resource usage, warnings, approval request/failure information, and Git publication metadata. It intentionally has no completion field. A timeout, failed gate, requested approval, invalid result, or missing/false attestation cannot be accepted as successful output.

The control plane must authenticate the transport envelope, validate both schemas, reject stale/replayed execution IDs and unknown worker identities, fetch the task ref into a dedicated namespace, verify its exact SHA and ancestry from the approved starting SHA, recompute changed paths, enforce allow/deny paths, and independently run required gates. Worker-reported path lists and attestation are not substitutes for control-plane verification.

## Worker filesystem and sandbox

Future host job roots are:

```text
/srv/afuza-worker/jobs/<execution-id>/workspace
/srv/afuza-worker/jobs/<execution-id>/evidence
/srv/afuza-worker/jobs/<execution-id>/result
```

The rootless Podman container sees the job workspace at `/workspace`, writable only there. Its root filesystem should be read-only where compatible, with a private tmpfs `/tmp`; use a non-root UID, no privileged mode, no host PID/network namespace, all capabilities dropped, no-new-privileges, CPU/memory/PID limits, a hard timeout, and automatic container removal. Other jobs and host paths must be absent, not merely hidden by convention.

Explicitly absent from the container and job mount namespace: `/home/afuzaid/apps`, production runtime directories, `/etc/afuza`, SSH home, Git global credentials, systemd control sockets, Docker/Podman sockets, unrelated worktrees, and control-plane filesystems. Only the one repository checkout and required read-only runtime files may be present.

The desired rootless Podman settings are a target, not yet host-verified or executable here. No Podman installation or worker deployment is part of this change.

## Credentials

Never reuse production SSH keys, production API credentials, or `afuza-core-01` service credentials. Never place credentials in task repositories or request bodies.

- GitHub: a dedicated worker identity with repository-scoped read and task-branch push rights only. Enforce branch restrictions with repository rulesets or an equivalent GitHub App policy; ordinary repository write tokens may otherwise write more branches than intended. No permission to modify rulesets, workflows, releases, or repository administration.
- Codex/OpenAI: authenticate on the worker host with a worker-specific identity/configuration, isolated from other users and jobs. Do not mount general `HOME`; do not expose credentials to task processes if the Codex runtime supports a broker/helper handoff. If Codex requires broader home access, do not proceed until a narrower supported mechanism is established.
- Control plane: use short-lived signed request/result envelopes or mutually authenticated outbound polling. Store signing keys in a dedicated secret store, not the worker checkout. Rotate/revoke worker identity independently.

Schema credential profiles are identifiers only. No credential transfer or authentication setup is implemented.

## Network policy

The worker needs outbound HTTPS to Codex/OpenAI and GitHub fetch/push. It must not expose inbound public services. Do not use host networking. Deny private, loopback, link-local, metadata-service, and internal production ranges; permit only required egress through a controlled proxy where practical. The worker should reach the control plane only through an explicitly authenticated dispatch/result channel, preferably by outbound polling rather than an inbound listener.

Hostname allowlisting is not reliably enforced by a simple container network flag because provider/CDN addresses change and DNS rebinding can defeat naive DNS-only rules. Use an egress proxy that resolves names itself, validates destination addresses on each connection, rejects private ranges, and allows only maintained OpenAI and GitHub hostname sets. Enforce network policy outside the worker and record proxy policy/version in attestation. If that cannot be delivered and tested, network-dependent worker execution remains blocked.

## Git model

1. Control plane selects an approved task and pins the local approved source branch SHA.
2. Worker fetches only the specified repository/branch and verifies the fetched SHA equals `starting_sha` before editing.
3. Worker creates exactly `ax06/<project-slug>/<task-id>` and edits only allowed paths.
4. Worker may push only that task branch under a dedicated Git identity and server-side branch rules. It must never push `main` or another base branch, force-push, merge, alter repository settings, or publish other refs.
5. Control plane fetches the task ref into `refs/remotes/ax06-worker/...`, independently verifies exact result SHA and source ancestry, recomputes changed paths, checks policy, and runs canonical gates.
6. Only the control plane decides lifecycle acceptance and `COMPLETED`; merge/deployment remain separate approval-gated actions.

## Lifecycle

Control lifecycle: `READY -> DISPATCHING -> RESULT_RECEIVED -> VERIFYING -> COMPLETED`.

Worker lifecycle: `RECEIVED -> PREPARING -> SANDBOX_READY -> WORKER_RUNNING -> VALIDATING -> PUBLISHING -> RESULT_READY`.

Any stage may terminate `BLOCKED`, `FAILED`, or `AWAITING_APPROVAL`. Worker lifecycle reports are evidence only; control state transitions are authoritative. Worker output cannot transition directly to completion.

## Attestation and evidence

The supervisor must record sandbox active state, non-root UID, `/workspace`, starting SHA, forbidden-path exclusion, absence of forbidden capabilities, production exclusion, rootless runtime and immutable image digest/container identity, timeout/resource policy, and measured resource usage. The attestation should be generated by the trusted launcher, authenticated with the worker service identity, and bound to the execution ID and result SHA. A worker-authored JSON assertion alone is not proof of isolation.

Control evidence should be append-only and include authenticated request/result digests, worker identity, runtime/image identity, policy version, lifecycle timestamps, source/result refs and SHAs, recomputed changed paths, gate outputs, rejection reasons, and the control-plane completion decision. Secrets and credential contents must never enter evidence.

## Recovery and replay

Each execution ID is one-shot. A duplicate, expired, unknown, or already-consumed ID is rejected. A retry requires a new control-authorized execution ID and an explicit retry budget; the current contract defaults to zero retries. On interruption, quarantine the job, preserve bounded evidence/result metadata, and reconcile the remote task ref against the pinned source SHA before any new request. Never infer success from a lost connection or a worker terminal state. Remove disposable workspace/container data after evidence capture according to retention policy; retain only sanitized audit artifacts.

## Infrastructure required for `afuza-worker-01`

- Separate supported Linux VPS/VM dedicated to execution; no production workloads or production mounts.
- Dedicated non-root worker account and rootless Podman configured and tested by an administrator; no Docker group membership and no shared container socket.
- Kernel/host support for user, mount, and network namespaces, cgroups v2 resource controls, seccomp, and the selected rootless networking implementation. These capabilities must be tested on that host before Codex qualification.
- Immutable, reviewed worker image pinned by digest, containing only Codex runtime, Git, approved project toolchain, and supervisor; signed build provenance and vulnerability/update process.
- Separate encrypted job storage with per-job ownership, quotas, cleanup, and no shared workspace access.
- Dedicated repository-scoped GitHub identity, server-side task branch restrictions, worker-local Codex authentication, and separate short-lived control-channel identity.
- Egress proxy/firewall with tested OpenAI/GitHub allowlists, private-range denial, DNS protections, and no inbound public listener.
- Authenticated control channel, worker registration/identity lifecycle, clock synchronization, audit retention, alerting, and a tested kill/revoke procedure.
- Independent acceptance by control plane; no automatic merge, deployment, or production access.

Provisioning, package installation, worker authentication, remote activation, and task dispatch are explicitly out of scope.