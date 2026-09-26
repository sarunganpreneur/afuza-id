import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getIneligiblePath, isDashboardEligible, type AccountProfile } from "@/lib/auth/eligibility";

export async function getPostAuthPath(supabase: SupabaseClient, user: User) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("email_verified_at, phone_verified_at, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) return "/verify-email";

  const accountProfile = profile as AccountProfile;
  if (!isDashboardEligible(accountProfile)) return getIneligiblePath(accountProfile);

  return "/dashboard";
}