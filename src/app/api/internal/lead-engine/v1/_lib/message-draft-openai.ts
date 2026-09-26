import type {
  MessageDraftInput,
  MessageDraftOutput,
  MessageDraftProvider,
} from "./message-draft";
import {
  FIRST_CONTACT_MESSAGE_TYPE,
  templateInstruction,
} from "./message-draft";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
export const OPENAI_MESSAGE_MODEL =
  process.env.OPENAI_MESSAGE_MODEL ??
  process.env.OPENAI_MODEL ??
  "gpt-4o-mini";

function sanitizedProviderMessage(value: unknown): string {
  return String(value ?? "Provider request failed")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 500);
}

export class MessageDraftProviderError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(sanitizedProviderMessage(message));
    this.name = "MessageDraftProviderError";
  }
}

const MESSAGE_DRAFT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "template_id",
    "message_type",
    "personalized_message",
    "observed_fact_used",
    "cta",
    "risk_flags",
    "recommended_send",
  ],
  properties: {
    template_id: {
      type: "string",
      enum: ["WA-EDU-001", "WA-GEN-001"],
    },
    message_type: {
      type: "string",
      enum: [FIRST_CONTACT_MESSAGE_TYPE],
    },
    personalized_message: {
      type: "string",
      minLength: 1,
      maxLength: 1200,
    },
    observed_fact_used: {
      type: "string",
      minLength: 1,
      maxLength: 500,
    },
    cta: {
      type: "string",
      minLength: 1,
      maxLength: 160,
    },
    risk_flags: {
      type: "array",
      maxItems: 20,
      items: { type: "string", maxLength: 160 },
    },
    recommended_send: {
      type: "boolean",
    },
  },
} as const;

export function createOpenAiMessageDraftProvider(options?: {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
}): MessageDraftProvider {
  const fetcher = options?.fetch ?? fetch;

  return {
    async generate(input: MessageDraftInput): Promise<unknown> {
      const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new MessageDraftProviderError(
          503,
          "AI_PROVIDER_UNAVAILABLE",
          "OPENAI_API_KEY is not configured",
        );
      }

      const system = [
        "Anda membuat draft first-contact WhatsApp untuk Afuza Lead Engine.",
        "Gunakan hanya fakta dan offer yang diberikan.",
        "Jangan menyimpulkan kebutuhan yang tidak dinyatakan.",
        "Jangan membuat klaim hasil, testimoni, diskon, harga, fitur, atau fakta bisnis baru.",
        "Jika price_text diberikan dan harga disebut, gunakan persis price_text tersebut.",
        "observed_fact_used harus sama persis dengan observation input.",
        "cta harus sama persis dengan CTA input.",
        "risk_flags harus kosong hanya jika draft benar-benar mengikuti semua aturan.",
        templateInstruction(input.template_code),
      ].join(" ");

      const user = JSON.stringify({
        business_name: input.lead.business_name,
        category: input.lead.category,
        city: input.lead.city,
        source: input.lead.source,
        observation: input.observation,
        template_id: input.template_code,
        message_type: FIRST_CONTACT_MESSAGE_TYPE,
        offer: input.offer,
        cta: input.cta,
      });

      const response = await fetcher(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options?.model ?? OPENAI_MESSAGE_MODEL,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "message_draft_v1",
              strict: true,
              schema: MESSAGE_DRAFT_RESPONSE_SCHEMA,
            },
          },
        }),
      });

      const payload = await response.json().catch(() => ({})) as {
        error?: { message?: string; code?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (!response.ok) {
        throw new MessageDraftProviderError(
          response.status,
          String(payload.error?.code ?? "AI_PROVIDER_REQUEST_FAILED"),
          payload.error?.message ?? `OpenAI request failed with HTTP ${response.status}`,
        );
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new MessageDraftProviderError(
          502,
          "AI_PROVIDER_EMPTY_RESPONSE",
          "OpenAI returned empty content",
        );
      }

      try {
        return JSON.parse(content) as MessageDraftOutput;
      } catch {
        throw new MessageDraftProviderError(
          502,
          "AI_PROVIDER_INVALID_JSON",
          "OpenAI returned invalid JSON",
        );
      }
    },
  };
}
