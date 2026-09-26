import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("WF-01 side-effect contract", () => {
  it("does not contain outbound transport or execution calls", () => {
    expect(source).not.toContain("WAHA");
    expect(source).not.toContain("ops_start_execution");
    expect(source).not.toContain("publish_site_version");
    expect(source).not.toContain("fetch(");
  });
});
