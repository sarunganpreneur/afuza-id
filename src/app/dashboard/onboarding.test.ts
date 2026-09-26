import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const newSite = readFileSync(new URL("./sites/new/page.tsx", import.meta.url), "utf8");
const brief = readFileSync(new URL("./sites/[siteId]/brief/brief-form.tsx", import.meta.url), "utf8");

describe("onboarding V1", () => {
  it("keeps the empty dashboard focused on the first website", () => {
    expect(dashboard).toContain("Belum ada website");
    expect(dashboard).toContain("Buat website pertama Anda dengan AI.");
    expect(dashboard).toContain("Mulai Buat Website");
  });

  it("orients a new user in three simple steps", () => {
    expect(newSite).toContain("Ceritakan bisnis Anda");
    expect(newSite).toContain("AI membuat website");
    expect(newSite).toContain("Review lalu publish");
  });

  it("redirects successful generation to the existing review progress page", () => {
    expect(brief).toContain("router.push(`/dashboard/sites/${siteId}/review`)");
    expect(brief).toContain("Buat Website dengan AI");
    expect(brief).toContain("generationPending");
  });

  it("does not expose backend lifecycle terms in onboarding copy", () => {
    expect(newSite).not.toMatch(/generation|schema|worker|rendering/i);
  });
});