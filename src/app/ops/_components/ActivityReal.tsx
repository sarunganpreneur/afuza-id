"use client";

import { useEffect, useState } from "react";

type Event = {
  id: string;
  type: string;
  site_name: string;
  label: string;
  detail: string;
  status: string;
  created_at: string;
};

export default function ActivityReal() {
  const [events, setEvents] = useState<Event[] | null>(null);

  useEffect(() => {
    fetch("/api/internal/ops/activity", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => setEvents(json.events ?? []))
      .catch(() => setEvents([]));
  }, []);

  if (!events) {
    return <div className="card">Loading activity...</div>;
  }

  const generationCount = events.filter(
    (event) => event.type === "GENERATION_JOB",
  ).length;

  const versionCount = events.filter(
    (event) => event.type === "SITE_VERSION",
  ).length;

  return (
    <>
      <div className="grid-4">
        <div className="card">
          <div className="metric-label">Recent Events</div>
          <div className="metric">{events.length}</div>
          <div className="metric-sub">Latest operational timeline</div>
        </div>

        <div className="card">
          <div className="metric-label">Generation</div>
          <div className="metric">{generationCount}</div>
          <div className="metric-sub">Generation pipeline events</div>
        </div>

        <div className="card">
          <div className="metric-label">Site Versions</div>
          <div className="metric">{versionCount}</div>
          <div className="metric-sub">Committed output versions</div>
        </div>

        <div className="card">
          <div className="metric-label">Source</div>
          <div className="metric" style={{ fontSize: 18 }}>
            LIVE
          </div>
          <div className="metric-sub">Afuza Core database</div>
        </div>
      </div>

      <div className="section-title">
        <h2>Event Timeline</h2>
        <span>latest first</span>
      </div>

      <div className="table-card">
        {events.length === 0 ? (
          <div className="row">No recent activity.</div>
        ) : (
          events.map((event) => (
            <div className="row row-4" key={event.id}>
              <div>
                <strong>{event.site_name}</strong>
                <div className="metric-sub">{event.label}</div>
              </div>

              <span className="badge">{event.type}</span>

              <span className="muted">{event.status}</span>

              <span className="muted">
                {new Date(event.created_at).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
