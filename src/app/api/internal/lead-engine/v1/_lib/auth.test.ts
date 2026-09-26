import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  authenticateLeadEngineRequest,
  LEAD_ENGINE_AUTH_RESULT,
} from "./auth";

const original = process.env.LEAD_ENGINE_INTERNAL_TOKEN;

afterEach(() => {
  if (original === undefined) {
    delete process.env.LEAD_ENGINE_INTERNAL_TOKEN;
  } else {
    process.env.LEAD_ENGINE_INTERNAL_TOKEN = original;
  }
});

describe("Lead Engine internal auth", () => {
  it("fails closed when the server token is missing", () => {
    delete process.env.LEAD_ENGINE_INTERNAL_TOKEN;
    const request = new Request("http://localhost/internal");
    expect(authenticateLeadEngineRequest(request)).toBe(
      LEAD_ENGINE_AUTH_RESULT.MISCONFIGURED,
    );
  });

  it("rejects missing or invalid bearer tokens", () => {
    process.env.LEAD_ENGINE_INTERNAL_TOKEN = "expected-secret";

    expect(
      authenticateLeadEngineRequest(new Request("http://localhost/internal")),
    ).toBe(LEAD_ENGINE_AUTH_RESULT.UNAUTHORIZED);

    expect(
      authenticateLeadEngineRequest(
        new Request("http://localhost/internal", {
          headers: { authorization: "Bearer wrong-secret" },
        }),
      ),
    ).toBe(LEAD_ENGINE_AUTH_RESULT.UNAUTHORIZED);
  });

  it("accepts the configured bearer token", () => {
    process.env.LEAD_ENGINE_INTERNAL_TOKEN = "expected-secret";

    expect(
      authenticateLeadEngineRequest(
        new Request("http://localhost/internal", {
          headers: { authorization: "Bearer expected-secret" },
        }),
      ),
    ).toBe(LEAD_ENGINE_AUTH_RESULT.AUTHORIZED);
  });
});
