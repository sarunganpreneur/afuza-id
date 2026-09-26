"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Member = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  account_status: string;
  role_code: string;
  assigned_at: string;
};

type Role = {
  code: string;
  name: string;
  permissions: string[];
};

type AccessEvent = {
  id: number;
  event_type: string;
  target_user_id: string;
  target_email: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  previous_role: string | null;
  new_role: string | null;
  reason: string | null;
  created_at: string;
};

type TeamResponse = {
  summary: {
    active_members: number;
    active_owners: number;
    roles: number;
    audit_events: number;
  };

  team: Member[];
  roles: Role[];
  events: AccessEvent[];
};

const ROLE_ORDER = [
  "OWNER",
  "APPROVER",
  "OPERATOR",
  "OBSERVER",
];

const PERMISSION_ORDER = [
  "OPS_ACCESS",
  "OPS_APPROVE",
  "OPS_CONTROL",
  "OPS_ADMIN",
];

function humanError(
  value: string,
) {
  const messages:
    Record<string, string> = {
      LAST_OWNER_PROTECTED:
        "OWNER terakhir tidak boleh direvoke atau diturunkan role-nya.",

      USER_NOT_FOUND:
        "User Afuza dengan email tersebut tidak ditemukan.",

      USER_DISABLED:
        "Account tersebut berstatus DISABLED.",

      INVALID_OPS_ROLE:
        "Role Ops tidak valid.",

      FORBIDDEN:
        "Akun ini tidak memiliki OPS_ADMIN.",
    };

  return (
    messages[value] ??
    value
  );
}

