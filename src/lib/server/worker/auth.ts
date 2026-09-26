import "server-only";

import { createHash, timingSafeEqual } from "crypto";

export const AUTH_RESULT = {
  AUTHORIZED: "AUTHORIZED",
  UNAUTHORIZED: "UNAUTHORIZED",
  MISCONFIGURED: "MISCONFIGURED",
} as const;

export type WorkerAuthResult =
  | { status: typeof AUTH_RESULT.AUTHORIZED }
  | { status: typeof AUTH_RESULT.UNAUTHORIZED; reason: "missing-header" | "malformed-header" | "wrong-scheme" | "empty-token" | "invalid-token" }
  | { status: typeof AUTH_RESULT.MISCONFIGURED; reason: "missing-secret" | "empty-secret" };

function normalizeBearerToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!match) return null;

  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export function authenticateWorkerRequest(request: Request): WorkerAuthResult {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return { status: AUTH_RESULT.UNAUTHORIZED, reason: "missing-header" };
  }

  const bearerToken = normalizeBearerToken(authorization);
  if (!bearerToken) {
    const trimmed = authorization.trim();
    if (trimmed.length === 0) {
      return { status: AUTH_RESULT.UNAUTHORIZED, reason: "empty-token" };
    }

    if (!/^Bearer\s+/i.test(trimmed)) {
      return { status: AUTH_RESULT.UNAUTHORIZED, reason: "wrong-scheme" };
    }

    return { status: AUTH_RESULT.UNAUTHORIZED, reason: "malformed-header" };
  }

  const expectedSecret = process.env.WORKER_SHARED_SECRET;
  if (!expectedSecret || expectedSecret.trim().length === 0) {
    return { status: AUTH_RESULT.MISCONFIGURED, reason: "missing-secret" };
  }

  const suppliedHash = createHash("sha256").update(bearerToken).digest();
  const expectedHash = createHash("sha256").update(expectedSecret).digest();

  if (suppliedHash.length !== expectedHash.length) {
    return { status: AUTH_RESULT.UNAUTHORIZED, reason: "invalid-token" };
  }

  const isValid = timingSafeEqual(suppliedHash, expectedHash);
  if (!isValid) {
    return { status: AUTH_RESULT.UNAUTHORIZED, reason: "invalid-token" };
  }

  return { status: AUTH_RESULT.AUTHORIZED };
}
