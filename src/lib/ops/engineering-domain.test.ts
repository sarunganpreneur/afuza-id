import {
  describe,
  expect,
  it,
} from "vitest";

import {
  EngineeringProjectCreateSchema,
  EngineeringTaskCreateSchema,
  stableEngineeringHash,
} from "./engineering-domain";

describe("EA-03B1 engineering domain contract", () => {
  it("accepts a confined AFUZA repository path", () => {
    const parsed =
      EngineeringProjectCreateSchema.parse({
        project_key: "afuza-id",
        name: "Afuza ID",
        repo_path:
          "/home/afuzaid/apps/afuza-id-staging",
      });

    expect(parsed.automation_enabled).toBe(true);
    expect(parsed.risk_profile).toBe("MEDIUM");
  });

  it("rejects path traversal outside the engineering boundary", () => {
    const result =
      EngineeringProjectCreateSchema.safeParse({
        project_key: "afuza-id",
        name: "Afuza ID",
        repo_path:
          "/home/afuzaid/apps/../etc",
      });

    expect(result.success).toBe(false);
  });

  it("requires explicit engineering acceptance criteria", () => {
    const result =
      EngineeringTaskCreateSchema.safeParse({
        project_id:
          "11111111-1111-4111-8111-111111111111",
        external_key:
          "eng:test:0001",
        title: "Synthetic task",
        objective: "Verify task contract.",
        task_type: "TESTING",
        risk: "LOW",
        acceptance_criteria: [],
      });

    expect(result.success).toBe(false);
  });

  it("produces a deterministic canonical request hash", () => {
    const first = stableEngineeringHash({
      b: 2,
      a: {
        y: 2,
        x: 1,
      },
    });

    const second = stableEngineeringHash({
      a: {
        x: 1,
        y: 2,
      },
      b: 2,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
