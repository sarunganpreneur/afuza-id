import { describe, expect, it } from "vitest";
import { isSelectedVersionPublished, publicSiteUrl, publishViewState } from "./publish-view";

describe("publish view", () => {
  it("builds the canonical public URL", () => {
    expect(publicSiteUrl("bakso-marem-auto-worker-test-4")).toBe("https://afuza.id/p/bakso-marem-auto-worker-test-4");
  });

  it.each([
    ["DRAFT", null, 1, "unpublished"],
    ["DRAFT", 1, 1, "unpublished"],
    ["LIVE", 1, 1, "published"],
    ["LIVE", 1, 2, "newer"],
  ] as const)("maps canonical online state", (siteStatus, published, selected, state) => {
    expect(publishViewState(siteStatus, published, selected)).toBe(state);
  });

  it("requires LIVE plus the matching published version", () => {
    expect(isSelectedVersionPublished({ siteStatus: "DRAFT", publishedVersion: 1, selectedVersion: 1 })).toBe(false);
    expect(isSelectedVersionPublished({ siteStatus: "LIVE", publishedVersion: 1, selectedVersion: 1 })).toBe(true);
  });
});