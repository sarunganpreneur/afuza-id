"use client";

import { useEffect, useState } from "react";

type AlertResponse = {
  summary: {
    total: number;
    critical: number;
    high: number;
    warning: number;
  };
  alerts: Array<{
    id: string;
    severity: "WARNING" | "HIGH" | "CRITICAL";
    type: string;
    title: string;
    detail: string;
    site_name: string;
    created_at: string;
  }>;
};

export default function AlertsReal() {
  const [data, setData] = useState<AlertResponse | null>(null);

  useEffect(() => {
    fetch("/api/internal/ops/alerts", { cache: "no-store" })
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data?.summary) {
    return <div className="card">Loading alerts...</div>;
  }

  return (
    <>
      <div className="grid-4">
        <div className="card">
          <div className="metric-label">Active Alerts</div>
          <div className="metric">{data.summary.total}</div>
          <div className="metric-sub">Derived operational conditions</div>
        </div>

        <div className="card">
          <div className="metric-label">Critical</div>
          <div className="metric">{data.summary.critical}</div>
          <div className="metric-sub">Requires immediate review</div>
        </div>

        <div className="card">
          <div className="metric-label">High</div>
          <div className="metric">{data.summary.high}</div>
          <div className="metric-sub">Failed executions</div>
        </div>

        <div className="card">
          <div className="metric-label">Warning</div>
          <div className="metric">{data.summary.warning}</div>
          <div className="metric-sub">Stale or repeatedly retried jobs</div>
        </div>
      </div>

      <div className="section-title">
        <h2>Operational Exceptions</h2>
        <span>read-only derived state</span>
      </div>

      <div className="table-card">
        {data.alerts.length === 0 ? (
          <div className="row">
            <div>
              <strong>All clear</strong>
              <div className="metric-sub">
                No current state triggers the configured alert rules.
              </div>
            </div>
          </div>
        ) : (
          data.alerts.map((alert) => (
            <div className="row row-4" key={alert.id}>
              <div>
                <strong>{alert.title}</strong>
                <div className="metric-sub">{alert.detail}</div>
              </div>

              <span
                className={`badge ${
                  alert.severity === "WARNING" ? "warn" : "danger"
                }`}
              >
                {alert.severity}
              </span>

              <span className="muted">
                {alert.type.replaceAll("_", " ")}
              </span>

              <span className="muted">
                {new Date(alert.created_at).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
