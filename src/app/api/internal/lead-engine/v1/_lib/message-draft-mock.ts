import {
  FIRST_CONTACT_MESSAGE_TYPE,
  type MessageDraftInput,
  type MessageDraftProvider,
} from "./message-draft";

export const WF04_STAGING_APP_ROOT = "/home/afuzaid/apps/afuza-id-staging" as const;
export const WF04_STAGING_MOCK_RISK_FLAG = "STAGING_MOCK_PROVIDER" as const;

export type MessageDraftProviderMode = "openai" | "mock";

export type MessageDraftProviderResolution =
  | { ok: true; mode: MessageDraftProviderMode }
  | { ok: false; code: "MESSAGE_DRAFT_PROVIDER_MISCONFIGURED" | "WF04_STAGING_MOCK_SCOPE_DENIED" };

export function resolveMessageDraftProviderMode(input: {
  mode?: string | null;
  mockEnabled?: string | null;
  cwd?: string | null;
}): MessageDraftProviderResolution {
  const mode = String(input.mode ?? "openai").trim().toLowerCase();

  if (mode === "openai") {
    return { ok: true, mode: "openai" };
  }

  if (mode !== "mock") {
    return { ok: false, code: "MESSAGE_DRAFT_PROVIDER_MISCONFIGURED" };
  }

  const mockEnabled = String(input.mockEnabled ?? "").trim().toLowerCase() === "true";
  const cwd = String(input.cwd ?? "");

  if (!mockEnabled || cwd !== WF04_STAGING_APP_ROOT) {
    return { ok: false, code: "WF04_STAGING_MOCK_SCOPE_DENIED" };
  }

  return { ok: true, mode: "mock" };
}

function compact(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export function createStagingMockMessageDraftProvider(
  cwd = process.cwd(),
): MessageDraftProvider {
  if (cwd !== WF04_STAGING_APP_ROOT) {
    throw new Error("WF04_STAGING_MOCK_SCOPE_DENIED");
  }

  return {
    async generate(input: MessageDraftInput): Promise<unknown> {
      const businessName = compact(input.lead.business_name, 80);
      const offerName = compact(input.offer.name, 80);
      const price = String(input.offer.price_text ?? "").trim();

      const greeting = input.template_code === "WA-EDU-001"
        ? `Assalamu'alaikum ${businessName}.`
        : `Halo ${businessName}.`;

      const offerSentence = price
        ? `Kami menawarkan ${offerName} dengan harga ${price}.`
        : `Kami menawarkan ${offerName}.`;

      const personalizedMessage = [
        greeting,
        input.observation,
        offerSentence,
        input.cta,
      ].join(" ").replace(/\s+/g, " ").trim();

      return {
        template_id: input.template_code,
        message_type: FIRST_CONTACT_MESSAGE_TYPE,
        personalized_message: personalizedMessage,
        observed_fact_used: input.observation,
        cta: input.cta,
        risk_flags: [WF04_STAGING_MOCK_RISK_FLAG],
        recommended_send: false,
      };
    },
  };
}
