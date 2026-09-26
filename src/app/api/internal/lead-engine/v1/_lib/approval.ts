import type { CommercialLeadRow } from "./store";

export const FIRST_CONTACT_APPROVAL_ACTION = "FIRST_CONTACT" as const;
export const FIRST_CONTACT_APPROVAL_RISK = "MEDIUM" as const;
export const FIRST_CONTACT_CHANNEL = "WHATSAPP" as const;

export type FirstContactEligibilityBlocker =
  | "LEAD_NOT_QUALIFIED"
  | "DO_NOT_CONTACT"
  | "CONTACT_SUPPRESSED"
  | "BUSINESS_INACTIVE"
  | "PUBLIC_WHATSAPP_REQUIRED"
  | "PUBLIC_CONTACT_NOT_VERIFIED";

export type FirstContactEligibility =
  | { eligible: true; blocker: null }
  | { eligible: false; blocker: FirstContactEligibilityBlocker };

export function evaluateFirstContactEligibility(
  lead: CommercialLeadRow,
  options: { contactSuppressed: boolean },
): FirstContactEligibility {
  if (lead.do_not_contact || lead.pipeline_stage === "DO_NOT_CONTACT") {
    return { eligible: false, blocker: "DO_NOT_CONTACT" };
  }

  if (options.contactSuppressed) {
    return { eligible: false, blocker: "CONTACT_SUPPRESSED" };
  }

  if (lead.pipeline_stage !== "QUALIFIED" || lead.score < 60) {
    return { eligible: false, blocker: "LEAD_NOT_QUALIFIED" };
  }

  if (!lead.business_active) {
    return { eligible: false, blocker: "BUSINESS_INACTIVE" };
  }

  if (!lead.has_public_whatsapp || !lead.whatsapp) {
    return { eligible: false, blocker: "PUBLIC_WHATSAPP_REQUIRED" };
  }

  if (!lead.public_contact_verified) {
    return { eligible: false, blocker: "PUBLIC_CONTACT_NOT_VERIFIED" };
  }

  return { eligible: true, blocker: null };
}
