import "server-only";

import { createHmac, randomInt, randomUUID } from "crypto";

export function getOtpPepper(): string {
  const pepper = process.env.OTP_PEPPER;

  if (!pepper || pepper.trim().length === 0) {
    throw new Error("OTP_PEPPER is not configured");
  }

  return pepper;
}

/**
 * Generate a 6-digit OTP using crypto.randomInt.
 *
 * Returns a string such as "123456", never empty or less than 6 digits.
 * Do not use Math.random().
 */
export function generateOtp(): string {
  const otp = randomInt(100000, 1000000);
  return otp.toString().padStart(6, "0");
}

/**
 * Generate a unique challenge ID.
 */
export function generateChallengeId(): string {
  return randomUUID();
}

/**
 * Hash OTP using HMAC-SHA256 with pepper.
 *
 * Produces 64 lowercase hexadecimal characters.
 *
 * @param challengeId - UUID challenge identifier
 * @param otp - 6-digit OTP string
 * @param pepper - OTP_PEPPER environment variable; if omitted, reads lazily from process.env
 * @returns 64-char hex string suitable for database storage
 * @throws If pepper is not available when the trusted code path requires hashing
 */
export function hashOtp(challengeId: string, otp: string, pepper?: string): string {
  const resolvedPepper = pepper ?? getOtpPepper();
  const message = `${challengeId}:${otp}`;
  const hash = createHmac("sha256", resolvedPepper)
    .update(message)
    .digest("hex");

  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Invalid hash format: expected 64 lowercase hex characters");
  }

  return hash;
}

/**
 * Validate that a string is a valid 6-digit OTP.
 */
export function isValidOtp(value: unknown): boolean {
  return typeof value === "string" && /^[0-9]{6}$/.test(value);
}

/**
 * Validate that a string is a valid challenge ID (UUID).
 */
export function isValidChallengeId(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
