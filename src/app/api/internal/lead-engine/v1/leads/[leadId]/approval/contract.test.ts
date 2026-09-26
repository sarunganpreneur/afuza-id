import { describe, expect, it } from "vitest";

import { APPROVAL_POLICIES } from "@/lib/ops/approvals-registry";

import {
  FIRST_CONTACT_APPROVAL_ACTION,
  FIRST_CONTACT_APPROVAL_RISK,
} from "../../../_lib/approval";

describe("WF-03 approval contract", () => {
  it("registers FIRST_CONTACT as human-approved and non-executing", () => {
    const policy = APPROVAL_POLICIES.find(
      (entry) => entry.action_type === FIRST_CONTACT_APPROVAL_ACTION,
    );

    expect(policy).toMatchObject({
      action_type: "FIRST_CONTACT",
      default_risk: FIRST_CONTACT_APPROVAL_RISK,
      requires_human_approval: true,
      execution_enabled: false,
    });
  });
});
