import { describe, expect, it } from "vitest";
import { generationStatusLabel, generationStageState, isGenerationReviewReady, shouldPollGeneration } from "./progress";

describe("generation progress UX", () => {
  it.each([
    ["QUEUED", "Menunggu proses..."],
    ["ANALYZING", "Menganalisis bisnis..."],
    ["GENERATING_CONTENT", "Menyusun konten website..."],
    ["GENERATING_IMAGES", "Membuat gambar website..."],
  ])("maps %s to a user-safe label", (status, label) => expect(generationStatusLabel(status)).toBe(label));

  it("requires the complete review-ready invariant", () => {
    const version = { version_number: 1, content: { schemaVersion: "site_content_v1" } };
    expect(isGenerationReviewReady({ status: "RENDERING", currentContentVersion: 1, versions: [version] })).toBe(true);
    expect(isGenerationReviewReady({ status: "RENDERING", currentContentVersion: 1, versions: [] })).toBe(false);
    expect(isGenerationReviewReady({ status: "RENDERING", currentContentVersion: 1, versions: [{ ...version, content: { schemaVersion: "wrong" } }] })).toBe(false);
  });

  it("maps ready/error states and stops polling", () => {
    expect(generationStatusLabel("RENDERING", true)).toBe("Website siap direview");
    expect(generationStatusLabel("ERROR")).toBe("Pembuatan website belum berhasil");
    expect(shouldPollGeneration("GENERATING_IMAGES", false)).toBe(true);
    expect(shouldPollGeneration("RENDERING", true)).toBe(false);
    expect(shouldPollGeneration("ERROR", false)).toBe(false);
  });

  it("uses real lifecycle stages", () => {
    expect(generationStageState("GENERATING_IMAGES", false)).toEqual(["complete", "complete", "active", "pending"]);
    expect(generationStageState("RENDERING", true)).toEqual(["complete", "complete", "complete", "complete"]);
  });
});