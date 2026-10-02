"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import styles from "./ExecutionsReal.module.css";

type ExecutionStatus =
  | "PREPARED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

type Control = {
  master_execution_enabled: boolean;
  emergency_stop: boolean;
  gate_open: boolean;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
  version: number;
};

type ApprovalSummary = {
  id: string;
  title: string;
  status: string;
  action_type: string;
  risk: string;
  execution_enabled: boolean;
  created_at: string;
  decided_at: string | null;
};

type Execution = {
  id: string;
  approval_id: string;
  idempotency_key: string;
  action_type: string;
  risk: string;
  status: ExecutionStatus;
  prepared_by: string | null;
  prepared_at: string;
  started_at: string | null;
  finished_at: string | null;
  executor_type: string | null;
  executor_reference:
    | Record<string, unknown>
    | null;
  lease_expires_at:
    | string
    | null;
  last_heartbeat_at:
    | string
    | null;
  state_version: number;
  result_summary:
    | Record<string, unknown>
    | null;
  failure_code: string | null;
  failure_message: string | null;
  updated_at: string;
  approval:
    | ApprovalSummary
    | null;
};

type ExecutionEvent = {
  execution_id: string | null;
  approval_id: string;
  idempotency_key: string | null;
  event_type: string;
  actor_user_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  metadata:
    | Record<string, unknown>
    | null;
  created_at: string;
};

type ExecutionsResponse = {
  total: number;
  pulse: Record<
    ExecutionStatus,
    number
  >;
  executions: Execution[];
};

type ControlAction =
  | "ARM_MASTER"
  | "OPEN_GATE"
  | "SAFE_LOCK"
  | "EMERGENCY_STOP";

type PermissionResponse = {
  permissions?: {
    OPS_ADMIN?: boolean;
  };
};

const EMPTY_PULSE:
  Record<
    ExecutionStatus,
    number
  > = {
    PREPARED: 0,
    EXECUTING: 0,
    COMPLETED: 0,
    FAILED: 0,
    CANCELLED: 0,
  };

