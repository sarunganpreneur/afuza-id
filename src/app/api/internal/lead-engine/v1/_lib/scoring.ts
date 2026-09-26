import type { CommercialLeadRow } from "./store";

export const LEAD_SCORE_RULE_VERSION = "lead-score-v1";
export const MINIMUM_QUALIFY_SCORE = 60;

export const LEAD_SCORE_WEIGHTS = {
  has_no_website: 25,
  website_low_quality: 15,
  has_public_whatsapp: 15,
  google_maps_active: 10,
  recent_reviews: 10,
  clear_offer: 10,
  business_active: 10,
  instagram_active: 5,
} as const;

export type LeadPriority = "A" | "B" | "WATCH" | "LOW";

export type ScoreBreakdownItem = {
  signal: keyof typeof LEAD_SCORE_WEIGHTS;
  matched: boolean;
  points: number;
};

export type QualificationBlocker =
  | "SCORE_BELOW_60"
  | "BUSINESS_NOT_CONFIRMED_ACTIVE"
  | "DO_NOT_CONTACT"
  | "CONTACT_SUPPRESSED"
  | "NO_PUBLIC_WHATSAPP"
  | "WHATSAPP_MISSING"
  | "PUBLIC_CONTACT_NOT_VERIFIED";

export type LeadScoreResult = {
  score: number;
  priority: LeadPriority;
  qualified: boolean;
  suppressed: boolean;
  scoreRuleVersion: string;
  breakdown: ScoreBreakdownItem[];
  qualificationBlockers: QualificationBlocker[];
};

type ScorableLead = Pick<
  CommercialLeadRow,
  | "has_no_website"
  | "website_low_quality"
  | "has_public_whatsapp"
  | "google_maps_active"
  | "recent_reviews"
  | "clear_offer"
  | "business_active"
  | "instagram_active"
  | "public_contact_verified"
  | "do_not_contact"
  | "whatsapp"
>;

export function priorityForScore(score: number): LeadPriority {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "WATCH";
  return "LOW";
}

export function calculateLeadScore(
  lead: ScorableLead,
  options: { contactSuppressed?: boolean } = {},
): LeadScoreResult {
  const breakdown = (
    Object.entries(LEAD_SCORE_WEIGHTS) as Array<
      [keyof typeof LEAD_SCORE_WEIGHTS, number]
    >
  ).map(([signal, weight]) => ({
    signal,
    matched: lead[signal] === true,
    points: lead[signal] === true ? weight : 0,
  }));

  const score = breakdown.reduce((total, item) => total + item.points, 0);
  const qualificationBlockers: QualificationBlocker[] = [];

  if (score < MINIMUM_QUALIFY_SCORE) {
    qualificationBlockers.push("SCORE_BELOW_60");
  }
  if (!lead.business_active) {
    qualificationBlockers.push("BUSINESS_NOT_CONFIRMED_ACTIVE");
  }
  if (lead.do_not_contact) {
    qualificationBlockers.push("DO_NOT_CONTACT");
  }
  if (options.contactSuppressed) {
    qualificationBlockers.push("CONTACT_SUPPRESSED");
  }
  if (!lead.has_public_whatsapp) {
    qualificationBlockers.push("NO_PUBLIC_WHATSAPP");
  }
  if (!lead.whatsapp) {
    qualificationBlockers.push("WHATSAPP_MISSING");
  }
  if (!lead.public_contact_verified) {
    qualificationBlockers.push("PUBLIC_CONTACT_NOT_VERIFIED");
  }

  return {
    score,
    priority: priorityForScore(score),
    qualified: qualificationBlockers.length === 0,
    suppressed: lead.do_not_contact || options.contactSuppressed === true,
    scoreRuleVersion: LEAD_SCORE_RULE_VERSION,
    breakdown,
    qualificationBlockers,
  };
}
