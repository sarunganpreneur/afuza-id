# AX Human-Facing Staging Acceptance Assessment

- Assessed: `2026-10-03`
- Projects: CHALWA.id, KlodHost, Marketing Agency
- Public staging health/readiness: HTTPS 200 for all three (infrastructure evidence only; not human acceptance)
- Browser roots: each returns a JSON `application-ready` status object; no rendered UI
- Surface classification: all three are `API_ONLY`
- Tester materials: no human tester instructions, browser fixture, or tester account exists
- Auth boundary: public actions require protected systemd smoke bearer credentials plus staging identity headers. Credentials are root-owned, mode 0600 at rest/source and are not available to ordinary testers; they must not be distributed.
- Persistence: in-memory, no seeded demo records; service restart clears all records. Each test run requires isolated IDs and data setup, then a staging reset/restart for cleanup.
- Safety: CHALWA only changes its staging in-memory store; KlodHost registry and node-agent are fake-only; Marketing shared capabilities are fake/stub with explicit approval gate. No production/shared service writes or real external actions enabled.
- Decision: no project satisfies the human-facing entrypoint and tester fixture requirements. Keep readiness status unchanged and record `HUMAN_TEST_UI_REQUIRED`; keep execution state `STAGING_READY`.

## CHALWA.id

- URL: `https://chalwa.afuza.id`
- Surface: `API_ONLY`; `/` returns JSON, `/designs`, `/products`, and `/audit` are REST APIs; `/login`, `/dashboard`, and `/docs` return 404.
- Tester auth/fixture: no tester account or browser fixture; bearer smoke credentials are not for ordinary testers.
- Error quality: JSON errors are structured; sampled invalid status is `400 invalid_request`; forbidden access is `403`; domain errors include messages. No stack/environment data observed. There are no inline browser explanations.
- Reset/repeat: in-memory Design/Product/Audit repositories; restart clears records; no seeded demo data.
- `HUMAN_TEST_UI_REQUIRED`: design workspace, review queue with approve/reject controls, product editor/status/publish controls, audit/activity view, and least-privilege browser tester identity/session.

### Future Human Acceptance Script

| Step | Action | Expected result | Failure condition |
| --- | --- | --- | --- |
| 1 | Open the staging URL and sign in with the designated tester account | CHALWA workspace loads and shows available designs/products | JSON response, no login, or no workspace |
| 2 | Create a draft design with a name and asset reference | Draft appears in the design list | Save fails or design is not visible |
| 3 | Move the design to generated and submit it for review | Status and review queue update | Status does not update or review item is missing |
| 4 | Approve one design and reject another | Approval identity/time is visible; rejected design cannot become product-ready | Missing decision evidence or rejected design proceeds |
| 5 | Convert the approved design into a product | Product shows its source design and draft status | Link is missing or unapproved design is accepted |
| 6 | Attempt a duplicate SKU, then use a unique SKU | Duplicate is clearly rejected; unique product is saved | Duplicate accepted or error is unclear |
| 7 | Mark the product ready, publish, then unpublish it | Status changes are visible and reversible per allowed lifecycle | Invalid status accepted or state not visible |
| 8 | Open the product/design activity view | Lifecycle and approval audit entries are readable | Audit evidence unavailable or mismatched |

## KlodHost

- URL: `https://klodhost.afuza.id`
- Surface: `API_ONLY`; `/` returns JSON; provisioning jobs are REST endpoints; `/login`, `/dashboard`, and `/docs` return 404.
- Tester auth/fixture: no tester account/browser fixture; worker/operator credentials are protected smoke credentials and not suitable for tester distribution.
- Error quality: structured JSON `403`, `404`, and domain errors; idempotency and invalid transition details are available at API level, not presented as human workflow feedback.
- Reset/repeat: in-memory job/idempotency/event/resource stores; restart clears jobs; no seeded examples.
- Safety: staging composition is fake-provider only, fake node-agent only; no Contabo invocation or SSH/root execution path is enabled.
- `HUMAN_TEST_UI_REQUIRED`: tenant request form, visible job state/timeline, worker simulation controls gated to tester role, failure/retry/cancel controls, provider-mode indicator, and audit/history view.

### Future Human Acceptance Script

