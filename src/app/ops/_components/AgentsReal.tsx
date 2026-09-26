"use client";

import { useEffect, useState } from "react";

type Agent = {
  id: string;
  name: string;
  role: string;
  description: string;
  status: "ACTIVE" | "PAUSED" | "DEGRADED" | "PLANNED";
  health: "HEALTHY" | "DEGRADED" | "NOT_CONNECTED";
  scope: string[];
  capabilities: string[];
  runtime: string;
  source: "AFUZA_CORE" | "PLANNED";
  pause_state: "RUNNING" | "LOCKED" | "PAUSED";
  execution_enabled: boolean;
  last_activity_at: string | null;
  control_locked: boolean;
};

type AgentsResponse = {
  summary: {
    total: number;
    active: number;
    degraded: number;
    paused: number;
    planned: number;
  };
  agents: Agent[];
  controls: {
    execution_controls_enabled: boolean;
    note: string;
  };
};

function badgeClass(value: string) {
  if (value === "ACTIVE" || value === "HEALTHY" || value === "RUNNING") {
    return "good";
  }

  if (value === "DEGRADED" || value === "PAUSED") {
    return "warn";
  }

  if (value === "PLANNED" || value === "NOT_CONNECTED" || value === "LOCKED") {
    return "";
  }

  return "";
}

export default function AgentsReal() {
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/internal/ops/agents", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? `HTTP_${response.status}`);
        }

        return response.json();
      })
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "AGENTS_DATA_ERROR",
        ),
      );
  }, []);

  if (error) {
    return (
      <div className="card">
        <span className="badge danger">Agent Data Error</span>
        <div className="metric-sub">{error}</div>
      </div>
    );
  }

  if (!data) {
    return <div className="card">Loading agent registry...</div>;
  }

  return (
    <>
      <div className="grid-4">
        <div className="card">
          <div className="metric-label">Registered Agents</div>
          <div className="metric">{data.summary.total}</div>
          <div className="metric-sub">Afuza agent registry V1</div>
        </div>

        <div className="card">
          <div className="metric-label">Active</div>
          <div className="metric">{data.summary.active}</div>
          <div className="metric-sub">Existing operational capabilities</div>
        </div>

        <div className="card">
          <div className="metric-label">Degraded</div>
          <div className="metric">{data.summary.degraded}</div>
          <div className="metric-sub">Requires operational review</div>
        </div>

        <div className="card">
          <div className="metric-label">Planned</div>
          <div className="metric">{data.summary.planned}</div>
          <div className="metric-sub">Registered but not connected</div>
        </div>
      </div>

      <div className="section-title">
        <h2>AI Workforce</h2>
        <span>registry + live health</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: 12,
        }}
      >
        {data.agents.map((agent) => (
          <div className="card" key={agent.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
              }}
            >
              <div>
                <div className="metric-label">{agent.role}</div>
                <div
                  style={{
                    marginTop: 7,
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {agent.name}
                </div>
              </div>

              <span className={`badge ${badgeClass(agent.status)}`}>
                {agent.status}
              </span>
            </div>

            <div
              style={{
                marginTop: 12,
                minHeight: 48,
                color: "#71717a",
                fontSize: 10,
                lineHeight: 1.6,
              }}
            >
              {agent.description}
            </div>

            <div
              style={{
                marginTop: 14,
                paddingTop: 13,
                borderTop: "1px solid #27272a",
                display: "grid",
                gap: 9,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 9,
                }}
              >
                <span className="muted">Health</span>
                <span className={`badge ${badgeClass(agent.health)}`}>
                  {agent.health}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 9,
                }}
              >
                <span className="muted">Runtime</span>
                <span>{agent.runtime}</span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 9,
                }}
              >
                <span className="muted">Control</span>
                <span className="badge">
                  {agent.control_locked ? "LOCKED" : "AVAILABLE"}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 9,
                }}
              >
                <span className="muted">Last Activity</span>
                <span>
                  {agent.last_activity_at
                    ? new Date(agent.last_activity_at).toLocaleString()
                    : "—"}
                </span>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
              }}
            >
              <div className="metric-label">Capabilities</div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                  marginTop: 8,
                }}
              >
                {agent.capabilities.map((capability) => (
                  <span
                    className="badge"
                    key={capability}
                    style={{ textTransform: "none" }}
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-title">
        <h2>Agent Controls</h2>
        <span>safety locked</span>
      </div>

      <div className="card">
        <span className="badge good">Registry Only</span>

        <div style={{ marginTop: 12, fontSize: 12 }}>
          Execution controls are intentionally disabled.
        </div>

        <div className="metric-sub">
          This session only registers and observes agents. Runtime control,
          pause/resume, delegation and orchestration will be connected through
          the dedicated control layer.
        </div>
      </div>
    </>
  );
}
