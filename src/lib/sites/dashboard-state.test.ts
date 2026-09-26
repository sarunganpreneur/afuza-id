import { describe, expect, it } from "vitest";
import { dashboardGenerationLabel, dashboardStateLabel, getDashboardSiteState, hasActiveDashboardGeneration } from "./dashboard-state";

const base = { siteStatus: "DRAFT", currentContentVersion: 0, publishedVersion: null, latestValidVersion: null };

describe("dashboard site state", () => {
  it.each([
    ["LIVE", 1, "ONLINE"],
    ["DRAFT", 1, "READY_TO_REVIEW"],
    ["DRAFT", 1, "GENERATING"],
    ["DRAFT", 1, "FAILED"],
    ["DRAFT", null, "DRAFT"],
  ])("maps site state safely", (siteStatus, job, expected) => {
    const latestJobStatus = job === null ? null : expected === "READY_TO_REVIEW" ? "RENDERING" : expected === "GENERATING" ? "GENERATING_IMAGES" : expected === "FAILED" ? "ERROR" : null;
    const state = getDashboardSiteState({
      ...base,
      siteStatus,
      publishedVersion: expected === "ONLINE" ? 1 : null,
      currentContentVersion: expected === "DRAFT" ? 0 : 1,
      latestJobStatus,
      latestValidVersion: expected === "READY_TO_REVIEW" ? { versionNumber: 1, schemaVersion: "site_content_v1" } : null,
    });
    expect(state).toBe(expected);
  });

  it("requires a matching valid version for review readiness", () => {
    expect(getDashboardSiteState({ ...base, currentContentVersion: 1, latestJobStatus: "RENDERING", latestValidVersion: null })).toBe("DRAFT");
  });

  it.each([["QUEUED", "Menunggu proses..."], ["ANALYZING", "Menganalisis bisnis..."], ["GENERATING_CONTENT", "Menyusun konten website..."], ["GENERATING_IMAGES", "Membuat gambar website"]])("maps %s to user text", (status, label) => expect(dashboardGenerationLabel(status)).toContain(label));

  it("does not expose raw status in semantic labels and polls only active jobs", () => {
    expect(dashboardStateLabel("FAILED", "ERROR")).toBe("Pembuatan website belum berhasil");
    expect(dashboardStateLabel("DRAFT", null)).toBe("Website belum dibuat");
    expect(hasActiveDashboardGeneration(["RENDERING", "ERROR"])).toBe(false);
    expect(hasActiveDashboardGeneration(["GENERATING_IMAGES", "ERROR"])).toBe(true);
  });
});