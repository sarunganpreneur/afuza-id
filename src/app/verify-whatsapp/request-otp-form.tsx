"use client";

import { useActionState } from "react";
import { requestOtp, type RequestOtpFormState } from "@/app/actions/otp";
import { VerifyOtpForm } from "./verify-otp-form";

type RequestOtpFormProps = {
  maskedPhone: string;
};

export function RequestOtpForm({ maskedPhone }: RequestOtpFormProps) {
  const [state, formAction, isPending] = useActionState<RequestOtpFormState, FormData>(
    async () => requestOtp(),
    { type: "loading" }
  );

  // If successfully requested OTP, show verification form
  if (state.type === "success" && state.challengeId && state.expiresAt) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">
          Kode verifikasi telah dikirim ke WhatsApp {maskedPhone}
        </p>
        <VerifyOtpForm challengeId={state.challengeId} expiresAt={state.expiresAt} />
        <button
          onClick={() => window.location.reload()}
          className="w-full text-center text-sm text-[var(--brand)] hover:text-[var(--brand-dark)]"
        >
          Kirim ulang kode
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Kami akan mengirimkan kode verifikasi ke WhatsApp Anda.
      </p>
      <p className="text-sm font-semibold text-[var(--brand-dark)]">
        Nomor WhatsApp: {maskedPhone}
      </p>

      {state.message && (
        <div className={`rounded-lg p-3 text-sm ${
          state.type === "error"
            ? "bg-red-50 text-red-700"
            : "bg-blue-50 text-blue-700"
        }`}>
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:bg-[var(--muted)] disabled:cursor-not-allowed"
      >
        {isPending ? "Mengirim..." : "Coba Kirim Kode"}
      </button>
    </form>
  );
}
