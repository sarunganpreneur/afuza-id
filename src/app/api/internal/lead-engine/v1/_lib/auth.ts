import "server-only";

import { createHash, timingSafeEqual } from "crypto";

export const LEAD_ENGINE_AUTH_RESULT = {
  AUTHORIZED: "AUTHORIZED",
  UNAUTHORIZED: "UNAUTHORIZED",
  MISCONFIGURED: "MISCONFIGURED",
} as const;

export type LeadEngineAuthResult =
  (typeof LEAD_ENGINE_AUTH_RESULT)[keyof typeof LEAD_ENGINE_AUTH_RESULT];

function normalizeBearerToken(value: string | null): string | null {
  if (!value) return null;

  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  if (!match) return null;

  const token = match[1]?.trim() ?? "";
  return token.length > 0 ? token : null;
}

export function authenticateLeadEngineRequest(request: Request): LeadEngineAuthResult {
  const expectedToken = process.env.LEAD_ENGINE_INTERNAL_TOKEN?.trim() ?? "";

  if (!expectedToken) {
    return LEAD_ENGINE_AUTH_RESULT.MISCONFIGURED;
  }

  const suppliedToken = normalizeBearerToken(request.headers.get("authorization"));
  if (!suppliedToken) {
    return LEAD_ENGINE_AUTH_RESULT.UNAUTHORIZED;
  }

  const suppliedHash = createHash("sha256").update(suppliedToken).digest();
  const expectedHash = createHash("sha256").update(expectedToken).digest();

  return timingSafeEqual(suppliedHash, expectedHash)
    ? LEAD_ENGINE_AUTH_RESULT.AUTHORIZED
    : LEAD_ENGINE_AUTH_RESULT.UNAUTHORIZED;
}
