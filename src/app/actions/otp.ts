"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { getOtpDeliveryProvider } from "@/lib/otp/delivery";
import { generateOtp, generateChallengeId, hashOtp, isValidOtp, isValidChallengeId, getOtpPepper } from "@/lib/otp/crypto";
import { getPostAuthPath } from "@/lib/auth/routing";

/**
 * Server action to request a WhatsApp OTP.
 * 
 * Flow:
 * 1. Authenticate user via SSR client
 * 2. Validate lifecycle (email verified, phone not yet verified)
 * 3. Check delivery provider readiness
 * 4. If ready: generate OTP/challenge, create in database via service-role RPC
 * 5. If not ready: return safe DELIVERY_UNAVAILABLE message
 * 6. Never expose OTP or hash to client
 * 7. Never log raw OTP
 */
export type RequestOtpFormState = {
  type?: "loading" | "success" | "error";
  resultType?: "DELIVERY_UNAVAILABLE" | "CREATED" | "INVALID_INPUT" | "ERROR";
  message?: string;
  challengeId?: string;
  expiresAt?: string;
};

export async function requestOtp(): Promise<RequestOtpFormState> {
  try {
    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return redirect("/login");
    }

    // Step 2: Load user profile through normal RLS
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, whatsapp, email_verified_at, phone_verified_at, account_status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return {
        type: "error",
        message: "Profil pengguna tidak ditemukan.",
      };
    }

    // Step 3: Validate lifecycle
    if (!profile.email_verified_at) {
      redirect("/verify-email");
    }

    if (profile.phone_verified_at) {
      redirect(await getPostAuthPath(supabase, user));
    }

    if (!profile.whatsapp || !/^62[0-9]{8,15}$/.test(profile.whatsapp)) {
      return {
        type: "error",
        message: "Nomor WhatsApp Anda tidak tersedia atau tidak valid.",
      };
    }

    // Step 4: Check delivery provider readiness BEFORE generating OTP
    const deliveryProvider = getOtpDeliveryProvider();

    if (!deliveryProvider.isReady()) {
      return {
        type: "error",
        resultType: "DELIVERY_UNAVAILABLE",
        message: "Pengiriman kode WhatsApp sedang belum tersedia. Silakan coba kembali nanti.",
      };
    }

    // Future-ready path: when an actual delivery provider is enabled, challenge creation and hashing
    // remain server-side only and the provider is resolved before generating a challenge.
    const pepper = getOtpPepper();
    const otp = generateOtp();
    const challengeId = generateChallengeId();
    const codeHash = hashOtp(challengeId, otp, pepper);

    // Step 6: Create challenge via service-role RPC
    const serviceRoleClient = await getServiceRoleClient();

    if (!serviceRoleClient) {
      return {
        type: "error",
        message: "Layanan tidak dikonfigurasi dengan benar.",
      };
    }

    const { data: rpcResult, error: rpcError } = await serviceRoleClient.rpc(
      "create_phone_verification_challenge_server",
      {
        p_user_id: profile.id,
        p_challenge_id: challengeId,
        p_code_hash: codeHash,
      },
    );

    if (rpcError) {
      console.error("[OTP Request] RPC error:", rpcError);
      return {
        type: "error",
        message: "Gagal membuat kode verifikasi. Silakan coba lagi.",
      };
    }

    if (!rpcResult || !Array.isArray(rpcResult) || rpcResult.length === 0) {
      return {
        type: "error",
        message: "Respons server tidak valid.",
      };
    }

    const result = rpcResult[0];

    // Handle RPC result
    if (result.result === "CREATED") {
      // TODO (Phase 5E.2B): Before enabling real delivery, provide safe compensation/invalidation if
      // challenge creation succeeds but external delivery fails or is interrupted.
      const deliveryResult = await deliveryProvider.sendOtp(
        profile.whatsapp,
        otp,
        challengeId,
      );

      if (!deliveryResult.success) {
        // TODO (Phase 5E.2B): Implement challenge invalidation if delivery fails
        // Currently: challenge exists but delivery failed; user cannot verify
        console.error("[OTP Request] Delivery failed:", deliveryResult.error);
        return {
          type: "error",
          message: "Pengiriman kode gagal. Silakan minta kode baru.",
        };
      }

      // Success: return challenge ID and expiry (never OTP or hash)
      const expiresAt = new Date(result.expires_at);
      return {
        type: "success",
        message: "Kode verifikasi telah dikirim ke WhatsApp Anda.",
        challengeId: result.challenge_id,
        expiresAt: expiresAt.toISOString(),
      };
    }

    // Handle various RPC error conditions
    if (result.result === "COOLDOWN") {
      return {
        type: "error",
        message: `Tunggu ${result.retry_after_seconds} detik sebelum meminta kode baru.`,
      };
    }

    if (result.result === "RATE_LIMITED") {
      return {
        type: "error",
        message: `Terlalu banyak permintaan. Silakan coba lagi dalam ${result.retry_after_seconds} detik.`,
      };
    }

    if (result.result === "ALREADY_VERIFIED") {
      return redirect("/dashboard");
    }

    if (result.result === "EMAIL_NOT_VERIFIED") {
      return {
        type: "error",
        message: "Email Anda belum diverifikasi.",
      };
    }

    if (result.result === "PHONE_NOT_AVAILABLE") {
      return {
        type: "error",
        message: "Nomor WhatsApp Anda tidak tersedia.",
      };
    }

    return {
      type: "error",
      message: `Gagal membuat kode verifikasi: ${result.result}`,
    };
  } catch (error) {
    console.error("[OTP Request] Unexpected error:", error);
    return {
      type: "error",
      message: "Terjadi kesalahan. Silakan coba lagi.",
    };
  }
}

