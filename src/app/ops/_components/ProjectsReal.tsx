"use client";

import { useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
  slug: string;
  site_status: string;
  health: "HEALTHY" | "WARNING" | "AT_RISK";
  current_content_version: number | null;
  published_version: number | null;
  published_at: string | null;
  latest_job: {
    id: string;
    status: string;
    retry_count: number | null;
    created_at: string;
  } | null;
  created_at: string;
};

export default function ProjectsReal() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/internal/ops/projects", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `HTTP_${res.status}`);
        }

        return res.json();
      })
      .then((json) => setProjects(json.projects ?? []))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "PROJECTS_ERROR"),
      );
  }, []);

  if (error) {
    return (
      <div className="card">
        <span className="badge danger">Data Error</span>
        <div className="metric-sub">{error}</div>
      </div>
    );
  }

  if (!projects) {
    return <div className="card">Loading projects...</div>;
  }

  const healthy = projects.filter((p) => p.health === "HEALTHY").length;
  const warning = projects.filter((p) => p.health === "WARNING").length;
  const atRisk = projects.filter((p) => p.health === "AT_RISK").length;

  return (
    <>
      <div className="grid-4">
        <div className="card">
          <div className="metric-label">Total Sites</div>
          <div className="metric">{projects.length}</div>
          <div className="metric-sub">All website workspaces</div>
        </div>

        <div className="card">
          <div className="metric-label">Healthy</div>
          <div className="metric">{healthy}</div>
          <div className="metric-sub">No operational issue detected</div>
        </div>

        <div className="card">
          <div className="metric-label">Warning</div>
          <div className="metric">{warning}</div>
          <div className="metric-sub">Generation currently active</div>
        </div>

        <div className="card">
          <div className="metric-label">At Risk</div>
          <div className="metric">{atRisk}</div>
          <div className="metric-sub">Latest execution failed</div>
        </div>
      </div>

      <div className="section-title">
        <h2>Project Portfolio</h2>
        <span>{projects.length} projects</span>
      </div>

      <div className="table-card">
        {projects.length === 0 ? (
          <div className="row">No projects found.</div>
        ) : (
          projects.map((project) => (
            <div className="row row-4" key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <div className="metric-sub">/{project.slug}</div>
              </div>

              <span
                className={`badge ${
                  project.health === "HEALTHY"
                    ? "good"
                    : project.health === "AT_RISK"
                      ? "danger"
                      : "warn"
                }`}
              >
                {project.health}
              </span>

              <span className="muted">
                {project.latest_job?.status ?? project.site_status}
              </span>

              <span className="muted">
                {project.published_version
                  ? `Published v${project.published_version}`
                  : `Draft v${project.current_content_version ?? 0}`}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
