# AFUZA.ID Automatic Generation Worker V1

## Status

Repository copy of the production worker units. On 2026-09-15 the host units
`afuza-generation-worker.service` and `afuza-generation-worker.timer` were
observed `active`. Committing these files does not install, enable, start, or
reload systemd. Do not change production systemd without explicit approval.

## Runtime model

The timer starts `afuza-generation-worker.service` after boot and 20 seconds
after the previous service becomes inactive. The service is `Type=oneshot` and
runs exactly one worker invocation:

```text
npm run generation:worker -- --once
```

Because the timer schedules the same oneshot unit with `OnUnitInactiveSec`, it
does not start another instance while the current generation is still running.
V1 intentionally has one global worker process and one claimed job at a time.

## Environment and installation

The service loads `/home/afuzaid/web/afuza.id/private/app/.env.local` through
systemd `EnvironmentFile`. Secrets remain in `.env.local` and are not copied
into either unit file. The file uses the simple `KEY=value` format accepted by
systemd and currently contains no shell expansion.

The units target the production application tree while remaining uninstalled
artifacts in this repository:

```text
User:              afuzaid
WorkingDirectory:  /home/afuzaid/web/afuza.id/private/app
EnvironmentFile:   /home/afuzaid/web/afuza.id/private/app/.env.local
Command:           /usr/bin/npm run generation:worker -- --once
Timeout:           20 minutes
```

An approved operator may later install both files into `/etc/systemd/system/`,
then run `systemctl daemon-reload`, `systemctl enable`, and `systemctl start`
under the production change process. Those commands are deliberately not part
of this packet.

## Worker behavior audit

- There is no continuous polling mode. The script requires `--once` and exits
  with code `2` when it is omitted or required environment is missing.
- `claim_next_generation_job()` atomically selects the oldest queued job with
  `FOR UPDATE SKIP LOCKED`, updates it to `ANALYZING`, and returns at most one
  row. It is service-role-only.
- Empty queue returns `{ kind: "no_work" }`; the script exits `0` without
  creating an error job.
- A successful single-job run exits `0`. A generation result of `failed` exits
  `1`; the worker records the exact job as `ERROR` through
  `fail_generation_job()` and does not requeue it.
- Unexpected claim/setup failures reject the top-level promise and exit `1`.
- Worker state is local to one invocation; providers, client, and image
  adapters are created for that process and are not retained between jobs.
- The RPC lock and `SKIP LOCKED` behavior prevent two simultaneous workers from
  claiming the same row. The timer keeps V1 global concurrency at one process;
  do not scale this unit horizontally without a separate concurrency review.

## Rollback

Stop and disable the timer through approved systemd change control, then remove
the installed unit files. No database rollback or job requeue is part of this
runtime artifact.

## Review checks

From `staging-lifecycle/`, run the repository quality gates before installation:

```text
npm run lint
npm run build
npx tsc --noEmit --pretty false
npm run test -- --run
git diff --check
```
