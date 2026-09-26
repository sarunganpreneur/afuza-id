import "server-only";

/**
 * Base interface for OTP delivery providers.
 *
 * Implementations must handle all error cases gracefully.
 * No provider should expose raw OTPs or hashes in logs.
 */
export interface OtpDeliveryProvider {
  /**
   * Check if the provider is ready to send OTPs.
   * Returns false when delivery is intentionally paused or not configured.
   */
  isReady(): boolean;

  /**
   * Attempt to send an OTP to a phone number.
   *
   * IMPORTANT: If this returns an error, the challenge may exist in the database
   * but delivery failed. Phase 5E.2B must implement invalidation logic.
   *
   * @param phone - E.164 format phone number (e.g., "628123456789")
   * @param otp - Raw 6-digit OTP (never stored; only for delivery)
   * @param challengeId - UUID for tracking
   * @returns success: true, or error details
   */
  sendOtp(phone: string, otp: string, challengeId: string): Promise<{
    success: boolean;
    error?: string;
  }>;
}

/**
 * Disabled OTP delivery provider.
 *
 * Used when OTP_DELIVERY_PROVIDER is not configured or set to "disabled".
 * Intentionally returns false for isReady() to prevent challenge creation.
 */
export class DisabledOtpDeliveryProvider implements OtpDeliveryProvider {
  isReady(): boolean {
    return false;
  }

  async sendOtp(phone: string, otp: string, challengeId: string): Promise<{ success: false; error: string }> {
    void phone;
    void otp;
    void challengeId;

    return {
      success: false,
      error: "OTP delivery is currently disabled",
    };
  }
}

/**
 * Resolve the configured OTP delivery provider.
 *
 * Configuration source: OTP_DELIVERY_PROVIDER environment variable.
 * Defaults to disabled if not set or unknown.
 *
 * Phase 5E.2B will add:
 * - "waha" for WAHA provider
 * - "n8n" for n8n webhook provider
 */
export function getOtpDeliveryProvider(): OtpDeliveryProvider {
  const provider = process.env.OTP_DELIVERY_PROVIDER ?? "disabled";

  switch (provider.trim().toLowerCase()) {
    // Future providers will be added here.
    // case "waha":
    //   return new WahaOtpDeliveryProvider();
    // case "n8n":
    //   return new N8nOtpDeliveryProvider();
    case "disabled":
    case "":
    default:
      return new DisabledOtpDeliveryProvider();
  }
}

export function isOtpDeliveryReady(): boolean {
  return getOtpDeliveryProvider().isReady();
}
