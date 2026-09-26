# AFUZA Executor Handoff Contract V1

Status: **V1D-A Contract Foundation**

This document defines the protocol boundary between **Afuza Core / Ops Control Plane**
and a future execution worker.

No external executor is connected by this contract.

---

## 1. Core Safety Invariants

The following statements are permanently distinct:

```text
APPROVED != EXECUTED
PREPARED != EXECUTING

OFFER_CREATED != OFFER_DELIVERED
OFFER_DELIVERED != CLAIM_ACCEPTED

CLAIM_REQUESTED != EXECUTING

LEASE_GRANTED = runtime permission to begin executor work

EXECUTING != COMPLETED
COMPLETED != SIDE_EFFECT_VERIFIED
