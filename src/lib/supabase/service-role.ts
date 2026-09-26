import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server-side operations only.
 * 
 * SECURITY CONSTRAINTS:
 * - This module MUST only be imported from server-side code
 * - NEVER import this from Client Components
 * - NEVER expose SUPABASE_SERVICE_ROLE_KEY through NEXT_PUBLIC_*
 * - Service role is used only by approved server-side RPC operations, including
 *   phone verification and generation content commits
 * - Regular user operations must use the authenticated SSR client
 * 
 * Do NOT use this client to:
 * - bypass RLS policies
 * - verify OTP (use authenticated client)
 * - update user profiles directly (trigger handles this)
 * - activate affiliates directly (trigger handles this)
 * - read private user data outside OTP scope
 */

let serviceRoleClient: SupabaseClient | null = null;

export async function getServiceRoleClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // When delivery is disabled, service role key is optional
  if (!url || !serviceRoleKey) {
    return null;
  }

  if (!serviceRoleClient) {
    serviceRoleClient = createSupabaseClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serviceRoleClient;
}
