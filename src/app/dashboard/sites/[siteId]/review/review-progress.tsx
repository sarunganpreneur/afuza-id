"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { generationStageState, generationStatusLabel, shouldPollGeneration } from "@/lib/generation/progress";

export default function ReviewProgress({ status, reviewReady }: { status: string; reviewReady: boolean }) {
  const router = useRouter();
  const poll = shouldPollGeneration(status, reviewReady);

  useEffect(() => {
    if (!poll) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [poll, router]);

  const states = generationStageState(status, reviewReady);
  return (
    <section className="review-state" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <strong>{generationStatusLabel(status, reviewReady)}</strong>
        {poll && <span className="text-xs text-[var(--muted)]">Memperbarui otomatis</span>}
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {states.map((state, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${state === "complete" ? "bg-[var(--brand)] text-white" : state === "active" ? "border-2 border-[var(--brand)] text-[var(--brand)]" : "border border-[var(--line)] text-[var(--muted)]"}`}>
              {state === "complete" ? "✓" : state === "active" ? "●" : "○"}
            </span>
            <span>{["Analisis", "Konten", "Gambar", "Siap Direview"][index]}</span>
          </li>
        ))}
      </ol>
      {status === "ERROR" && <p className="mt-4 text-sm text-red-700">Pembuatan website belum berhasil. Periksa kembali brief dan coba lagi.</p>}
    </section>
  );
}