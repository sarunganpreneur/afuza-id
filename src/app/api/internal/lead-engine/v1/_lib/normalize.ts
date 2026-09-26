import { createHash } from "crypto";

import type { LeadUpsertInput } from "./schemas";

function nullIfBlank(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeWhatsapp(value: string | null | undefined): string | null | undefined {
  const normalizedInput = nullIfBlank(value);
  if (normalizedInput === undefined || normalizedInput === null) return normalizedInput;

  let digits = normalizedInput.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0")) {
    digits = `62${digits.slice(1)}`;
  } else if (digits.startsWith("8")) {
    digits = `62${digits}`;
  }

  if (!/^\d{8,16}$/.test(digits)) {
    throw new Error("INVALID_WHATSAPP");
  }

  return digits;
}

export function normalizeLeadInput(input: LeadUpsertInput): LeadUpsertInput {
  return {
    ...input,
    lead_id: input.lead_id.trim(),
    business_name: input.business_name.trim(),
    source: input.source.trim(),
    category: nullIfBlank(input.category),
    city: nullIfBlank(input.city),
    phone: nullIfBlank(input.phone),
    whatsapp: normalizeWhatsapp(input.whatsapp),
    website: nullIfBlank(input.website),
    instagram: nullIfBlank(input.instagram),
    google_maps_url: nullIfBlank(input.google_maps_url),
    raw_source_id: nullIfBlank(input.raw_source_id),
    notes: nullIfBlank(input.notes),
    observation: nullIfBlank(input.observation),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

export function requestHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}