function formatTime(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "id-ID",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function statusClass(
  status: string,
) {
  switch (status) {
    case "COMPLETED":
      return styles.good;

    case "FAILED":
      return styles.danger;

    case "CANCELLED":
      return styles.mutedBadge;

    case "EXECUTING":
      return styles.active;

    case "PREPARED":
      return styles.warn;

    case "BLOCKED":
      return styles.danger;

    default:
      return styles.mutedBadge;
  }
}

async function fetchJson<T>(
  url: string,
): Promise<T> {
  const response =
    await fetch(
      url,
      {
        cache:
          "no-store",
      },
    );

  const body =
    await response
      .json()
      .catch(
        () => null,
      );

  if (!response.ok) {
    throw new Error(
      body?.error ??
        `HTTP_${response.status}`,
    );
  }

  return body as T;
}

export default function ExecutionsReal() {
  const [
    control,
    setControl,
  ] =
    useState<
      Control | null
    >(null);

  const [
    executions,
    setExecutions,
  ] =
    useState<
      ExecutionsResponse | null
    >(null);

  const [
    events,
    setEvents,
  ] =
    useState<
      ExecutionEvent[] | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    canAdmin,
    setCanAdmin,
  ] =
    useState(false);

  const [
    controlBusy,
    setControlBusy,
  ] =
    useState(false);

  const [
    selectedControlAction,
    setSelectedControlAction,
  ] =
    useState<ControlAction | null>(
      null,
    );

  const [
    controlReason,
    setControlReason,
  ] =
    useState("");

  const [
    controlConfirmation,
    setControlConfirmation,
  ] =
    useState("");

  const [
    controlFeedback,
    setControlFeedback,
  ] =
    useState<string | null>(
      null,
    );

  const [
    controlMutationError,
    setControlMutationError,
  ] =
    useState<string | null>(
      null,
    );

  const load =
    useCallback(
      async () => {
        setRefreshing(true);

        try {
          const [
            controlBody,
            executionsBody,
            eventsBody,
            permissionsBody,
          ] =
            await Promise.all([
              fetchJson<{
                control: Control;
              }>(
                "/api/internal/ops/execution-control",
              ),

              fetchJson<ExecutionsResponse>(
                "/api/internal/ops/executions",
              ),

              fetchJson<{
                count: number;
                events: ExecutionEvent[];
              }>(
                "/api/internal/ops/execution-events?limit=50",
              ),

              fetchJson<PermissionResponse>(
                "/api/internal/ops/access/permissions",
              ),
            ]);

          setControl(
            controlBody.control,
          );

          setExecutions(
            executionsBody,
          );

          setEvents(
            eventsBody.events ??
              [],
          );

          setCanAdmin(
            permissionsBody
              .permissions
              ?.OPS_ADMIN ===
              true,
          );

          setError(null);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "EXECUTION_OBSERVABILITY_ERROR",
          );
        } finally {
          setRefreshing(
            false,
          );
        }
      },
      [],
    );

  function beginControlAction(
    action: ControlAction,
  ) {
    setSelectedControlAction(
      action,
    );

    setControlReason("");
    setControlConfirmation("");
    setControlFeedback(null);
    setControlMutationError(
      null,
    );
  }


  async function runControlAction(
    action: ControlAction,

    options?: {
      reason?: string;
      confirmation?: string;
    },
  ) {
    if (
      !control ||
      !canAdmin ||
      controlBusy
    ) {
      return;
    }


    setControlBusy(true);
    setControlFeedback(null);
    setControlMutationError(
      null,
    );


    try {
      const requestId =
        [
          "control",
          action.toLowerCase(),
          Date.now(),
          Math.random()
            .toString(36)
            .slice(2),
        ].join("-");


      const response =
        await fetch(
          "/api/internal/ops/execution-control",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Idempotency-Key":
                requestId,
            },

            body:
              JSON.stringify(
                {
                  mode:
                    "CONTROL_PLANE_ONLY",

                  action,

                  expected_version:
                    control.version,

                  reason:
                    options?.reason ??
                    "",

                  confirmation:
                    options
                      ?.confirmation ??
                    "",
                },
              ),
          },
        );


      const body =
        await response
          .json()
          .catch(
            () => null,
          );


      if (!response.ok) {
        throw new Error(
          body?.detail ??
          body?.error ??
          `HTTP_${response.status}`,
        );
      }


      setSelectedControlAction(
        null,
      );

      setControlReason("");
      setControlConfirmation("");

      setControlFeedback(
        `${action} applied · control v${body?.control?.version ?? "updated"}`,
      );


      await load();
    } catch (err) {
      setControlMutationError(
        err instanceof Error
          ? err.message
          : "CONTROL_UPDATE_FAILED",
      );

      await load();
    } finally {
      setControlBusy(false);
    }
  }


  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void load();
    }, 0);

    const timer =
      window.setInterval(
        () => {
          void load();
        },
        15000,
      );

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(
        timer,
      );
    };
  }, [load]);

  if (
    error &&
    !control &&
    !executions
  ) {
    return (
      <div
        className={
          styles.errorCard
        }
      >
        <strong>
          Execution data unavailable
        </strong>

        <span>
          {error}
        </span>
      </div>
    );
  }

  const pulse =
    executions?.pulse ??
    EMPTY_PULSE;

  const requiredControlPhrase =
    selectedControlAction ===
      "ARM_MASTER"
      ? "ARM MASTER"
      : selectedControlAction ===
          "OPEN_GATE"
        ? "OPEN EXECUTION GATE"
        : "";

  const enablingControlReady =
    Boolean(
      controlReason.trim(),
    ) &&
    controlConfirmation
      .trim()
      .toUpperCase() ===
      requiredControlPhrase;


  return (
    <div
      className={
        styles.stack
      }
    >
      <div
        className={
          styles.toolbar
        }
      >
        <div>
          <span
            className={
              styles.readOnly
            }
          >
            {canAdmin
              ? "ADMIN CONTROL"
              : "READ ONLY"}
          </span>

          <span
            className={
              styles.toolbarText
            }
          >
            Auto refresh every
            15 seconds
          </span>
        </div>

        <button
          type="button"
          className={
            styles.refreshButton
          }
          onClick={
            () => void load()
          }
          disabled={
            refreshing
          }
        >
          {refreshing
            ? "Refreshing..."
            : "Refresh"}
        </button>
      </div>

      <section>
        <div
          className={
            styles.sectionHead
          }
        >
          <div>
            <h2>
              Execution Control
            </h2>

            <p>
              Current safety state
              from the execution
              control singleton.
            </p>
          </div>

          <span
            className={`${styles.badge} ${
              control?.gate_open
                ? styles.danger
                : styles.good
            }`}
          >
            {control
              ? control.gate_open
                ? "GATE OPEN"
                : "GATE CLOSED"
              : "LOADING"}
          </span>
        </div>

        <div
          className={
            styles.controlGrid
          }
        >
          <div
            className={
              styles.controlCard
            }
          >
            <span>
              Master Execution
            </span>

            <strong>
              {control
                ? control.master_execution_enabled
                  ? "ON"
                  : "OFF"
                : "—"}
            </strong>

            <small>
              Global execution
              permission
            </small>
          </div>

          <div
            className={
              styles.controlCard
            }
          >
            <span>
              Emergency Stop
            </span>

            <strong>
              {control
                ? control.emergency_stop
                  ? "ACTIVE"
                  : "INACTIVE"
                : "—"}
            </strong>

            <small>
              Safety stop state
            </small>
          </div>

          <div
            className={
              styles.controlCard
            }
          >
            <span>
              Gate
            </span>

            <strong>
              {control
                ? control.gate_open
                  ? "OPEN"
                  : "CLOSED"
                : "—"}
            </strong>

            <small>
              Start / renewal
              gate
            </small>
          </div>

          <div
            className={
              styles.controlCard
            }
          >
            <span>
              Control Version
            </span>

            <strong>
              {control?.version ??
                "—"}
            </strong>

            <small>
              Last change:
              {" "}
              {formatTime(
                control?.updated_at,
              )}
            </small>
          </div>
        </div>

        {control?.reason && (
          <div
            className={
              styles.reason
            }
          >
            <span>
              Current control
              reason
            </span>

            <strong>
              {control.reason}
            </strong>
          </div>
        )}
        {canAdmin &&
          control && (
          <div
            className={
              styles.adminControl
            }
          >
            <div
              className={
                styles.adminControlTop
              }
            >
              <div>
                <span
                  className={
                    styles.adminEyebrow
                  }
                >
                  OPS_ADMIN CONTROL SURFACE
                </span>

                <strong>
                  Two-stage execution gate
                </strong>

                <p>
                  Arming Master does not
                  open the gate. Opening
                  the gate requires a
                  second explicit
                  confirmation.
                </p>
              </div>

              <div
                className={
                  styles.controlActions
                }
              >
                {!control
                  .master_execution_enabled &&
                  control
                    .emergency_stop && (
                  <button
                    type="button"
                    className={
                      styles.armButton
                    }
                    disabled={
                      controlBusy
                    }
                    onClick={() =>
                      beginControlAction(
                        "ARM_MASTER",
                      )
                    }
                  >
                    Arm Master
                  </button>
                )}

                {control
                  .master_execution_enabled &&
                  control
                    .emergency_stop && (
                  <>
                    <button
                      type="button"
                      className={
                        styles.openGateButton
                      }
                      disabled={
                        controlBusy
                      }
                      onClick={() =>
                        beginControlAction(
                          "OPEN_GATE",
                        )
                      }
                    >
                      Open Gate
                    </button>

                    <button
                      type="button"
                      className={
                        styles.safeButton
                      }
                      disabled={
                        controlBusy
                      }
                      onClick={() =>
                        void runControlAction(
                          "SAFE_LOCK",
                          {
                            reason:
                              "Safe lock engaged from Afuza Ops V1C-D",
                          },
                        )
                      }
                    >
                      Safe Lock
                    </button>
                  </>
                )}

                {control.gate_open && (
                  <button
                    type="button"
                    className={
                      styles.emergencyButton
                    }
                    disabled={
                      controlBusy
                    }
                    onClick={() =>
                      void runControlAction(
                        "EMERGENCY_STOP",
                        {
                          reason:
                            "Emergency stop activated from Afuza Ops V1C-D",
                        },
                      )
                    }
                  >
                    EMERGENCY STOP
                  </button>
                )}

                {!control
                  .emergency_stop &&
                  !control
                    .gate_open && (
                  <button
                    type="button"
                    className={
                      styles.safeButton
                    }
                    disabled={
                      controlBusy
                    }
                    onClick={() =>
                      void runControlAction(
                        "SAFE_LOCK",
                        {
                          reason:
                            "Safe lock engaged from inconsistent control state",
                        },
                      )
                    }
                  >
                    Force Safe Lock
                  </button>
                )}
              </div>
            </div>

            {(selectedControlAction ===
              "ARM_MASTER" ||
              selectedControlAction ===
                "OPEN_GATE") && (
              <div
                className={
                  styles.confirmPanel
                }
              >
                <div
                  className={
                    styles.confirmWarning
                  }
                >
                  <strong>
                    {selectedControlAction ===
                    "ARM_MASTER"
                      ? "Arm Master Execution"
                      : "Open Execution Gate"}
                  </strong>

                  <p>
                    {selectedControlAction ===
                    "ARM_MASTER"
                      ? "Master will become ON, but Emergency Stop stays ACTIVE and the gate remains CLOSED."
                      : "This removes Emergency Stop while Master is ON. The gate will become OPEN. No external executor is connected in V1C."}
                  </p>
                </div>

                <label
                  className={
                    styles.controlField
                  }
                >
                  <span>
                    Audit reason
                  </span>

                  <textarea
                    value={
                      controlReason
                    }
                    maxLength={500}
                    disabled={
                      controlBusy
                    }
                    onChange={
                      (event) =>
                        setControlReason(
                          event.target.value,
                        )
                    }
                    placeholder="Explain why this control change is required..."
                  />
                </label>

                <label
                  className={
                    styles.controlField
                  }
                >
                  <span>
                    Type exactly:
                    {" "}
                    <code>
                      {requiredControlPhrase}
                    </code>
                  </span>

                  <input
                    value={
                      controlConfirmation
                    }
                    disabled={
                      controlBusy
                    }
                    onChange={
                      (event) =>
                        setControlConfirmation(
                          event.target.value,
                        )
                    }
                    autoComplete="off"
                  />
                </label>

                <div
                  className={
                    styles.confirmActions
                  }
                >
                  <button
                    type="button"
                    className={
                      selectedControlAction ===
                        "OPEN_GATE"
                        ? styles.openGateButton
                        : styles.armButton
                    }
                    disabled={
                      controlBusy ||
                      !enablingControlReady
                    }
                    onClick={() =>
                      void runControlAction(
                        selectedControlAction,
                        {
                          reason:
                            controlReason,

                          confirmation:
                            controlConfirmation,
                        },
                      )
                    }
                  >
                    {controlBusy
                      ? "Applying..."
                      : selectedControlAction ===
                          "OPEN_GATE"
                        ? "Confirm Open Gate"
                        : "Confirm Arm Master"}
                  </button>

                  <button
                    type="button"
                    className={
                      styles.cancelButton
                    }
                    disabled={
                      controlBusy
                    }
                    onClick={() => {
                      setSelectedControlAction(
                        null,
                      );

                      setControlReason(
                        "",
                      );

                      setControlConfirmation(
                        "",
                      );
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {controlFeedback && (
              <div
                className={
                  styles.controlSuccess
                }
              >
                {controlFeedback}
              </div>
            )}

            {controlMutationError && (
              <div
                className={
                  styles.controlFailure
                }
              >
                {controlMutationError}
              </div>
            )}

            <div
              className={
                styles.adminFootnote
              }
            >
              Control-plane state only ·
              no n8n · no OpenAI · no
              external executor handoff
            </div>
          </div>
        )}

      </section>

      <section>
        <div
          className={
            styles.sectionHead
          }
        >
          <div>
            <h2>
              Execution Pulse
            </h2>

            <p>
              Exact counts from
              the execution
              ledger.
            </p>
          </div>

          <span
            className={
              styles.totalLabel
            }
          >
            {executions?.total ??
              0}
            {" "}
            total
          </span>
        </div>

        <div
          className={
            styles.pulseGrid
          }
        >
          {(
            [
              "PREPARED",
              "EXECUTING",
              "COMPLETED",
              "FAILED",
              "CANCELLED",
            ] as ExecutionStatus[]
          ).map(
            (status) => (
              <div
                className={
                  styles.pulseCard
                }
                key={status}
              >
                <span>
                  {status}
                </span>

                <strong>
                  {pulse[status] ??
                    0}
                </strong>
              </div>
            ),
          )}
        </div>
      </section>

      <section>
        <div
          className={
            styles.sectionHead
          }
        >
          <div>
            <h2>
              Recent Executions
            </h2>

            <p>
              Authorization and
              lifecycle ledger.
              Lease tokens are
              intentionally not
              exposed.
            </p>
          </div>
        </div>

        <div
          className={
            styles.table
          }
        >
          <div
            className={
              styles.tableHeader
            }
          >
            <span>
              Execution
            </span>
            <span>
              State
            </span>
            <span>
              Executor
            </span>
            <span>
              Timeline
            </span>
          </div>

          {executions === null ? (
            <div
              className={
                styles.empty
              }
            >
              Loading executions...
            </div>
          ) : executions
              .executions
              .length === 0 ? (
            <div
              className={
                styles.empty
              }
            >
              No executions found.
            </div>
          ) : (
            executions.executions.map(
              (
                execution,
              ) => (
                <div
                  className={
                    styles.tableRow
                  }
                  key={
                    execution.id
                  }
                >
                  <div>
                    <strong
                      className={
                        styles.primary
                      }
                    >
                      {execution
                        .approval
                        ?.title ??
                        execution.action_type}
                    </strong>

                    <div
                      className={
                        styles.secondary
                      }
                    >
                      {
                        execution.action_type
                      }
                      {" · "}
                      {
                        execution.risk
                      }
                    </div>

                    <code
                      className={
                        styles.code
                      }
                    >
                      {execution.id}
                    </code>
                  </div>

                  <div>
                    <span
                      className={`${styles.badge} ${statusClass(
                        execution.status,
                      )}`}
                    >
                      {
                        execution.status
                      }
                    </span>

                    <div
                      className={
                        styles.secondary
                      }
                    >
                      state v
                      {
                        execution.state_version
                      }
                    </div>
                  </div>

                  <div>
                    <strong
                      className={
                        styles.primary
                      }
                    >
                      {execution.executor_type ??
                        "Not claimed"}
                    </strong>

                    <div
                      className={
                        styles.secondary
                      }
                    >
                      Lease:
                      {" "}
                      {execution.lease_expires_at
                        ? formatTime(
                            execution.lease_expires_at,
                          )
                        : "—"}
                    </div>
                  </div>

                  <div
                    className={
                      styles.timeline
                    }
                  >
                    <span>
                      Prepared
                      {" "}
                      {formatTime(
                        execution.prepared_at,
                      )}
                    </span>

                    <span>
                      Started
                      {" "}
                      {formatTime(
                        execution.started_at,
                      )}
                    </span>

                    <span>
                      Finished
                      {" "}
                      {formatTime(
                        execution.finished_at,
                      )}
                    </span>
                  </div>
                </div>
              ),
            )
          )}
        </div>
      </section>

      <section>
        <div
          className={
            styles.sectionHead
          }
        >
          <div>
            <h2>
              Execution Timeline
            </h2>

            <p>
              Latest lifecycle
              and safety events.
            </p>
          </div>
        </div>

        <div
          className={
            styles.timelineList
          }
        >
          {events === null ? (
            <div
              className={
                styles.empty
              }
            >
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div
              className={
                styles.empty
              }
            >
              No execution events
              found.
            </div>
          ) : (
            events.map(
              (
                event,
                index,
              ) => {
                const blockedReason =
                  typeof event
                    .metadata
                    ?.blocked_reason ===
                  "string"
                    ? event.metadata
                        .blocked_reason
                    : null;

                return (
                  <div
                    className={
                      styles.eventRow
                    }
                    key={`${event.idempotency_key ?? "event"}-${event.created_at}-${index}`}
                  >
                    <div
                      className={
                        styles.eventMarker
                      }
                    />

                    <div
                      className={
                        styles.eventBody
                      }
                    >
                      <div
                        className={
                          styles.eventTop
                        }
                      >
                        <span
                          className={`${styles.badge} ${statusClass(
                            event.event_type,
                          )}`}
                        >
                          {
                            event.event_type
                          }
                        </span>

                        <span
                          className={
                            styles.eventTime
                          }
                        >
                          {formatTime(
                            event.created_at,
                          )}
                        </span>
                      </div>

                      <strong>
                        {event.previous_status
                          ? `${event.previous_status} → ${event.new_status ?? "—"}`
                          : event.new_status ??
                            event.event_type}
                      </strong>

                      <p>
                        {blockedReason ??
                          event.reason ??
                          "Lifecycle event"}
                      </p>
                    </div>
                  </div>
                );
              },
            )
          )}
        </div>
      </section>

      {error && (
        <div
          className={
            styles.softError
          }
        >
          Latest refresh failed:
          {" "}
          {error}
        </div>
      )}
    </div>
  );
}
