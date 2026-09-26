"use client";

import { useMemo, useState } from "react";

type Goal =
  | "CUSTOMER"
  | "PRODUCT"
  | "WEBSITE"
  | "SALES"
  | "VALIDATION"
  | "SYSTEM";

const goalData: Record<
  Goal,
  {
    label: string;
    opportunity: string;
    customerPotential: string;
    readiness: string;
    recommendation: string;
    action: string;
  }
> = {
  CUSTOMER: {
    label: "Mendapatkan customer baru",
    opportunity: "HIGH",
    customerPotential: "8.7 / 10",
    readiness: "7.1 / 10",
    recommendation:
      "Bangun customer acquisition campaign berdasarkan segmen buyer dengan potensi tertinggi.",
    action: "Prioritaskan buyer → qualify → outreach",
  },
  PRODUCT: {
    label: "Membuat produk atau layanan",
    opportunity: "MEDIUM–HIGH",
    customerPotential: "7.8 / 10",
    readiness: "6.4 / 10",
    recommendation:
      "Validasi masalah customer terlebih dahulu sebelum memperluas fitur atau kapasitas produk.",
    action: "Research → validate → offer",
  },
  WEBSITE: {
    label: "Membuat website",
    opportunity: "HIGH",
    customerPotential: "8.1 / 10",
    readiness: "8.3 / 10",
    recommendation:
      "Bangun landing page berorientasi konversi yang terhubung langsung ke proses acquisition.",
    action: "Offer → build → acquire",
  },
  SALES: {
    label: "Meningkatkan penjualan",
    opportunity: "HIGH",
    customerPotential: "8.5 / 10",
    readiness: "7.6 / 10",
    recommendation:
      "Identifikasi bottleneck antara qualified lead, conversation, dan opportunity.",
    action: "Analyze → prioritize → follow up",
  },
  VALIDATION: {
    label: "Menguji ide bisnis baru",
    opportunity: "MEDIUM",
    customerPotential: "7.2 / 10",
    readiness: "5.8 / 10",
    recommendation:
      "Uji demand dengan offer sederhana sebelum membangun sistem atau produk secara penuh.",
    action: "Research → test offer → measure",
  },
  SYSTEM: {
    label: "Membangun sistem bisnis",
    opportunity: "HIGH",
    customerPotential: "8.2 / 10",
    readiness: "6.9 / 10",
    recommendation:
      "Petakan proses inti, data, approval, dan automation sebelum meningkatkan level autonomi AI.",
    action: "Map → connect → automate",
  },
};

export default function BusinessScanner() {
  const [business, setBusiness] = useState("Supplier packaging makanan");
  const [goal, setGoal] = useState<Goal>("CUSTOMER");
  const [analyzed, setAnalyzed] = useState(false);

  const result = useMemo(() => goalData[goal], [goal]);

  return (
    <section className="business-scanner" id="business-scanner">
      <div className="home-shell">
        <div className="scanner-heading">
          <p className="os-eyebrow">START WITH YOUR BUSINESS</p>
          <h2>Mulai dari bisnis Anda.</h2>
          <p>
            Ceritakan apa yang sedang Anda kerjakan. Afuza membantu membaca
            situasi bisnis, menemukan peluang, dan menentukan langkah berikutnya.
          </p>
        </div>

        <div className="scanner-shell">
          <div className="scanner-form-panel">
            <div className="scanner-form-heading">
              <span>BUSINESS SCANNER</span>
              <small>DEMO MODE</small>
            </div>

            <div className="scanner-field">
              <label htmlFor="scanner-business">Bisnis Anda bergerak di bidang apa?</label>
              <input
                id="scanner-business"
                value={business}
                onChange={(event) => {
                  setBusiness(event.target.value);
                  setAnalyzed(false);
                }}
                placeholder="Contoh: supplier packaging makanan"
              />
            </div>

            <div className="scanner-field">
              <label htmlFor="scanner-goal">Apa target utama Anda?</label>
              <select
                id="scanner-goal"
                value={goal}
                onChange={(event) => {
                  setGoal(event.target.value as Goal);
                  setAnalyzed(false);
                }}
              >
                {Object.entries(goalData).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="scanner-button"
              onClick={() => setAnalyzed(true)}
            >
              Analisis Bisnis Saya
              <span aria-hidden="true">→</span>
            </button>

            <p className="scanner-privacy">
              Demo ini berjalan lokal di halaman dan tidak mengirim input ke AI
              atau database.
            </p>
          </div>

          <div
            className={`scanner-result ${analyzed ? "scanner-result-active" : ""}`}
            role="region"
            aria-labelledby="scanner-result-title"
          >
            <div className="scanner-result-top">
              <div>
                <small>BUSINESS ANALYSIS</small>
                <h3 id="scanner-result-title">{business || "Bisnis Anda"}</h3>
              </div>
              <span>DEMO ANALYSIS</span>
            </div>

            <div className="scanner-result-metrics">
              <article>
                <small>Market Opportunity</small>
                <strong>{result.opportunity}</strong>
              </article>
              <article>
                <small>Customer Potential</small>
                <strong>{result.customerPotential}</strong>
              </article>
              <article>
                <small>Digital Readiness</small>
                <strong>{result.readiness}</strong>
              </article>
            </div>

            <div className="scanner-recommendation">
              <small>RECOMMENDED ACTION</small>
              <strong>{result.recommendation}</strong>
              <span>{result.action}</span>
            </div>

            {!analyzed && (
              <div className="scanner-overlay">
                <span aria-hidden="true">✦</span>
                <strong>Siap dianalisis</strong>
                <p>
                  Pilih target bisnis lalu jalankan demo analysis untuk melihat
                  contoh next best action.
                </p>
              </div>
            )}
          </div>
          <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {analyzed
              ? `Analisis demo diperbarui untuk ${business || "Bisnis Anda"}: ${result.recommendation}`
              : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
