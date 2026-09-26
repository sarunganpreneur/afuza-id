const AFUZA_ORIGIN =
  "https://afuza.id";

const OPS_ORIGIN =
  "https://ops.afuza.id";

const MAX_RETURN_TO_LENGTH =
  2048;

/*
 * Accept only trusted Afuza destinations.
 *
 * V1 supports:
 *   - absolute https://ops.afuza.id/...
 *   - internal /ops or /ops/... paths
 *
 * Arbitrary external URLs, scheme-relative URLs,
 * javascript: URLs, credentials and malformed input
 * are rejected.
 */
export function normalizePostAuthReturnTo(
  value:
    | string
    | null
    | undefined,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const raw =
    value.trim();

  if (
    !raw ||
    raw.length >
      MAX_RETURN_TO_LENGTH ||
    /[\u0000-\u001F\u007F]/.test(
      raw,
    )
  ) {
    return null;
  }

  try {
    /*
     * Internal direct Ops path.
     */
    if (raw.startsWith("/")) {
      /*
       * Block //evil.example
       */
      if (
        raw.startsWith("//")
      ) {
        return null;
      }

      const url =
        new URL(
          raw,
          AFUZA_ORIGIN,
        );

      if (
        url.origin !==
        AFUZA_ORIGIN
      ) {
        return null;
      }

      if (
        url.pathname !==
          "/ops" &&
        !url.pathname.startsWith(
          "/ops/",
        )
      ) {
        return null;
      }

      return (
        url.pathname +
        url.search +
        url.hash
      );
    }

    /*
     * Canonical Ops hostname.
     */
    const url =
      new URL(raw);

    if (
      url.protocol !==
        "https:" ||
      url.origin !==
        OPS_ORIGIN ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return (
      OPS_ORIGIN +
      url.pathname +
      url.search +
      url.hash
    );
  } catch {
    return null;
  }
}
