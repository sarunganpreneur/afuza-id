"use client";

import { useEffect, useState } from "react";

type TaskResponse = {
  summary: {
    total: number;
    running: number;
    failed: number;
    stale: number;
    retried: number;
  };
  tasks: Array<{
    id: string;
    site_name: string;
    status: string;
    retry_count: number | null;
    created_at: string;
    age_minutes: number;
    running: boolean;
    failed: boolean;
    stale: boolean;
  }>;
};

export default function TasksReal() {
  const [data, setData] = useState<TaskResponse | null>(null);

  useEffect(() => {
    fetch("/api/internal/ops/tasks", { cache: "no-store" })
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data?.summary) return <div className="card">Loading generation tasks...</div>;

  return (
    <>
      <div className="grid-4">
        {[
          ["Running", data.summary.running],
          ["Failed", data.summary.failed],
          ["Stale", data.summary.stale],
          ["Retried", data.summary.retried],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric">{value}</div>
          </div>
        ))}
      </div>

      <div className="section-title">
        <h2>Generation Tasks</h2>
        <span>Latest {data.tasks.length}</span>
      </div>

      <div className="table-card">
        {data.tasks.map((task) => (
          <div className="row row-4" key={task.id}>
            <strong>{task.site_name}</strong>

            <span
              className={`badge ${
                task.failed
                  ? "danger"
                  : task.stale
                    ? "warn"
                    : task.running
                      ? "warn"
                      : "good"
              }`}
            >
              {task.status}
            </span>

            <span className="muted">
              retry {task.retry_count ?? 0}
            </span>

            <span className="muted">
              {task.age_minutes} min ago
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
