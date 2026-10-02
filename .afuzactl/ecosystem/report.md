# Afuza Ecosystem Discovery Report

- Registry: afuza.ecosystem
- Projects registered: 17
- Source documents/references: 77
- Normalized requirements: 5
- Dependency edges: 15
- Planning only: true

## Readiness

Spec readiness:
- DISCOVERED: 1
- EXECUTION_SPEC_READY: 3
- IMPLEMENTATION_IN_PROGRESS: 2
- PRD_DRAFT: 1
- PRD_MISSING_EXTERNAL: 3
- SPEC_INCOMPLETE: 7

Autonomous readiness:
- AUTONOMOUS_BUILD_READY: 3

Execution lifecycle:
- BUNDLE_2_READY: 3
- DISCOVERED: 1
- IMPLEMENTATION_IN_PROGRESS: 2
- PRD_DRAFT: 1
- PRD_MISSING_EXTERNAL: 3
- SPEC_INCOMPLETE: 7

## Normalized transitions

- DISCOVERED | DISCOVERED: 1
- EXECUTION_SPEC_READY | AUTONOMOUS_BUILD_READY: 3
- IMPLEMENTATION_IN_PROGRESS | IMPLEMENTATION_IN_PROGRESS: 2
- PRD_DRAFT | PRD_DRAFT: 1
- PRD_MISSING_EXTERNAL | PRD_MISSING_EXTERNAL: 3
- SPEC_INCOMPLETE | SPEC_INCOMPLETE: 7

| Project | Readiness | External source required | Blockers / gaps |
| --- | --- | --- | --- |
| Afuza Ecosystem Portfolio | DISCOVERED | Yes | Registry is discovery/planning metadata only; AX-02 does not authorize portfolio project execution. |
| AFUZA.ID Core | IMPLEMENTATION_IN_PROGRESS | No | AX-01 execution foundation is complete; product requirements for future work must still be compiled from an approved specification. |
| AFUZA OPS Command Center | SPEC_INCOMPLETE | Yes | PRD is draft for implementation and defines Ops as a distinct control plane; deployed route currently serves the AFUZA.ID monolith. Resolve target product/repository boundary. |
| Shared Acquisition Engine | SPEC_INCOMPLETE | Yes | No consolidated authoritative acquisition PRD identified.; Scoring policy conflicts across source docs and implementation.; Outbound approval/send policy conflicts across workflow docs and implementation. |
| AI Lead Finder / Lead Discovery | SPEC_INCOMPLETE | Yes | Discovery source policy, acceptable evidence, and business acceptance thresholds need an approved consolidated specification. |
| LP100 Campaign | SPEC_INCOMPLETE | Yes | Campaign implementation evidence exists, but target segments, campaign acceptance metrics, and offer-policy authority require reconciliation. |
| AFUZA Landing Page Production System / Product Factory | PRD_DRAFT | Yes | Architecture and implementation plan are present; approved product acceptance scope and boundary with existing AFUZA.ID generator need confirmation. |
| AFUZA Creative OS / video.afuza.id | SPEC_INCOMPLETE | Yes | Infrastructure bootstrap explicitly says services/databases/workers are not provisioned; domain ownership and first product acceptance criteria need confirmation. |
| AFUZA AI Workforce Platform | SPEC_INCOMPLETE | Yes | Locked architecture, implementation plan, and accepted stack ADR exist; PRD/business acceptance criteria are partial, deployed API/environment is not ready, and verification strategy is not fully evidenced. |
| OMNIVORA | IMPLEMENTATION_IN_PROGRESS | Yes | README describes a bounded sprint foundation, not a complete portfolio-level PRD; external communication is intentionally disabled. |
| AFUZA Revenue Engine V1 | SPEC_INCOMPLETE | Yes | Multiple workflow generations and scoring versions overlap; policy decisions are unresolved. |
| CHALWA.id | AUTONOMOUS_BUILD_READY | No | None recorded |
| PASOK.IN | PRD_MISSING_EXTERNAL | Yes | Drive project folder is known; inspected Business & Strategy and Product & Technology folders are empty. No completed PRD/spec is inferred; other folders have not been established as authoritative requirements. |
| KlodHost | AUTONOMOUS_BUILD_READY | No | None recorded |
| Marketing Agency | AUTONOMOUS_BUILD_READY | No | None recorded |
| HIKSAS | PRD_MISSING_EXTERNAL | Yes | No authoritative Drive PRD/spec reference identified. |
| KonsultanHalal | PRD_MISSING_EXTERNAL | Yes | No authoritative project PRD package identified. |

