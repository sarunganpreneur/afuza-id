import "server-only";

export type AccountProfile = {
  email_verified_at: string | null;
  phone_verified_at: string | null;
  account_status: string | null;
};

export function isPhoneVerificationRequired() {
  return process.env.PHONE_VERIFICATION_REQUIRED?.trim().toLowerCase() === "true";
}

export function isDashboardEligible(profile: AccountProfile) {
  return Boolean(
    profile.email_verified_at
    && profile.account_status === "VERIFIED"
    && (!isPhoneVerificationRequired() || profile.phone_verified_at),
  );
}

export function getIneligiblePath(profile: AccountProfile) {
  if (!profile.email_verified_at) return "/verify-email";
  if (isPhoneVerificationRequired() && !profile.phone_verified_at) return "/verify-whatsapp";
  return "/verify-whatsapp";
}
