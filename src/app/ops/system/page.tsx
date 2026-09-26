import OpsShell from "../_components/OpsShell";
import { SystemHealthGrid } from "../_components/SystemHealth";

export default function Page() {
  const controls = [
    ["AI Tasks", "DISABLED", "Execution control is not connected yet."],
    ["Automations", "DISABLED", "n8n control is being prepared separately."],
    ["Outbound", "DISABLED", "Outbound actions remain safety locked."],
    ["Site Publishing", "DISABLED", "Publishing control is not wired to Ops."],
    ["Deployment", "DISABLED", "Deployment remains outside command control."],
  ];

  return (
    <OpsShell
      title="System"
      subtitle="Infrastructure health, integration readiness and safety controls."
    >
      <div className="section-title" style={{ marginTop: 0 }}>
        <h2>Infrastructure Health</h2>
        <span>live status</span>
      </div>

      <SystemHealthGrid />

      <div className="section-title">
        <h2>Control Plane</h2>
        <span>safety locked</span>
      </div>

      <div className="table-card">
        {controls.map(([name, status, detail]) => (
          <div className="row row-3" key={name}>
            <strong>{name}</strong>
            <span className="badge warn">{status}</span>
            <span className="muted">{detail}</span>
          </div>
        ))}
      </div>

      <div className="section-title">
        <h2>Emergency Controls</h2>
        <span>not armed</span>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="metric-label">Global Emergency Stop</div>

          <div style={{ marginTop: 14 }}>
            <button className="btn" disabled>
              EMERGENCY STOP
            </button>
          </div>

          <div className="metric-sub">
            Disabled until audited system-control service exists.
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Safety State</div>

          <div style={{ marginTop: 14 }}>
            <span className="badge good">SAFE</span>
          </div>

          <div className="metric-sub">
            No high-impact actions can currently be executed from Ops.
          </div>
        </div>
      </div>
    </OpsShell>
  );
}