| Step | Action | Expected result | Failure condition |
| --- | --- | --- | --- |
| 1 | Open KlodHost staging and sign in as a staging tenant tester | Tenant workspace and fake-mode banner are visible | JSON only, no workspace, or provider mode unclear |
| 2 | Submit a valid provisioning request | Job appears in `REQUESTED` with a readable identifier | Request rejected or state absent |
| 3 | Advance through validation and queue using the tester simulation control | State timeline shows `VALIDATED` then `QUEUED` | State skips or errors have no explanation |
| 4 | Run the fake provisioning/configuration/verification sequence | Job reaches `ACTIVE`; provider operation marked fake | Real provider name/call, missing progress, or unsafe side effect |
| 5 | Replay the same idempotent action | No duplicate operation; existing job result is shown | Duplicate provider operation or confusing response |
| 6 | Trigger the documented fake failure scenario and retry | Failure is readable and retry returns to queued/provisioning | Failure not visible or retry corrupts state |
| 7 | Cancel a separate eligible job | Job becomes cancelled and history explains the action | Cancellation ignored or state inconsistent |
| 8 | View job history and try another tenant context | Audit timeline is visible; cross-tenant job is hidden/denied | Data crosses tenant boundary or audit is missing |

## Marketing Agency

- URL: `https://marketingagency.afuza.id`
- Surface: `API_ONLY`; `/` returns JSON; tenant/client/assignment/subscription/action/portal routes are REST APIs; `/login`, `/dashboard`, and `/docs` return 404.
- Tester auth/fixture: no human tester account or browser fixture; operator/owner smoke identity requires protected bearer credentials unavailable to ordinary testers.
- Error quality: structured JSON `403` for scope/membership denial and `422` for entitlement/approval failures; messages are readable as API responses but not contextualized in a UI.
- Reset/repeat: in-memory agency repositories; restart clears tenants, memberships, subscriptions, and audit data; no seeded tenant/client fixtures.
- Safety: adapters are fake/stub only; approval gate runs before action adapter; no Campaign/Lead canonical models, WhatsApp, outreach, acquisition, or live shared API calls.
- `HUMAN_TEST_UI_REQUIRED`: clear active-tenant selector/context, tenant/client/membership/assignment/subscription management, capability action and approval workflow, tenant portal, and audit/activity view with least-privilege browser tester sessions.

### Future Human Acceptance Script

| Step | Action | Expected result | Failure condition |
| --- | --- | --- | --- |
| 1 | Open the agency staging URL and sign in as an operator tester | Tenant selector/workspace appears and identifies the active tenant | JSON only or active tenant unclear |
| 2 | Create a disposable tenant and bootstrap its owner membership | Tenant and owner appear in tenant administration | Creation fails or owner scope is absent |
| 3 | Activate tenant and create a client | Client appears under the selected tenant | Client appears elsewhere or cannot be located |
| 4 | Add a member and assign an account | Membership and assignment are visible with matching tenant/user | Mismatched assignment accepted |
| 5 | Subscribe the tenant to the fake lead-discovery capability | Active entitlement is shown for the selected tenant | Entitlement state is hidden or wrong tenant |
| 6 | Request the fake capability action with required approval | Approval request is visible before fake action result | Action bypasses approval or live action occurs |
| 7 | Deny approval, then attempt an inactive/unsubscribed capability | Both actions are blocked with understandable reasons | Adapter executes despite denial/inactive entitlement |
| 8 | Open tenant portal and audit view; switch to another tenant | Only selected tenant data is visible; cross-tenant access is denied | Any cross-tenant record or audit leakage |

## Decision

- CHALWA.id: keep readiness unchanged; `HUMAN_TEST_UI_REQUIRED`; execution remains `STAGING_READY`.
- KlodHost: keep readiness unchanged; `HUMAN_TEST_UI_REQUIRED`; execution remains `STAGING_READY`.
- Marketing Agency: keep readiness unchanged; `HUMAN_TEST_UI_REQUIRED`; execution remains `STAGING_READY`.
- Projects promoted to `READY_FOR_HUMAN_TEST`: NONE.
- Next implementation slice: build bounded browser tester experiences and scoped human-test identities/fixtures for these APIs, then rerun the scripts above. No large UI was built as part of this assessment.
