"use client";

import { useActionState, useEffect, useRef } from "react";
import { verifyOtp, type VerifyOtpFormState } from "@/app/actions/otp";

type VerifyOtpFormProps = {
  challengeId: string;
  expiresAt: string;
};

export function VerifyOtpForm({ challengeId, expiresAt }: VerifyOtpFormProps) {
  const [state, formAction, isPending] = useActionState<VerifyOtpFormState, FormData>(verifyOtp, {
    type: "loading",
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const expiryTime = new Date(expiresAt);
  const now = new Date();
  const remainingSeconds = Math.max(0, Math.floor((expiryTime.getTime() - now.getTime()) / 1000));

  // Auto-focus OTP input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="otp" className="block text-sm font-semibold text-[var(--brand-dark)] mb-2">
          Kode Verifikasi
        </label>
        <input
          ref={inputRef}
          type="text"
          id="otp"
          name="otp"
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          required
          disabled={isPending}
          className="w-full rounded-lg border border-[var(--line)] px-4 py-3 text-center text-2xl font-mono tracking-widest focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 disabled:bg-[var(--background)] disabled:text-[var(--muted)]"
        />
        <input type="hidden" name="challenge_id" value={challengeId} />
      </div>

      {state.message && (
        <div className={`rounded-lg p-3 text-sm ${
          state.type === "error"
            ? "bg-red-50 text-red-700"
            : state.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-blue-50 text-blue-700"
        }`}>
          {state.message}
        </div>
      )}

      <div className="text-sm text-[var(--muted)]">
        Kode kadaluarsa dalam {remainingSeconds} detik
      </div>

      <button
        type="submit"
        disabled={isPending || remainingSeconds === 0}
        className="w-full rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:bg-[var(--muted)] disabled:cursor-not-allowed"
      >
        {isPending ? "Memverifikasi..." : "Verifikasi"}
      </button>
    </form>
  );
}
