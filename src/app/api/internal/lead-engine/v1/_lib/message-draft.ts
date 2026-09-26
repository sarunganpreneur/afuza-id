import { createHash } from "node:crypto";

export const MESSAGE_DRAFT_SCHEMA_VERSION = "message_draft_v1" as const;
export const FIRST_CONTACT_MESSAGE_TYPE = "FIRST_CONTACT" as const;
export const MESSAGE_CHANNEL = "WHATSAPP" as const;

export type MessageTemplateCode = "WA-EDU-001" | "WA-GEN-001";

export type DraftOffer = {
  name: string;
  description: string;
  price_text?: string | null;
};

export type MessageDraftInput = {
  lead: {
    lead_id: string;
    business_name: string;
    category: string | null;
    city: string | null;
    source: string;
    observation: string | null;
    has_no_website: boolean;
    website_low_quality: boolean;
    google_maps_active: boolean;
    recent_reviews: boolean;
  };
  template_code: MessageTemplateCode;
  observation: string;
  offer: DraftOffer;
  cta: string;
};

export type MessageDraftOutput = {
  template_id: MessageTemplateCode;
  message_type: typeof FIRST_CONTACT_MESSAGE_TYPE;
  personalized_message: string;
  observed_fact_used: string;
  cta: string;
  risk_flags: string[];
  recommended_send: boolean;
};

export type MessageDraftProvider = {
  generate(input: MessageDraftInput): Promise<unknown>;
};

export type DraftValidation =
  | { ok: true; draft: MessageDraftOutput }
  | { ok: false; code: string; issues: string[] };

const EDUCATION_TOKENS = [
  "madrasah",
  "sekolah",
  "pondok",
  "pesantren",
  "yayasan",
  "pendidikan",
  "mi ",
  "mts",
  "ma ",
  "smk",
  "sma",
  "smp",
];

export function selectTemplateCode(
  category: string | null | undefined,
  forced?: string | null,
): MessageTemplateCode {
  if (forced === "WA-EDU-001" || forced === "WA-GEN-001") return forced;
  const value = String(category ?? "").trim().toLowerCase();
  return EDUCATION_TOKENS.some((token) => value.includes(token))
    ? "WA-EDU-001"
    : "WA-GEN-001";
}

export function factualObservation(lead: MessageDraftInput["lead"]): string {
  const explicit = String(lead.observation ?? "").trim();
  if (explicit) return explicit.slice(0, 500);
  if (lead.has_no_website) return "Belum memiliki website yang terdeteksi pada data publik yang digunakan.";
  if (lead.website_low_quality) return "Website yang terdeteksi memiliki ruang untuk peningkatan kualitas halaman penawaran.";
  if (lead.recent_reviews) return "Memiliki ulasan publik yang relatif aktif pada sumber yang digunakan.";
  if (lead.google_maps_active) return "Memiliki kehadiran Google Maps yang terdeteksi aktif pada sumber yang digunakan.";
  return `Bisnis terdeteksi aktif pada sumber ${lead.source}.`;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > max) return null;
  return v;
}

function unresolvedPlaceholder(text: string): boolean {
  return /\[[A-Z0-9_ -]{2,}\]|\{\{[^{}]+\}\}/i.test(text);
}

function rupiahTokens(text: string): string[] {
  return text.match(/Rp\s*\d+(?:\.\d{3})*(?:,\d+)?/gi) ?? [];
}

function normalizeMoney(v: string): string {
  return v.toLowerCase().replace(/\s+/g, "").replace(/[.,](?=\d{3}\b)/g, ".");
}

export function validateDraftOutput(
  raw: unknown,
  expected: {
    template_code: MessageTemplateCode;
    observation: string;
    offer: DraftOffer;
    cta: string;
  },
): DraftValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "INVALID_AI_OUTPUT", issues: ["output_not_object"] };
  }

  const v = raw as Record<string, unknown>;
  const template = normalizeText(v.template_id, 80);
  const type = normalizeText(v.message_type, 80);
  const message = normalizeText(v.personalized_message, 1200);
  const observed = normalizeText(v.observed_fact_used, 500);
  const cta = normalizeText(v.cta, 160);

  const riskFlags = Array.isArray(v.risk_flags)
    ? v.risk_flags
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20)
    : null;

  const recommendedSend = typeof v.recommended_send === "boolean"
    ? v.recommended_send
    : null;

  const issues: string[] = [];
  if (template !== expected.template_code) issues.push("template_id_mismatch");
  if (type !== FIRST_CONTACT_MESSAGE_TYPE) issues.push("message_type_mismatch");
  if (!message) issues.push("personalized_message_invalid");
  if (!observed) issues.push("observed_fact_used_invalid");
  if (!cta || cta !== expected.cta) issues.push("cta_mismatch");
  if (!riskFlags) issues.push("risk_flags_invalid");
  if (recommendedSend === null) issues.push("recommended_send_invalid");

  if (message && unresolvedPlaceholder(message)) issues.push("unresolved_placeholder");

  if (observed && observed !== expected.observation) {
    issues.push("observed_fact_not_grounded");
  }

  if (message) {
    const prices = rupiahTokens(message);
    const configured = String(expected.offer.price_text ?? "").trim();
    if (!configured && prices.length > 0) {
      issues.push("unexpected_price_claim");
    } else if (configured && prices.length > 0) {
      const wanted = normalizeMoney(configured);
      if (prices.some((price) => normalizeMoney(price) !== wanted)) {
        issues.push("price_mismatch");
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, code: "MESSAGE_DRAFT_POLICY_REJECTED", issues };
  }

  return {
    ok: true,
    draft: {
      template_id: expected.template_code,
      message_type: FIRST_CONTACT_MESSAGE_TYPE,
      personalized_message: message!,
      observed_fact_used: observed!,
      cta: cta!,
      risk_flags: riskFlags!,
      recommended_send: recommendedSend!,
    },
  };
}

export function templateInstruction(code: MessageTemplateCode): string {
  if (code === "WA-EDU-001") {
    return [
      "Bahasa Indonesia yang sopan dan ringkas untuk sekolah/madrasah/lembaga pendidikan.",
      "Mulai dengan salam yang wajar.",
      "Sebut nama lembaga secara natural.",
      "Gunakan tepat satu observasi faktual yang disediakan.",
      "Hubungkan observasi dengan offer tanpa menjanjikan hasil.",
      "Akhiri dengan CTA persis seperti yang disediakan.",
      "Jangan mengarang prestasi, jumlah siswa, omzet, kebutuhan, atau kondisi internal lembaga.",
    ].join(" ");
  }

  return [
    "Bahasa Indonesia yang sopan, ringkas, dan relevan untuk first contact bisnis.",
    "Sebut nama bisnis secara natural.",
    "Gunakan tepat satu observasi faktual yang disediakan.",
    "Hubungkan observasi dengan offer tanpa menjanjikan hasil.",
    "Akhiri dengan CTA persis seperti yang disediakan.",
    "Jangan mengarang omzet, kebutuhan, hasil, testimoni, atau kondisi internal bisnis.",
  ].join(" ");
}
