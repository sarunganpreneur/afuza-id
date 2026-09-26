# AFUZA.ID

AFUZA.ID is a website creation product for business owners. Users save a business brief, an automatic worker generates a reviewable website, and the owner explicitly publishes a version to `https://afuza.id/p/<slug>`.

This is not a Vercel starter app and is not deployed with `create-next-app` defaults.

## Locations

| Role | Path |
| --- | --- |
| Production | `/home/afuzaid/web/afuza.id/private/app` |
| Staging | `/home/afuzaid/web/afuza.id/private/staging-lifecycle` |
| Schema / historical SQL | `/home/afuzaid/web/afuza.id/private/schema` |

Public site: https://afuza.id
Health: https://afuza.id/api/health

## Source of truth

Start here:

- `docs/AFUZA_MASTER_BLUEPRINT.md`
- `docs/ROADMAP.md`
- `docs/releases/AFUZA_V1_BASELINE.md`
- `AGENTS.md`

Older packet READMEs and the 2026-09-12 database snapshot can be stale. See `docs/STALE_DOCUMENTS.md`.

## Local development

From this staging tree:

```bash
npm run dev
```

Quality gates before considering a change ready:

```bash
npm run lint
npm run build
npx tsc --noEmit --pretty false
npm run test -- --run
git diff --check
```

Generation worker (oneshot, one claimed job):

```bash
npm run generation:worker -- --once
```

Production runs the same command from systemd (`afuza-generation-worker.timer` → `afuza-generation-worker.service`). The app unit is `afuza-id.service`.

## Product flow (Generation V1)

Create site → save brief → request generation → review when the job is `RENDERING` and a `site_content_v1` version exists → user publishes → public renderer.

Do not auto-publish. Do not force generation jobs to `LIVE`.

## License / deployment

Production is a systemd Next.js process bound to localhost behind the public site. Do not assume a Vercel deployment model.
