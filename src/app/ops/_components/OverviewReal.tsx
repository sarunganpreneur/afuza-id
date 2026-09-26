"use client";

import { useEffect, useState } from "react";
import styles from "./OverviewReal.module.css";

type Overview = {
  metrics: {
    sites_total: number;
    sites_published: number;
    generation_running: number;
    generation_failed: number;
  };
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    health: "HEALTHY" | "WARNING" | "AT_RISK";
    current_content_version: number | null;
    published_version: number | null;
    latest_job_status: string | null;
    created_at: string;
  }>;
  activity: Array<{
    type: string;
    entity_id: string;
    site_id: string;
    status: string;
    created_at: string;
  }>;
};

type Alerts = {
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

type SystemHealth = {
  status: string;
  checked_at: string;
  latency_ms: number;
  components: Record<
    string,
    {
      status: string;
      detail?: string;
    }
  >;
};

function statusClass(
  value: string,
): string {
  if (
    value === "ONLINE" ||
    value === "CONFIGURED" ||
    value === "HEALTHY"
  ) {
    return styles.good;
  }

  if (
    value === "ERROR" ||
    value === "FAILED" ||
    value === "CRITICAL" ||
    value === "AT_RISK"
  ) {
    return styles.danger;
  }

  if (
    value === "WARNING" ||
    value === "DEGRADED" ||
    value === "NOT_CONFIGURED"
  ) {
    return styles.warn;
  }

  return styles.neutral;
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function OverviewReal() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [overviewResponse, alertsResponse, healthResponse] =
          await Promise.all([
            fetch("/api/internal/ops/overview", {
              cache: "no-store",
            }),
            fetch("/api/internal/ops/alerts", {
              cache: "no-store",
            }),
            fetch("/api/internal/ops/system/status", {
              cache: "no-store",
            }),
          ]);

        if (!overviewResponse.ok) {
          const body = await overviewResponse.json().catch(() => null);
          throw new Error(
            body?.error ?? `OVERVIEW_HTTP_${overviewResponse.status}`,
          );
        }

        if (!alertsResponse.ok) {
          const body = await alertsResponse.json().catch(() => null);
          throw new Error(
            body?.error ?? `ALERTS_HTTP_${alertsResponse.status}`,
          );
        }

        const overviewJson =
          (await overviewResponse.json()) as Overview;
        const alertsJson =
          (await alertsResponse.json()) as Alerts;

        const healthJson = healthResponse.ok
          ? ((await healthResponse.json()) as SystemHealth)
          : null;

        if (!active) return;

        setOverview(overviewJson);
        setAlerts(alertsJson);
        setHealth(healthJson);
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "UNKNOWN_DASHBOARD_ERROR",
        );
      }
    }

    load();

    const timer = window.setInterval(load, 30000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (error) {
    return (
      <div className={styles.error}>
        <strong>Command Center data unavailable</strong>
        <p>
          {error}. Make sure you are logged in using an account
          authorized through Ops RBAC with break-glass recovery fallback.
        </p>
      </div>
    );
  }

  if (!overview || !alerts) {
    return (
      <div className={styles.loading}>
        Loading Afuza Command Center...
      </div>
    );
  }

  const systemComponents = [
    ["afuza_core", "Afuza Core"],
    ["database", "Database"],
    ["openai", "OpenAI"],
    ["n8n", "n8n"],
  ] as const;

  const systemStatus =
    health?.status ?? "CHECKING";

  return (
    <div className={styles.dashboard}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} />

        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <div className={styles.heroEyebrow}>
              Executive Operations
            </div>

            <h2 className={styles.heroTitle}>
              One view of what Afuza is doing right now.
            </h2>

            <p className={styles.heroText}>
              Monitor projects, generation activity, system health
              and operational exceptions from one command surface.
            </p>
          </div>

          <div className={styles.heroStatus}>
            <div className={styles.heroStatusLabel}>
              Command Center
            </div>

            <div className={styles.heroStatusValue}>
              <span className={styles.liveDot} />
              LIVE
            </div>

            <div className={styles.heroStatusMeta}>
              Auto refresh · 30 seconds
            </div>
          </div>
        </div>

        <div className={styles.metrics}>
          <div className={styles.metricCard}>
            <div className={styles.metricTop}>
              <span className={styles.metricLabel}>
                Total Sites
              </span>
            </div>
            <div className={styles.metricValue}>
              {overview.metrics.sites_total}
            </div>
            <div className={styles.metricHint}>
              website workspaces
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricTop}>
              <span className={styles.metricLabel}>
                Published
              </span>
            </div>
            <div className={styles.metricValue}>
              {overview.metrics.sites_published}
            </div>
            <div className={styles.metricHint}>
              live site versions
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricTop}>
              <span className={styles.metricLabel}>
                Running Jobs
              </span>
            </div>
            <div className={styles.metricValue}>
              {overview.metrics.generation_running}
            </div>
            <div className={styles.metricHint}>
              active generation pipeline
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricTop}>
              <span className={styles.metricLabel}>
                Attention
              </span>
            </div>
            <div className={styles.metricValue}>
              {alerts.summary.total}
            </div>
            <div className={styles.metricHint}>
              derived operational alerts
            </div>
          </div>
        </div>
      </section>

      <section className={styles.systemStrip}>
        {systemComponents.map(([key, label]) => {
          const component =
            health?.components?.[key];

          const status =
            component?.status ?? "CHECKING";

          return (
            <div
              className={styles.systemItem}
              key={key}
              title={component?.detail ?? ""}
            >
              <div className={styles.systemName}>
                {label}
              </div>

              <div className={styles.systemValue}>
                <span
                  className={`${styles.badge} ${statusClass(
                    status,
                  )}`}
                >
                  {status}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      <section className={styles.sectionGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.panelTitle}>
                Project Pulse
              </div>
              <div className={styles.panelDescription}>
                Latest operational state for Afuza websites.
              </div>
            </div>

            <div className={styles.panelMeta}>
              {overview.projects.length} shown
            </div>
          </div>

          {overview.projects.length === 0 ? (
            <div className={styles.cleanState}>
              <strong>No projects yet</strong>
              <p>
                Project data will appear here when sites exist.
              </p>
            </div>
          ) : (
            overview.projects.map((project) => (
              <div
                className={styles.projectRow}
                key={project.id}
              >
                <div className={styles.projectName}>
                  <strong>{project.name}</strong>
                  <div className={styles.projectSlug}>
                    /{project.slug}
                  </div>
                </div>

                <span
                  className={`${styles.badge} ${statusClass(
                    project.health,
                  )}`}
                >
                  {project.health}
                </span>

                <span className={styles.muted}>
                  {project.latest_job_status ??
                    project.status}
                </span>

                <span className={styles.muted}>
                  {project.published_version
                    ? `Published v${project.published_version}`
                    : `Draft v${
                        project.current_content_version ?? 0
                      }`}
                </span>
              </div>
            ))
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.panelTitle}>
                Attention Required
              </div>
              <div className={styles.panelDescription}>
                Operational conditions worth reviewing.
              </div>
            </div>

            <div className={styles.panelMeta}>
              {alerts.summary.total} alerts
            </div>
          </div>

          {alerts.alerts.length === 0 ? (
            <div className={styles.cleanState}>
              <div className={styles.cleanIcon}>✓</div>
              <strong>No active derived alerts</strong>
              <p>
                Current generation state does not trigger
                operational alert rules.
              </p>
            </div>
          ) : (
            <div className={styles.attentionBody}>
              {alerts.alerts.slice(0, 5).map((alert) => (
                <div
                  className={styles.attentionItem}
                  key={alert.id}
                >
                  <div className={styles.attentionTop}>
                    <div className={styles.attentionTitle}>
                      {alert.site_name}
                    </div>

                    <span
                      className={`${styles.badge} ${statusClass(
                        alert.severity,
                      )}`}
                    >
                      {alert.severity}
                    </span>
                  </div>

                  <div className={styles.attentionText}>
                    {alert.title}
                    <br />
                    {alert.detail}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <div className={styles.panelTitle}>
              Recent Activity
            </div>
            <div className={styles.panelDescription}>
              Latest generation and site-version events.
            </div>
          </div>

          <div className={styles.panelMeta}>
            LIVE FEED
          </div>
        </div>

        {overview.activity.length === 0 ? (
          <div className={styles.cleanState}>
            <strong>No recent activity</strong>
          </div>
        ) : (
          overview.activity.map((item) => (
            <div
              className={styles.activityRow}
              key={`${item.type}-${item.entity_id}`}
            >
              <div className={styles.activityType}>
                {item.type.replaceAll("_", " ")}
              </div>

              <div className={styles.activityMain}>
                <strong>{item.status}</strong>
                <span>
                  Site ID · {item.site_id}
                </span>
              </div>

              <div className={styles.activityTime}>
                {formatTime(item.created_at)}
              </div>
            </div>
          ))
        )}
      </section>

      <div
        style={{
          color: "#52525b",
          fontSize: 9,
          textAlign: "right",
        }}
      >
        System {systemStatus}
        {health
          ? ` · ${health.latency_ms} ms · checked ${formatTime(
              health.checked_at,
            )}`
          : ""}
      </div>
    </div>
  );
}