## Source Classification

- AUTHORITATIVE: 18
- CANDIDATE: 28
- CONFLICTING: 6
- IMPLEMENTATION_EVIDENCE: 6
- SUPPORTING: 15
- UNKNOWN: 4

## Source metadata

- Drive document IDs supplied: 3
- Contents unavailable pending Google sign-in: 21

## Capabilities

- CANDIDATE_SHARED: 13
- PROJECT_SPECIFIC: 1
- SHARED_CORE: 2
- UNKNOWN: 5

## Dependency Findings

- Cycles: none detected
- Orphan projects: afuza-creative-os, chalwa.id, hiksas, klodhost, konsultanhalal, marketing-agency, omnivora, pasok.in
- Unowned capabilities: email, notifications, observability, outreach, payments-billing, scheduling, whatsapp

## Portfolio Planning Queue

- READY_TO_PLAN: Run read-only repository and environment inventory against the CHALWA implementation plan (chalwa.id)
- READY_TO_PLAN: Run read-only repository inventory and classify GREENFIELD / EXISTING_PARTIAL / EXISTING_CONFLICTING (klodhost)
- READY_TO_PLAN: Execute documented Phase 0 read-only real-infrastructure inventory (marketing-agency)
- HUMAN_DECISION: Resolve scoring and outbound approval policy conflicts (shared-acquisition-engine)
- EXTERNAL_SOURCE_REQUIRED: Inspect registered Drive PRD/spec contents and reconcile acceptance criteria (afuza.ecosystem)
- SPEC_GAP: Clarify Product Factory boundary versus AFUZA.ID generator (afuza-lp-system)
- SPEC_GAP: Complete Creative OS product scope and acceptance criteria (afuza-creative-os)
- EXTERNAL_SOURCE_REQUIRED: Identify authoritative PASOK.IN PRD/spec outside the inspected empty folders (pasok.in)
- EXTERNAL_SOURCE_REQUIRED: Identify HIKSAS authoritative PRD/spec reference (hiksas)
- EXTERNAL_SOURCE_REQUIRED: Identify KonsultanHalal authoritative project PRD reference (konsultanhalal)
- SPEC_GAP: Reconcile local Omnivora architecture with portfolio-level approved requirements (omnivora)
- SPEC_GAP: Compile next AFUZA.ID product requirements after AX-01 (afuza.id)
- READY_TO_PLAN: Prepare decision-authorized standalone CHALWA repository skeleton (chalwa.id)
- READY_TO_PLAN: Prepare decision-authorized provider-agnostic KlodHost repository skeleton (klodhost)
- READY_TO_PLAN: Prepare decision-authorized Marketing Agency repository skeleton and domain ownership README (marketing-agency)
- READY_TO_PLAN: Read-only verify CHALWA development tooling, environment, staging/domain path, and shared interfaces (chalwa.id)
- READY_TO_PLAN: Read-only verify KlodHost Node/tooling availability, staging path, dependencies, and provider-neutral boundary (klodhost)
- READY_TO_PLAN: Read-only verify Marketing Agency runtime, staging/domain convention, shared auth contract, and capability endpoints (marketing-agency)

## Safety

AX-02 is discovery and planning metadata only. Product execution, production changes and outbound external actions are disabled. AX-03 owns future prioritization.
