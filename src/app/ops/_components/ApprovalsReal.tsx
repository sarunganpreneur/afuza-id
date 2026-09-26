"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Risk =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

type Approval = {
  id: string;
  action_type: string;
  title: string;
  requester: string;
  requester_type: string;
  requester_id: string | null;
  risk: Risk;
  status: ApprovalStatus;
  payload_summary:
    Record<string, unknown>;
  execution_reference:
    Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  execution_enabled: boolean;
};

type ApprovalEvent = {
  id: string;
  approval_id: string;
  event_type:
    | "CREATED"
    | "APPROVED"
    | "REJECTED"
    | "EXPIRED";
  actor_type: string;
  actor_id: string | null;
  actor_user_id: string | null;
  previous_status:
    | ApprovalStatus
    | null;
  new_status: ApprovalStatus;
  reason: string | null;
  metadata:
    Record<string, unknown>;
  created_at: string;
};

type Policy = {
  id: string;
  action_type: string;
  title: string;
  description: string;
  default_risk: Risk;
  requires_human_approval: boolean;
  execution_enabled: boolean;
};

type ResponseData = {
  summary: {
    total: number;
    pending: number;
    high_risk_pending: number;
    approved: number;
    rejected: number;
    expired: number;
  };
  approvals: Approval[];
  events: ApprovalEvent[];
  policies: Policy[];
  control: {
    persistence_enabled: boolean;
    decisions_enabled: boolean;
    execution_enabled: boolean;
    mode: string;
    note: string;
  };
};

function riskClass(
  risk: Risk,
) {
  if (
    risk === "CRITICAL" ||
    risk === "HIGH"
  ) {
    return "danger";
  }

  if (risk === "MEDIUM") {
    return "warn";
  }

  return "good";
}

function statusClass(
  status: ApprovalStatus,
) {
  if (status === "APPROVED") {
    return "good";
  }

  if (
    status === "REJECTED" ||
    status === "EXPIRED"
  ) {
    return "danger";
  }

  return "warn";
}

function readableJson(
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return "—";
  }

  if (
    Object.keys(
      value as object,
    ).length === 0
  ) {
    return "—";
  }

  return JSON.stringify(
    value,
    null,
    2,
  );
}

