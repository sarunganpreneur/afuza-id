"use client";

import { useState, type KeyboardEvent } from "react";

type Mode = "MANUAL" | "COPILOT" | "AUTOPILOT";

const modes: Record<
  Mode,
  {
    label: string;
    eyebrow: string;
    title: string;
    description: string;
    bullets: string[];
  }
> = {
  MANUAL: {
    label: "Manual",
    eyebrow: "RECOMMEND ONLY",
    title: "AI memberi insight. Anda yang menjalankan.",
    description:
      "Cocok ketika setiap keputusan dan tindakan masih ingin dikendalikan sepenuhnya oleh manusia.",
    bullets: [
      "AI membaca konteks",
      "AI memberi rekomendasi",
      "Tidak ada tindakan otomatis",
      "Eksekusi dilakukan manusia",
    ],
  },
  COPILOT: {
    label: "Copilot",
    eyebrow: "PREPARE + APPROVE",
    title: "AI menyiapkan. Anda menyetujui.",
    description:
      "AI dapat menyiapkan tindakan, draft, prioritas, dan next best action, tetapi eksekusi tetap menunggu approval.",
    bullets: [
      "AI menyiapkan tindakan",
      "Human approval diperlukan",
      "Draft dan rekomendasi otomatis",
      "Risiko tetap terkontrol",
    ],
  },
  AUTOPILOT: {
    label: "Autopilot",
    eyebrow: "EXECUTE WITHIN POLICY",
    title: "AI dapat bertindak dalam batas yang Anda tetapkan.",
    description:
      "Digunakan ketika workflow sudah cukup matang untuk dijalankan otomatis berdasarkan policy, limit, channel, dan guardrail.",
    bullets: [
      "Budget limit",
      "Allowed channels",
      "Approval rules",
      "Risk threshold",
    ],
  },
};

export default function AutonomyControl() {
  const [mode, setMode] = useState<Mode>("COPILOT");
  const current = modes[mode];
  const modeOrder = Object.keys(modes) as Mode[];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const currentTab = (event.target as HTMLElement).closest<HTMLButtonElement>("[role='tab']");
    if (!currentTab) return;

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']"),
    );
    const currentIndex = tabs.indexOf(currentTab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];

    event.preventDefault();
    nextTab.focus();
    setMode(nextTab.dataset.mode as Mode);
  };

  return (
    <section className="autonomy-section">
      <div className="home-shell">
        <div className="autonomy-heading">
          <p className="os-eyebrow">YOU SET THE CONTROL</p>
          <h2>
            AI bekerja.
            <br />
            <em>Anda tetap memegang kendali.</em>
          </h2>
          <p>
            Tidak semua bisnis membutuhkan tingkat otomatisasi yang sama. Afuza
            memungkinkan Anda menentukan seberapa jauh AI boleh bertindak.
          </p>
        </div>

        <div className="autonomy-shell">
          <div
            className="autonomy-tabs"
            role="tablist"
            aria-label="Mode autonomi AI"
            onKeyDown={handleTabKeyDown}
          >
            {modeOrder.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                id={`autonomy-tab-${item.toLowerCase()}`}
                data-mode={item}
                aria-controls="autonomy-panel"
                aria-selected={mode === item}
                tabIndex={mode === item ? 0 : -1}
                className={mode === item ? "active" : ""}
                onClick={() => setMode(item)}
              >
                <span>{modes[item].label}</span>
                <small>{modes[item].eyebrow}</small>
              </button>
            ))}
          </div>

          <div
            className="autonomy-content"
            id="autonomy-panel"
            role="tabpanel"
            aria-labelledby={`autonomy-tab-${mode.toLowerCase()}`}
            tabIndex={0}
          >
            <div className="autonomy-copy">
              <small>{current.eyebrow}</small>
              <h3>{current.title}</h3>
              <p>{current.description}</p>

              <ul>
                {current.bullets.map((bullet) => (
                  <li key={bullet}>
                    <span aria-hidden="true">✓</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>

            <div className="autonomy-console">
              <div className="autonomy-console-top">
                <span>AFUZA AUTONOMY CONTROL</span>
                <b>{mode}</b>
              </div>

              <div className="autonomy-policy-row">
                <span>AI Analysis</span>
                <strong>Enabled</strong>
              </div>

              <div className="autonomy-policy-row">
                <span>Prepare Action</span>
                <strong>
                  {mode === "MANUAL" ? "Disabled" : "Enabled"}
                </strong>
              </div>

              <div className="autonomy-policy-row">
                <span>Human Approval</span>
                <strong>
                  {mode === "AUTOPILOT" ? "Policy Based" : "Required"}
                </strong>
              </div>

              <div className="autonomy-policy-row">
                <span>Automatic Execution</span>
                <strong>
                  {mode === "AUTOPILOT" ? "Allowed" : "Blocked"}
                </strong>
              </div>

              <div className="autonomy-status">
                <i aria-hidden="true" />
                <div>
                  <small>CURRENT GOVERNANCE MODE</small>
                  <strong>{current.label}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="autonomy-footer">
            Automation tanpa governance bukan efisiensi. Itu risiko.
          </div>
        </div>
      </div>
    </section>
  );
}
