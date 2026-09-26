"use client";

import { useEffect, useState } from "react";

type Status =
  | "ONLINE"
  | "CONFIGURED"
  | "NOT_CONFIGURED"
  | "DEGRADED"
  | "ERROR";

type HealthData = {
  status: Status;
  checked_at: string;
  latency_ms: number;
  components: Record<
    string,
    {
      status: Status;
      detail?: string;
    }
  >;
};

function dotClass(status?: Status) {
  if (status === "ONLINE" || status === "CONFIGURED") return "online";
  if (status === "ERROR") return "error";
  return "pending";
}

const sidebarComponents = [
  ["afuza_core", "Afuza Core"],
  ["database", "Database"],
  ["openai", "OpenAI"],
  ["n8n", "n8n"],
] as const;

export function SidebarSystemHealth() {
  const [data, setData] = useState<HealthData | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await fetch("/api/internal/ops/system/status", {
          cache: "no-store",
        });

        const json = (await response.json()) as HealthData;

        if (mounted) setData(json);
      } catch {
        if (mounted) setData(null);
      }
    }

    load();
    const timer = window.setInterval(load, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      {sidebarComponents.map(([key, label]) => {
        const component = data?.components?.[key];
        const status = component?.status ?? "DEGRADED";

        return (
          <div className="health-row" key={key}>
            <span>
              <i className={`dot ${dotClass(status)}`} />
              {label}
            </span>
            <small>{component?.status ?? "checking"}</small>
          </div>
        );
      })}
    </>
  );
}

export function SystemHealthGrid() {
  const [data, setData] = useState<HealthData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/internal/ops/system/status", {
          cache: "no-store",
        });

        setData((await response.json()) as HealthData);
      } catch {
        setData(null);
      }
    }

    load();
  }, []);

  const components = [
    ["afuza_core", "Afuza Core"],
    ["database", "Database"],
    ["openai", "OpenAI"],
    ["n8n", "n8n"],
    ["redis", "Redis"],
    ["google_drive", "Google Drive"],
    ["google_sheets", "Google Sheets"],
    ["whatsapp", "WhatsApp"],
  ] as const;

  return (
    <>
      <div className="grid-4">
        {components.map(([key, label]) => {
          const component = data?.components?.[key];
          const status = component?.status ?? "DEGRADED";

          return (
            <div className="card" key={key}>
              <div className="metric-label">{label}</div>

              <div style={{ marginTop: 12 }}>
                <span
                  className={`badge ${
                    status === "ONLINE" || status === "CONFIGURED"
                      ? "good"
                      : status === "ERROR"
                        ? "danger"
                        : "warn"
                  }`}
                >
                  {component?.status ?? "CHECKING"}
                </span>
              </div>

              <div className="metric-sub">
                {component?.detail ?? "Checking system status..."}
              </div>
            </div>
          );
        })}
      </div>

      {data && (
        <div className="metric-sub" style={{ marginTop: 14 }}>
          Last checked: {new Date(data.checked_at).toLocaleString()}
          {" · "}
          {data.latency_ms} ms
        </div>
      )}
    </>
  );
}
