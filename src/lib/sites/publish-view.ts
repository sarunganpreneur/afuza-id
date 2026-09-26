export function publicSiteUrl(slug: string): string {
  return `https://afuza.id/p/${slug}`;
}

export function isSelectedVersionPublished(input: { siteStatus: string; publishedVersion: number | null; selectedVersion: number }): boolean {
  return input.siteStatus === "LIVE" && input.publishedVersion === input.selectedVersion;
}

export function publishViewState(siteStatus: string, publishedVersion: number | null, selectedVersion: number): "published" | "newer" | "unpublished" {
  if (isSelectedVersionPublished({ siteStatus, publishedVersion, selectedVersion })) return "published";
  if (publishedVersion !== null && selectedVersion > publishedVersion) return "newer";
  return "unpublished";
}