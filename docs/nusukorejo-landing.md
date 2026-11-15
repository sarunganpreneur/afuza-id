# Landing page MWCNU Sukorejo

Target: `https://afuza.id/nusukorejo`

Reference: `https://mwcnusukorejo.or.id/`, captured 15 November 2026.

The route returns a standalone HTML document, preserving the reference
homepage's markup, styles, responsive breakpoints, theme toggle, mobile
navigation, banner carousel, gallery and Indonesian clock. It does not
inherit Afuza's React layout or global CSS. Images, stylesheets and fonts
are stored under `public/nusukorejo-assets/`.

This is a static homepage snapshot. News and agenda do not synchronize
automatically. Secondary pages, login and search link to the original
portal. Home links return to `/nusukorejo`. Contact links retain the
reference's destinations. There is no new admin, database or login system.

## Deployment

Deploy the reviewed change using the existing Afuza VPS application
deployment process. The repository default branch is a control-plane
snapshot; pushing a branch does not establish that production is deployed.
Verify the actual production checkout and commit before integrating this
isolated route and asset directory. No DNS change is required.

After deployment verify `/nusukorejo` returns HTML with status 200,
all `/nusukorejo-assets/` references load, and desktop/mobile navigation,
theme toggle, slides and contact links function. Confirm `/`, `/login`
and `/api/health` retain their existing behavior.

Rollback: revert the landing page commit and redeploy through the same
process. The change does not modify authentication, generation, review,
publish, environment variables, database, DNS or systemd configuration.
