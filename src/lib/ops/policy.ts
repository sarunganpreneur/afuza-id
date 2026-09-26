export const OPS_PERMISSIONS = [
  "OPS_ACCESS",
  "OPS_APPROVE",
  "OPS_CONTROL",
  "OPS_ADMIN",
] as const;

export type OpsPermission =
  (typeof OPS_PERMISSIONS)[number];

export function isOpsPermission(
  value: string,
): value is OpsPermission {
  return (
    OPS_PERMISSIONS as readonly string[]
  ).includes(value);
}

/*
 * Transitional break-glass owner fallback.
 *
 * IMPORTANT:
 * OPS_ALLOWED_EMAILS is no longer the primary authorization model.
 * RBAC is evaluated first.
 */
export function isOpsBreakGlassEnabled() {
  return (
    process.env.OPS_BREAK_GLASS_ENABLED ??
    "false"
  )
    .trim()
    .toLowerCase() === "true";
}

export function getOpsAllowedEmails() {
  return (
    process.env.OPS_ALLOWED_EMAILS ??
    ""
  )
    .split(",")
    .map((value) =>
      value.trim().toLowerCase(),
    )
    .filter(Boolean);
}

export function isOpsEmailAllowed(
  email:
    | string
    | null
    | undefined,
) {
  if (!email) return false;

  return getOpsAllowedEmails().includes(
    email.trim().toLowerCase(),
  );
}

export function getOpsAllowedOrigins() {
  const configured =
    process.env
      .OPS_ALLOWED_ORIGINS ??
    "https://ops.afuza.id";

  return configured
    .split(",")
    .map((value) =>
      value.trim().toLowerCase(),
    )
    .filter(Boolean);
}