/**
 * Server action to verify a WhatsApp OTP.
 * 
 * Flow:
 * 1. Validate inputs (challenge ID and OTP format)
 * 2. Authenticate user via SSR client
 * 3. Hash OTP using same method as request
 * 4. Call verify RPC through authenticated client (never service-role)
 * 5. On success: redirect to /dashboard (profile already updated by RPC + trigger)
 * 6. On failure: return safe error message
 */
export type VerifyOtpFormState = {
  type?: "loading" | "success" | "error";
  message?: string;
};

export async function verifyOtp(
  _previousState: VerifyOtpFormState,
  formData: FormData,
): Promise<VerifyOtpFormState> {
  try {
    const challengeId = (formData.get("challenge_id") || "").toString().trim();
    const otp = (formData.get("otp") || "").toString().trim();

    // Validate inputs
    if (!isValidChallengeId(challengeId)) {
      return {
        type: "error",
        message: "Kode verifikasi tidak valid. Silakan minta kode baru.",
      };
    }

    if (!isValidOtp(otp)) {
      return {
        type: "error",
        message: "Kode harus terdiri dari 6 angka.",
      };
    }

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return redirect("/login");
    }

    // Hash OTP
    const pepper = getOtpPepper();
    const codeHash = hashOtp(challengeId, otp, pepper);

    // Verify through authenticated client (RLS enforced)
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "verify_phone_verification_challenge",
      {
        p_challenge_id: challengeId,
        p_code_hash: codeHash,
      },
    );

    if (rpcError) {
      console.error("[OTP Verify] RPC error:", rpcError);
      return {
        type: "error",
        message: "Gagal memverifikasi kode. Silakan coba lagi.",
      };
    }

    if (!rpcResult || !Array.isArray(rpcResult) || rpcResult.length === 0) {
      return {
        type: "error",
        message: "Respons server tidak valid.",
      };
    }

    const result = rpcResult[0];

    // Handle result
    if (result.result === "VERIFIED") {
      // Profile already updated by RPC and trigger
      // Redirect to dashboard
      return redirect("/dashboard");
    }

    if (result.result === "INVALID_CODE") {
      return {
        type: "error",
        message: "Kode verifikasi tidak sesuai.",
      };
    }

    if (result.result === "FAILED") {
      return {
        type: "error",
        message: "Terlalu banyak percobaan. Silakan minta kode baru.",
      };
    }

    if (result.result === "EXPIRED") {
      return {
        type: "error",
        message: "Kode verifikasi sudah kedaluwarsa. Silakan minta kode baru.",
      };
    }

    if (result.result === "ALREADY_VERIFIED") {
      return redirect("/dashboard");
    }

    if (result.result === "INVALID_CHALLENGE") {
      return {
        type: "error",
        message: "Kode verifikasi tidak valid. Silakan minta kode baru.",
      };
    }

    return {
      type: "error",
      message: `Gagal memverifikasi: ${result.result}`,
    };
  } catch (error) {
    console.error("[OTP Verify] Unexpected error:", error);
    return {
      type: "error",
      message: "Terjadi kesalahan. Silakan coba lagi.",
    };
  }
}
