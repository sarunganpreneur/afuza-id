/**
 * Mask Indonesian WhatsApp phone number.
 * 
 * Example:
 * 628123456789 → 62812****789
 * 
 * Preserves country code and last 3 digits for user recognition.
 * Does not modify the original phone number; only used for display.
 */
export function maskPhoneNumber(phone: string): string {
  const normalized = phone.replace(/[\s().-]/g, "");

  // For Indonesian numbers, show first 5 digits and last 3 digits
  if (normalized.length >= 8) {
    const start = normalized.substring(0, 5);
    const end = normalized.substring(normalized.length - 3);
    return `${start}****${end}`;
  }

  // Fallback for very short numbers (shouldn't happen with valid E.164)
  return normalized;
}
