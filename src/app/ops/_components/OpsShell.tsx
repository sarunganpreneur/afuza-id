"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { SidebarSystemHealth } from "./SystemHealth";

const nav = [
  ["/", "Overview", "⌂"],
  ["/command", "Command", "⌘"],
  ["/approvals", "Approvals", "✓"],
  ["/executions", "Executions", "▶"],
  ["/projects", "Projects", "▣"],
  ["/agents", "Agents", "◉"],
  ["/automations", "Automations", "⚡"],
  ["/alerts", "Alerts", "⚠"],
  ["/usage", "Usage", "◫"],
  ["/activity", "Activity", "≡"],
  ["/access", "Access", "♙"],
  ["/system", "System", "⚙"],
] as const;

export default function OpsShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const visiblePath =
    pathname?.replace(
      /^\/ops/,
      "",
    ) || "/";

  const [
    identity,
    setIdentity,
  ] =
    useState<{
      email?: string | null;

      permissions?: {
        OPS_ACCESS?: boolean;
        OPS_APPROVE?: boolean;
        OPS_CONTROL?: boolean;
        OPS_ADMIN?: boolean;
      };
    } | null>(
      null,
    );

  useEffect(() => {
    let cancelled =
      false;

    fetch(
      "/api/internal/ops/access/permissions",
      {
        cache:
          "no-store",
      },
    )
      .then(
        async (
          response,
        ) => {
          if (
            !response.ok
          ) {
            return null;
          }

          return response.json();
        },
      )
      .then(
        (
          body,
        ) => {
          if (
            !cancelled &&
            body
          ) {
            setIdentity(
              body,
            );
          }
        },
      )
      .catch(
        () => null,
      );

    return () => {
      cancelled =
        true;
    };
  }, []);

  const permissions =
    identity?.permissions;

  const canAdmin =
    permissions?.OPS_ADMIN ===
    true;

  const roleLabel =
    permissions?.OPS_ADMIN
      ? "Owner"
      : permissions?.OPS_APPROVE
        ? "Approver"
        : permissions?.OPS_CONTROL
          ? "Operator"
          : "Observer";

  const email =
    identity?.email ??
    "";

  const initials =
    email
      ? email
          .split("@")[0]
          .slice(0, 2)
          .toUpperCase()
      : "OP";

  return (
    <div className="ops-root">
      <aside className="ops-sidebar">
        <div className="sidebar-head">
          <div className="brand">
            <div className="brand-mark">a</div>
            <div className="brand-copy">
              <strong>afuza ops</strong>
              <span>command center</span>
            </div>
          </div>

          <div className="environment-pill">
            <span className="environment-dot" />
            production
          </div>
        </div>

        <div className="sidebar-section-label">Workspace</div>

        <nav className="ops-nav">
          {nav
            .filter(
              ([href]) =>
                href !== "/access" ||
                canAdmin,
            )
            .map(([href, label, icon]) => {
            const active =
              href === "/"
                ? visiblePath === "/" || visiblePath === ""
                : visiblePath.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={`nav-item ${active ? "active" : ""}`}
              >
                <span className="nav-icon">{icon}</span>
                <span className="nav-label">{label}</span>
                {active && <span className="nav-active-dot" />}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-health">
          <div className="sidebar-section-label">System health</div>
          <SidebarSystemHealth />
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-footer-title">AFUZA.ID</div>
          <div className="sidebar-footer-copy">
            Internal operational control surface
          </div>
        </div>
      </aside>

      <div className="ops-main">
        <header className="ops-topbar">
          <div className="command-mini">
            <span className="command-icon">⌘</span>
            <span>Ask Afuza or run a command...</span>
            <span className="command-shortcut">⌘ K</span>
          </div>

          <div className="top-actions">
            <div className="system-pill">
              <i className="dot online" />
              Core Online
            </div>

            <div className="top-divider" />

            <div className="avatar-wrap">
              <div className="avatar">
                {initials}
              </div>

              <div className="avatar-copy">
                <strong>
                  {roleLabel}
                </strong>

                <span>
                  Operations
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="ops-content">
          <div className="page-head">
            <div>
              <div className="eyebrow">AFUZA.ID · INTERNAL</div>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>

          {children}
        </main>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; }

        html, body {
          margin: 0;
          min-height: 100%;
          background: #09090b;
        }

        body {
          color: #f4f4f5;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        button, input {
          font: inherit;
        }

        .ops-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 260px 1fr;
          background:
            radial-gradient(circle at 78% -10%, rgba(63,63,70,.18), transparent 32%),
            linear-gradient(180deg, #0a0a0d 0%, #09090b 100%);
        }

        .ops-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          width: 260px;
          padding: 18px 14px 16px;
          border-right: 1px solid #232328;
          background:
            linear-gradient(180deg, rgba(15,15,18,.985), rgba(10,10,12,.985));
          display: flex;
          flex-direction: column;
          z-index: 20;
        }

        .sidebar-head {
          padding: 2px 8px 20px;
          border-bottom: 1px solid #232328;
          margin-bottom: 16px;
        }

        .brand {
          display: flex;
          gap: 11px;
          align-items: center;
        }

        .brand-mark {
          width: 37px;
          height: 37px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: #f4f4f5;
          color: #09090b;
          font-size: 22px;
          line-height: 1;
          font-weight: 850;
          box-shadow:
            0 8px 30px rgba(255,255,255,.06),
            inset 0 -1px rgba(0,0,0,.12);
        }

        .brand-copy strong {
          display: block;
          font-size: 14px;
          letter-spacing: -.01em;
          text-transform: lowercase;
        }

        .brand-copy span {
          display: block;
          color: #71717a;
          margin-top: 3px;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .17em;
          text-transform: uppercase;
        }

        .environment-pill {
          width: fit-content;
          margin-top: 14px;
          border: 1px solid #2b2b30;
          border-radius: 999px;
          padding: 5px 8px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #71717a;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: .09em;
        }

        .environment-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4ade80;
        }

        .sidebar-section-label,
        .section-label,
        .eyebrow {
          color: #52525b;
          font-size: 8px;
          letter-spacing: .16em;
          font-weight: 750;
          text-transform: uppercase;
        }

        .sidebar-section-label {
          padding: 0 10px 8px;
        }

        .ops-nav {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .nav-item {
          position: relative;
          height: 41px;
          padding: 0 11px;
          border: 1px solid transparent;
          border-radius: 9px;
          display: flex;
          align-items: center;
          gap: 11px;
          color: #8b8b94;
          font-size: 12px;
          transition:
            background .15s ease,
            border-color .15s ease,
            color .15s ease;
        }

        .nav-item:hover {
          background: rgba(39,39,42,.58);
          color: #e4e4e7;
        }

        .nav-item.active {
          border-color: #303036;
          background:
            linear-gradient(180deg, rgba(39,39,42,.9), rgba(30,30,34,.9));
          color: #fafafa;
          box-shadow: inset 0 1px rgba(255,255,255,.025);
        }

        .nav-icon {
          width: 19px;
          text-align: center;
          color: #a1a1aa;
          font-size: 12px;
        }

        .nav-item.active .nav-icon {
          color: #f4f4f5;
        }

        .nav-label {
          flex: 1;
        }

        .nav-active-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #f4f4f5;
        }

        .sidebar-health {
          margin-top: auto;
          padding-top: 16px;
          border-top: 1px solid #232328;
        }

        .health-row {
          height: 31px;
          padding: 0 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #8b8b94;
          font-size: 10px;
        }

        .health-row span {
          display: flex;
          align-items: center;
        }

        .health-row small {
          color: #52525b;
          font-size: 7px;
          letter-spacing: .05em;
          text-transform: uppercase;
        }

        .dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          margin-right: 7px;
          border-radius: 50%;
          background: #71717a;
        }

        .dot.online {
          background: #4ade80;
          box-shadow: 0 0 0 4px rgba(74,222,128,.05);
        }

        .dot.pending {
          background: #fbbf24;
        }

        .dot.error {
          background: #fb7185;
        }

        .sidebar-footer {
          margin-top: 13px;
          padding: 13px 10px 2px;
          border-top: 1px solid #1f1f23;
        }

        .sidebar-footer-title {
          color: #71717a;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .12em;
        }

        .sidebar-footer-copy {
          margin-top: 4px;
          color: #3f3f46;
          font-size: 8px;
          line-height: 1.5;
        }

        .ops-main {
          grid-column: 2;
          min-width: 0;
        }

        .ops-topbar {
          height: 66px;
          position: sticky;
          top: 0;
          z-index: 15;
          border-bottom: 1px solid rgba(39,39,42,.92);
          background: rgba(9,9,11,.82);
          backdrop-filter: blur(18px);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          padding: 0 30px;
        }

        .command-mini {
          width: min(560px, 52vw);
          height: 38px;
          border: 1px solid #29292e;
          background:
            linear-gradient(180deg, rgba(24,24,27,.85), rgba(17,17,19,.9));
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 11px;
          color: #71717a;
          font-size: 11px;
          box-shadow: inset 0 1px rgba(255,255,255,.02);
        }

        .command-icon {
          color: #a1a1aa;
        }

        .command-shortcut {
          margin-left: auto;
          border: 1px solid #303036;
          border-radius: 5px;
          padding: 2px 5px;
          color: #52525b;
          font-size: 8px;
        }

        .top-actions {
          display: flex;
          gap: 13px;
          align-items: center;
        }

        .system-pill {
          border: 1px solid #29292e;
          border-radius: 999px;
          padding: 7px 10px;
          color: #a1a1aa;
          font-size: 9px;
        }

        .top-divider {
          width: 1px;
          height: 25px;
          background: #27272a;
        }

        .avatar-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .avatar {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          border: 1px solid #3a3a40;
          background: #18181b;
          display: grid;
          place-items: center;
          font-size: 9px;
          font-weight: 750;
        }

        .avatar-copy strong,
        .avatar-copy span {
          display: block;
        }

        .avatar-copy strong {
          font-size: 9px;
        }

        .avatar-copy span {
          margin-top: 2px;
          color: #52525b;
          font-size: 8px;
        }

        .ops-content {
          max-width: 1520px;
          margin: auto;
          padding: 32px 32px 64px;
        }

        .page-head {
          margin-bottom: 25px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .page-head h1 {
          margin: 8px 0 0;
          font-size: 28px;
          line-height: 1.08;
          letter-spacing: -.035em;
        }

        .page-head p {
          margin: 7px 0 0;
          color: #71717a;
          font-size: 11px;
          line-height: 1.5;
        }

        .grid-4 {
          display: grid;
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap: 11px;
        }

        .grid-2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0,1fr));
          gap: 12px;
        }

        .card {
          border: 1px solid #25252a;
          border-radius: 14px;
          background:
            linear-gradient(180deg, rgba(19,19,22,.96), rgba(15,15,18,.96));
          padding: 18px;
          box-shadow: inset 0 1px rgba(255,255,255,.018);
        }

        .metric-label {
          color: #71717a;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .09em;
        }

        .metric {
          margin-top: 10px;
          font-size: 30px;
          font-weight: 760;
          line-height: 1;
          letter-spacing: -.045em;
        }

        .metric-sub {
          margin-top: 6px;
          font-size: 9px;
          color: #52525b;
          line-height: 1.5;
        }

        .section-title {
          margin: 28px 0 11px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .section-title h2 {
          margin: 0;
          font-size: 12px;
          letter-spacing: -.01em;
        }

        .section-title span {
          color: #52525b;
          font-size: 8px;
          letter-spacing: .07em;
          text-transform: uppercase;
        }

        .table-card {
          border: 1px solid #25252a;
          border-radius: 14px;
          background: rgba(17,17,19,.94);
          overflow: hidden;
        }

        .row {
          min-height: 54px;
          display: grid;
          align-items: center;
          gap: 16px;
          padding: 8px 17px;
          border-bottom: 1px solid #212126;
          font-size: 10px;
        }

        .row:last-child {
          border-bottom: 0;
        }

        .row:hover {
          background: rgba(39,39,42,.18);
        }

        .row-4 {
          grid-template-columns: 1.6fr .7fr .85fr .9fr;
        }

        .row-3 {
          grid-template-columns: 1.6fr .8fr 1fr;
        }

        .muted {
          color: #71717a;
        }

        .badge {
          display: inline-flex;
          width: fit-content;
          align-items: center;
          border: 1px solid #34343a;
          border-radius: 999px;
          padding: 4px 7px;
          font-size: 7px;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: .065em;
        }

        .badge.good {
          color: #86efac;
          border-color: rgba(74,222,128,.22);
          background: rgba(74,222,128,.035);
        }

        .badge.warn {
          color: #fde047;
          border-color: rgba(250,204,21,.23);
          background: rgba(250,204,21,.035);
        }

        .badge.danger {
          color: #fda4af;
          border-color: rgba(251,113,133,.25);
          background: rgba(251,113,133,.035);
        }

        .placeholder {
          min-height: 320px;
          border: 1px dashed #303036;
          border-radius: 14px;
          display: grid;
          place-items: center;
          text-align: center;
          color: #71717a;
          padding: 40px;
          background: rgba(17,17,19,.5);
        }

        .placeholder strong {
          display: block;
          color: #d4d4d8;
          font-size: 13px;
          margin-bottom: 7px;
        }

        .btn {
          border: 1px solid #34343a;
          background: #18181b;
          color: #e4e4e7;
          border-radius: 8px;
          padding: 8px 11px;
          font-size: 9px;
        }

        .btn:disabled {
          cursor: not-allowed;
          opacity: .45;
        }

        @media (max-width: 1050px) {
          .grid-4 {
            grid-template-columns: repeat(2,1fr);
          }

          .avatar-copy {
            display: none;
          }
        }

        @media (max-width: 780px) {
          .ops-root {
            display: block;
          }

          .ops-sidebar {
            display: none;
          }

          .ops-main {
            grid-column: auto;
          }

          .ops-content {
            padding: 24px 16px 48px;
          }

          .ops-topbar {
            padding: 0 16px;
          }

          .command-mini {
            width: calc(100% - 48px);
          }

          .system-pill,
          .top-divider {
            display: none;
          }

          .grid-4,
          .grid-2 {
            grid-template-columns: 1fr;
          }

          .row-4,
          .row-3 {
            grid-template-columns: 1fr;
            gap: 6px;
            padding: 14px 16px;
          }
        }
      `}</style>
    </div>
  );
}

export function Placeholder({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="placeholder">
      <div>
        <strong>{title}</strong>
        <div>{text}</div>
      </div>
    </div>
  );
}