export default function ApprovalsReal() {
  const [data, setData] =
    useState<ResponseData | null>(
      null,
    );

  const [error, setError] =
    useState<string | null>(null);

  const [
    busyApproval,
    setBusyApproval,
  ] = useState<string | null>(
    null,
  );

  const [
    selectedApproval,
    setSelectedApproval,
  ] = useState<
    string | null
  >(null);

  const load = useCallback(
    async () => {
      setError(null);

      const response =
        await fetch(
          "/api/internal/ops/approvals",
          {
            cache: "no-store",
          },
        );

      if (!response.ok) {
        const body =
          await response
            .json()
            .catch(
              () => null,
            );

        throw new Error(
          body?.error ??
            `HTTP_${response.status}`,
        );
      }

      const body =
        await response.json();

      setData(body);
    },
    [],
  );

  useEffect(() => {
    load().catch(
      (err) =>
        setError(
          err instanceof Error
            ? err.message
            : "APPROVAL_DATA_ERROR",
        ),
    );
  }, [load]);

  const selected =
    useMemo(
      () =>
        data?.approvals.find(
          (approval) =>
            approval.id ===
            selectedApproval,
        ) ?? null,
      [
        data,
        selectedApproval,
      ],
    );

  const selectedEvents =
    useMemo(
      () =>
        data?.events.filter(
          (event) =>
            event.approval_id ===
            selectedApproval,
        ) ?? [],
      [
        data,
        selectedApproval,
      ],
    );

  async function decide(
    approval: Approval,
    decision:
      | "APPROVED"
      | "REJECTED",
  ) {
    let reason = "";

    if (
      decision === "REJECTED"
    ) {
      const answer =
        window.prompt(
          "Alasan penolakan:",
        );

      if (answer === null) {
        return;
      }

      reason =
        answer.trim();

      if (!reason) {
        window.alert(
          "Alasan penolakan wajib diisi.",
        );

        return;
      }
    } else {
      const answer =
        window.prompt(
          "Catatan approval (opsional):",
          "",
        );

      if (answer === null) {
        return;
      }

      reason =
        answer.trim();
    }

    const confirmation =
      window.confirm(
        decision ===
          "APPROVED"
          ? "Approve request ini?\n\nApproval hanya mengubah authorization state dan TIDAK menjalankan aksi eksternal."
          : "Reject request ini?",
      );

    if (!confirmation) {
      return;
    }

    setBusyApproval(
      approval.id,
    );

    setError(null);

    try {
      const response =
        await fetch(
          `/api/internal/ops/approvals/${approval.id}/decision`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              {
                decision,
                reason,
              },
            ),
          },
        );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            `HTTP_${response.status}`,
        );
      }

      await load();

      setSelectedApproval(
        approval.id,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "APPROVAL_DECISION_ERROR",
      );
    } finally {
      setBusyApproval(null);
    }
  }

  if (error && !data) {
    return (
      <div className="card">
        <span className="badge danger">
          Approval Data Error
        </span>

        <div className="metric-sub">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        Loading persisted approvals...
      </div>
    );
  }

  return (
    <>
      {error && (
        <div
          className="card"
          style={{
            marginBottom: 12,
          }}
        >
          <span className="badge danger">
            Operation Error
          </span>

          <div className="metric-sub">
            {error}
          </div>
        </div>
      )}

      <div className="grid-4">
        <div className="card">
          <div className="metric-label">
            Pending
          </div>

          <div className="metric">
            {data.summary.pending}
          </div>

          <div className="metric-sub">
            Awaiting owner decision
          </div>
        </div>

        <div className="card">
          <div className="metric-label">
            High Risk
          </div>

          <div className="metric">
            {
              data.summary
                .high_risk_pending
            }
          </div>

          <div className="metric-sub">
            High / critical pending
          </div>
        </div>

        <div className="card">
          <div className="metric-label">
            Approved
          </div>

          <div className="metric">
            {data.summary.approved}
          </div>

          <div className="metric-sub">
            Authorized, not executed
          </div>
        </div>

        <div className="card">
          <div className="metric-label">
            Rejected / Expired
          </div>

          <div className="metric">
            {data.summary.rejected +
              data.summary.expired}
          </div>

          <div className="metric-sub">
            Blocked authorization
          </div>
        </div>
      </div>

      <div className="section-title">
        <h2>Approval Inbox</h2>

        <span>
          persisted · live
        </span>
      </div>

      <div className="table-card">
        {data.approvals.length ===
        0 ? (
          <div
            style={{
              padding: 34,
              textAlign:
                "center",
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius:
                  "50%",
                border:
                  "1px solid rgba(74,222,128,.2)",
                background:
                  "rgba(74,222,128,.04)",
                display:
                  "grid",
                placeItems:
                  "center",
                margin:
                  "0 auto 12px",
                color:
                  "#86efac",
              }}
            >
              ✓
            </div>

            <strong
              style={{
                display:
                  "block",
                fontSize: 12,
              }}
            >
              No approval requests
            </strong>

            <div
              className="metric-sub"
              style={{
                margin:
                  "7px auto 0",
                maxWidth:
                  440,
              }}
            >
              The persisted inbox is
              empty. Future agents and
              workflows can submit
              approval requests here.
            </div>
          </div>
        ) : (
          data.approvals.map(
            (approval) => (
              <div
                key={
                  approval.id
                }
                className="row"
                style={{
                  gridTemplateColumns:
                    "minmax(220px,1.5fr) .55fr .7fr .75fr auto",
                  cursor:
                    "pointer",
                }}
                onClick={() =>
                  setSelectedApproval(
                    approval.id,
                  )
                }
              >
                <div>
                  <strong>
                    {
                      approval.title
                    }
                  </strong>

                  <div className="metric-sub">
                    {
                      approval.action_type
                    }{" "}
                    ·{" "}
                    {
                      approval.requester
                    }
                  </div>
                </div>

                <span
                  className={`badge ${riskClass(
                    approval.risk,
                  )}`}
                >
                  {
                    approval.risk
                  }
                </span>

                <span
                  className={`badge ${statusClass(
                    approval.status,
                  )}`}
                >
                  {
                    approval.status
                  }
                </span>

                <span className="muted">
                  {new Date(
                    approval.created_at,
                  ).toLocaleString()}
                </span>

                <div
                  style={{
                    display:
                      "flex",
                    gap: 6,
                  }}
                  onClick={(event) =>
                    event.stopPropagation()
                  }
                >
                  {approval.status ===
                    "PENDING" && (
                    <>
                      <button
                        className="btn"
                        disabled={
                          busyApproval ===
                          approval.id
                        }
                        onClick={() =>
                          decide(
                            approval,
                            "APPROVED",
                          )
                        }
                      >
                        APPROVE
                      </button>

                      <button
                        className="btn"
                        disabled={
                          busyApproval ===
                          approval.id
                        }
                        onClick={() =>
                          decide(
                            approval,
                            "REJECTED",
                          )
                        }
                      >
                        REJECT
                      </button>
                    </>
                  )}
                </div>
              </div>
            ),
          )
        )}
      </div>

      {selected && (
        <>
          <div className="section-title">
            <h2>
              Approval Detail
            </h2>

            <span>
              {selected.id}
            </span>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="metric-label">
                Request
              </div>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 15,
                  fontWeight:
                    700,
                }}
              >
                {
                  selected.title
                }
              </div>

              <div
                style={{
                  marginTop: 14,
                  display:
                    "grid",
                  gap: 9,
                  fontSize: 10,
                }}
              >
                <div>
                  <span className="muted">
                    Action:
                  </span>{" "}
                  {
                    selected.action_type
                  }
                </div>

                <div>
                  <span className="muted">
                    Requester:
                  </span>{" "}
                  {
                    selected.requester
                  }
                </div>

                <div>
                  <span className="muted">
                    Requester ID:
                  </span>{" "}
                  {selected.requester_id ??
                    "—"}
                </div>

                <div>
                  <span className="muted">
                    Risk:
                  </span>{" "}
                  <span
                    className={`badge ${riskClass(
                      selected.risk,
                    )}`}
                  >
                    {
                      selected.risk
                    }
                  </span>
                </div>

                <div>
                  <span className="muted">
                    State:
                  </span>{" "}
                  <span
                    className={`badge ${statusClass(
                      selected.status,
                    )}`}
                  >
                    {
                      selected.status
                    }
                  </span>
                </div>

                <div>
                  <span className="muted">
                    Execution:
                  </span>{" "}
                  <span className="badge good">
                    LOCKED
                  </span>
                </div>

                {selected.decision_reason && (
                  <div>
                    <span className="muted">
                      Decision reason:
                    </span>{" "}
                    {
                      selected.decision_reason
                    }
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="metric-label">
                Payload Summary
              </div>

              <pre
                style={{
                  margin:
                    "12px 0 0",
                  whiteSpace:
                    "pre-wrap",
                  overflowWrap:
                    "anywhere",
                  fontSize: 9,
                  lineHeight:
                    1.6,
                  color:
                    "#a1a1aa",
                }}
              >
                {readableJson(
                  selected.payload_summary,
                )}
              </pre>

              <div
                className="metric-label"
                style={{
                  marginTop: 18,
                }}
              >
                Execution Reference
              </div>

              <pre
                style={{
                  margin:
                    "12px 0 0",
                  whiteSpace:
                    "pre-wrap",
                  overflowWrap:
                    "anywhere",
                  fontSize: 9,
                  lineHeight:
                    1.6,
                  color:
                    "#a1a1aa",
                }}
              >
                {readableJson(
                  selected.execution_reference,
                )}
              </pre>
            </div>
          </div>

          <div className="section-title">
            <h2>
              Audit Trail
            </h2>

            <span>
              {
                selectedEvents.length
              }{" "}
              events
            </span>
          </div>

          <div className="table-card">
            {selectedEvents.length ===
            0 ? (
              <div className="row">
                No audit events.
              </div>
            ) : (
              selectedEvents.map(
                (event) => (
                  <div
                    className="row row-4"
                    key={
                      event.id
                    }
                  >
                    <div>
                      <strong>
                        {
                          event.event_type
                        }
                      </strong>

                      <div className="metric-sub">
                        {
                          event.actor_type
                        }
                        {event.actor_id
                          ? ` · ${event.actor_id}`
                          : ""}
                      </div>
                    </div>

                    <span className="muted">
                      {event.previous_status ??
                        "—"}
                    </span>

                    <span
                      className={`badge ${statusClass(
                        event.new_status,
                      )}`}
                    >
                      {
                        event.new_status
                      }
                    </span>

                    <span className="muted">
                      {new Date(
                        event.created_at,
                      ).toLocaleString()}
                    </span>
                  </div>
                ),
              )
            )}
          </div>
        </>
      )}

      <div className="section-title">
        <h2>
          Approval Policies
        </h2>

        <span>
          {data.policies.length}{" "}
          policies
        </span>
      </div>

      <div className="table-card">
        {data.policies.map(
          (policy) => (
            <div
              className="row row-4"
              key={policy.id}
            >
              <div>
                <strong>
                  {
                    policy.title
                  }
                </strong>

                <div className="metric-sub">
                  {
                    policy.description
                  }
                </div>
              </div>

              <span
                className={`badge ${riskClass(
                  policy.default_risk,
                )}`}
              >
                {
                  policy.default_risk
                }
              </span>

              <span className="muted">
                {
                  policy.action_type
                }
              </span>

              <span className="badge good">
                HUMAN REQUIRED
              </span>
            </div>
          ),
        )}
      </div>

      <div className="section-title">
        <h2>
          Safety Contract
        </h2>

        <span>
          enforced
        </span>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="metric-label">
            Persistence
          </div>

          <div
            style={{
              marginTop: 14,
            }}
          >
            <span className="badge good">
              ACTIVE
            </span>
          </div>

          <div className="metric-sub">
            Requests and decisions are
            persisted in PostgreSQL with
            an audit trail.
          </div>
        </div>

        <div className="card">
          <div className="metric-label">
            External Execution
          </div>

          <div
            style={{
              marginTop: 14,
            }}
          >
            <span className="badge good">
              LOCKED
            </span>
          </div>

          <div className="metric-sub">
            APPROVED means authorized
            only. No n8n, OpenAI,
            WhatsApp, publishing or
            deployment action is
            triggered.
          </div>
        </div>
      </div>
    </>
  );
}