export default function AccessTeam() {
  const [
    data,
    setData,
  ] =
    useState<
      TeamResponse | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    role,
    setRole,
  ] =
    useState(
      "OBSERVER",
    );

  const [
    reason,
    setReason,
  ] =
    useState("");

  const [
    draftRoles,
    setDraftRoles,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});


  const load =
    useCallback(
      async () => {
        setError(null);

        const response =
          await fetch(
            "/api/internal/ops/access/team",
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

        setData(
          body,
        );

        setDraftRoles(
          Object.fromEntries(
            (
              body.team ??
              []
            ).map(
              (
                member:
                  Member,
              ) => [
                member.user_id,
                member.role_code,
              ],
            ),
          ),
        );
      },
      [],
    );


  useEffect(
    () => {
      load().catch(
        (err) =>
          setError(
            humanError(
              err instanceof
                Error
                ? err.message
                : "TEAM_DATA_ERROR",
            ),
          ),
      );
    },
    [load],
  );


  async function mutate(
    payload:
      Record<
        string,
        unknown
      >,
  ) {
    setBusy(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/internal/ops/access/team",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload,
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
          body?.error ??
          `HTTP_${response.status}`,
        );
      }

      setData(
        body,
      );

      setDraftRoles(
        Object.fromEntries(
          (
            body.team ??
            []
          ).map(
            (
              member:
                Member,
            ) => [
              member.user_id,
              member.role_code,
            ],
          ),
        ),
      );

      return body;
    } catch (err) {
      setError(
        humanError(
          err instanceof Error
            ? err.message
            : "TEAM_MUTATION_ERROR",
        ),
      );

      return null;
    } finally {
      setBusy(false);
    }
  }


  async function addMember(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (!normalizedEmail) {
      setError(
        "Email wajib diisi.",
      );
      return;
    }

    const result =
      await mutate({
        action:
          "ASSIGN_ROLE",

        email:
          normalizedEmail,

        role_code:
          role,

        reason:
          reason.trim(),
      });

    if (result) {
      setEmail("");
      setRole(
        "OBSERVER",
      );
      setReason("");
    }
  }


  async function changeRole(
    member:
      Member,
  ) {
    const nextRole =
      draftRoles[
        member.user_id
      ] ??
      member.role_code;

    if (
      nextRole ===
      member.role_code
    ) {
      return;
    }

    if (
      !window.confirm(
        `Ubah ${member.email ?? member.user_id} dari ${member.role_code} menjadi ${nextRole}?`,
      )
    ) {
      return;
    }

    const changeReason =
      window.prompt(
        "Alasan perubahan role (opsional):",
        "",
      );

    if (
      changeReason ===
      null
    ) {
      return;
    }

    await mutate({
      action:
        "ASSIGN_ROLE",

      email:
        member.email,

      role_code:
        nextRole,

      reason:
        changeReason.trim(),
    });
  }


  async function revoke(
    member:
      Member,
  ) {
    if (
      !window.confirm(
        `Cabut akses Ops untuk ${member.email ?? member.user_id}?`,
      )
    ) {
      return;
    }

    const revokeReason =
      window.prompt(
        "Alasan pencabutan akses (opsional):",
        "",
      );

    if (
      revokeReason ===
      null
    ) {
      return;
    }

    await mutate({
      action:
        "REVOKE",

      user_id:
        member.user_id,

      reason:
        revokeReason.trim(),
    });
  }


  const sortedRoles =
    useMemo(
      () =>
        [...(
          data?.roles ??
          []
        )].sort(
          (a, b) =>
            ROLE_ORDER.indexOf(
              a.code,
            ) -
            ROLE_ORDER.indexOf(
              b.code,
            ),
        ),
      [
        data?.roles,
      ],
    );


  if (
    error &&
    !data
  ) {
    return (
      <div className="card">
        <span className="badge danger">
          Access Data Error
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
        Loading access control...
      </div>
    );
  }


  return (
    <>
      {error && (
        <div
          className="card"
          style={{
            marginBottom:
              12,
          }}
        >
          <span className="badge danger">
            Operation Error
          </span>

          <div
            className="metric-sub"
            style={{
              marginTop:
                8,
            }}
          >
            {error}
          </div>
        </div>
      )}


      <div className="grid-4">
        <div className="card">
          <div className="metric-label">
            Active Members
          </div>

          <div className="metric">
            {
              data.summary
                .active_members
            }
          </div>

          <div className="metric-sub">
            Active Ops identities
          </div>
        </div>

        <div className="card">
          <div className="metric-label">
            Active Owners
          </div>

          <div className="metric">
            {
              data.summary
                .active_owners
            }
          </div>

          <div className="metric-sub">
            Last OWNER protected
          </div>
        </div>

        <div className="card">
          <div className="metric-label">
            System Roles
          </div>

          <div className="metric">
            {
              data.summary
                .roles
            }
          </div>

          <div className="metric-sub">
            Normalized RBAC
          </div>
        </div>

        <div className="card">
          <div className="metric-label">
            Access Events
          </div>

          <div className="metric">
            {
              data.summary
                .audit_events
            }
          </div>

          <div className="metric-sub">
            Immutable audit trail
          </div>
        </div>
      </div>


      <div className="section-title">
        <h2>
          Add Existing User
        </h2>

        <span>
          OPS_ADMIN only
        </span>
      </div>

      <form
        className="card"
        onSubmit={
          addMember
        }
      >
        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "minmax(220px,1.5fr) minmax(160px,.7fr) minmax(220px,1fr) auto",

            gap: 10,

            alignItems:
              "end",
          }}
        >
          <label
            style={{
              display:
                "grid",
              gap: 7,
            }}
          >
            <span className="metric-label">
              Existing Afuza email
            </span>

            <input
              value={email}
              onChange={
                (event) =>
                  setEmail(
                    event
                      .target
                      .value,
                  )
              }
              type="email"
              placeholder="user@domain.com"
              required
              style={{
                width:
                  "100%",
                height: 40,
                border:
                  "1px solid #303036",
                borderRadius:
                  8,
                background:
                  "#111114",
                color:
                  "#f4f4f5",
                padding:
                  "0 11px",
              }}
            />
          </label>

          <label
            style={{
              display:
                "grid",
              gap: 7,
            }}
          >
            <span className="metric-label">
              Role
            </span>

            <select
              value={role}
              onChange={
                (event) =>
                  setRole(
                    event
                      .target
                      .value,
                  )
              }
              style={{
                height: 40,
                border:
                  "1px solid #303036",
                borderRadius:
                  8,
                background:
                  "#111114",
                color:
                  "#f4f4f5",
                padding:
                  "0 10px",
              }}
            >
              {ROLE_ORDER.map(
                (
                  roleCode,
                ) => (
                  <option
                    key={
                      roleCode
                    }
                    value={
                      roleCode
                    }
                  >
                    {roleCode}
                  </option>
                ),
              )}
            </select>
          </label>

          <label
            style={{
              display:
                "grid",
              gap: 7,
            }}
          >
            <span className="metric-label">
              Reason
            </span>

            <input
              value={
                reason
              }
              onChange={
                (event) =>
                  setReason(
                    event
                      .target
                      .value,
                  )
              }
              maxLength={
                500
              }
              placeholder="Optional audit note"
              style={{
                width:
                  "100%",
                height: 40,
                border:
                  "1px solid #303036",
                borderRadius:
                  8,
                background:
                  "#111114",
                color:
                  "#f4f4f5",
                padding:
                  "0 11px",
              }}
            />
          </label>

          <button
            className="btn"
            disabled={
              busy
            }
            type="submit"
            style={{
              height: 40,
            }}
          >
            {busy
              ? "Saving..."
              : "Grant Access"}
          </button>
        </div>

        <div
          className="metric-sub"
          style={{
            marginTop:
              12,
          }}
        >
          Only existing Afuza users can be assigned. This interface never creates auth users or passwords.
        </div>
      </form>


      <div className="section-title">
        <h2>
          Active Members
        </h2>

        <span>
          one active role / user
        </span>
      </div>

      <div className="table-card">
        {data.team.length ===
        0 ? (
          <div
            style={{
              padding: 30,
              textAlign:
                "center",
            }}
          >
            No active Ops members.
          </div>
        ) : (
          data.team.map(
            (
              member,
            ) => {
              const selectedRole =
                draftRoles[
                  member.user_id
                ] ??
                member.role_code;

              const lastOwner =
                member.role_code ===
                  "OWNER" &&
                data.summary
                  .active_owners <=
                  1;

              return (
                <div
                  className="row"
                  key={
                    member.user_id
                  }
                  style={{
                    gridTemplateColumns:
                      "minmax(230px,1.5fr) .75fr .8fr minmax(140px,.8fr) auto",
                  }}
                >
                  <div>
                    <strong>
                      {
                        member.full_name ||
                        member.email ||
                        member.user_id
                      }
                    </strong>

                    <div className="metric-sub">
                      {
                        member.email ??
                        member.user_id
                      }
                    </div>
                  </div>

                  <span className="badge good">
                    {
                      member.account_status
                    }
                  </span>

                  <div>
                    <select
                      value={
                        selectedRole
                      }
                      disabled={
                        busy
                      }
                      onChange={
                        (
                          event,
                        ) =>
                          setDraftRoles(
                            (
                              current,
                            ) => ({
                              ...current,

                              [member.user_id]:
                                event
                                  .target
                                  .value,
                            }),
                          )
                      }
                      style={{
                        width:
                          "100%",
                        height:
                          34,
                        border:
                          "1px solid #303036",
                        borderRadius:
                          7,
                        background:
                          "#111114",
                        color:
                          "#f4f4f5",
                        padding:
                          "0 8px",
                      }}
                    >
                      {ROLE_ORDER.map(
                        (
                          roleCode,
                        ) => (
                          <option
                            key={
                              roleCode
                            }
                            value={
                              roleCode
                            }
                          >
                            {roleCode}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <span className="muted">
                    {new Date(
                      member.assigned_at,
                    ).toLocaleString()}
                  </span>

                  <div
                    style={{
                      display:
                        "flex",
                      gap: 6,
                      justifyContent:
                        "flex-end",
                    }}
                  >
                    <button
                      className="btn"
                      disabled={
                        busy ||
                        selectedRole ===
                          member.role_code ||
                        (
                          lastOwner &&
                          selectedRole !==
                            "OWNER"
                        )
                      }
                      onClick={
                        () =>
                          changeRole(
                            member,
                          )
                      }
                      type="button"
                    >
                      Update
                    </button>

                    <button
                      className="btn"
                      disabled={
                        busy ||
                        lastOwner
                      }
                      onClick={
                        () =>
                          revoke(
                            member,
                          )
                      }
                      type="button"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            },
          )
        )}
      </div>


      <div className="section-title">
        <h2>
          Role Matrix
        </h2>

        <span>
          approve ≠ control
        </span>
      </div>

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 11,
        }}
      >
        {sortedRoles.map(
          (
            roleItem,
          ) => (
            <div
              className="card"
              key={
                roleItem.code
              }
            >
              <div className="metric-label">
                {
                  roleItem.name
                }
              </div>

              <div
                style={{
                  marginTop: 7,
                  fontSize: 15,
                  fontWeight:
                    750,
                }}
              >
                {
                  roleItem.code
                }
              </div>

              <div
                style={{
                  display:
                    "grid",
                  gap: 7,
                  marginTop: 14,
                }}
              >
                {PERMISSION_ORDER.map(
                  (
                    permission,
                  ) => {
                    const allowed =
                      roleItem.permissions.includes(
                        permission,
                      );

                    return (
                      <div
                        key={
                          permission
                        }
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          gap: 8,
                          fontSize: 9,
                        }}
                      >
                        <span className="muted">
                          {permission}
                        </span>

                        <span
                          className={`badge ${
                            allowed
                              ? "good"
                              : ""
                          }`}
                        >
                          {allowed
                            ? "YES"
                            : "NO"}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          ),
        )}
      </div>


      <div className="section-title">
        <h2>
          Access Audit
        </h2>

        <span>
          immutable · newest first
        </span>
      </div>

      <div className="table-card">
        {data.events.length ===
        0 ? (
          <div
            style={{
              padding: 30,
              textAlign:
                "center",
            }}
          >
            <strong
              style={{
                display:
                  "block",
                fontSize: 12,
              }}
            >
              No access events yet
            </strong>

            <div
              className="metric-sub"
              style={{
                marginTop: 7,
              }}
            >
              Team Management V1 starts its immutable audit history from the first access change.
            </div>
          </div>
        ) : (
          data.events.map(
            (
              event,
            ) => (
              <div
                key={
                  event.id
                }
                className="row"
                style={{
                  gridTemplateColumns:
                    ".7fr minmax(210px,1.4fr) 1fr minmax(180px,1fr) .9fr",
                }}
              >
                <span
                  className={`badge ${
                    event.event_type ===
                    "REVOKED"
                      ? "danger"
                      : "good"
                  }`}
                >
                  {
                    event.event_type
                  }
                </span>

                <div>
                  <strong>
                    {
                      event.target_email ??
                      event.target_user_id
                    }
                  </strong>

                  <div className="metric-sub">
                    {
                      event.previous_role ??
                      "—"
                    }
                    {" → "}
                    {
                      event.new_role ??
                      "REVOKED"
                    }
                  </div>
                </div>

                <div>
                  <div className="metric-label">
                    Actor
                  </div>

                  <div className="metric-sub">
                    {
                      event.actor_email ??
                      event.actor_user_id ??
                      "SYSTEM"
                    }
                  </div>
                </div>

                <span className="muted">
                  {
                    event.reason ||
                    "No reason"
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
  );
}
