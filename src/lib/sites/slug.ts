const RESERVED_SLUGS = new Set([
  "www",
  "admin",
  "dashboard",
  "api",
  "auth",
  "login",
  "register",
  "signup",
  "app",
]);

export function createBaseSlug(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const base = ascii.slice(0, 63).replace(/-+$/g, "") || "site";
  if (!RESERVED_SLUGS.has(base)) return base;

  return `site-${base}`.slice(0, 63).replace(/-+$/g, "");
}
