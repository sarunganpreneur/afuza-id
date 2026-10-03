"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TestPaymentButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmTestPayment() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/storefront/test-payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Konfirmasi simulasi tidak berhasil.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Konfirmasi simulasi tidak berhasil.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button className="dpf-button" type="button" onClick={confirmTestPayment} disabled={pending}>
        {pending ? "Mengonfirmasi..." : "Simulasikan pembayaran TEST"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}