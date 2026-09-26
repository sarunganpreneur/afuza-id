"use server";

import { revalidatePath } from "next/cache";
import { publishOwnedSiteVersion, unpublishOwnedSite } from "@/lib/sites/review";

export async function publishSiteVersion(siteId: string, versionNumber: number) {
  const result = await publishOwnedSiteVersion(siteId, versionNumber);
  if (result.ok) revalidatePath(`/dashboard/sites/${siteId}/review`);
  if (result.ok && result.data?.slug) revalidatePath(`/p/${result.data.slug}`);
  return result;
}

export async function unpublishSite(siteId: string) {
  const result = await unpublishOwnedSite(siteId);
  if (result.ok) revalidatePath(`/dashboard/sites/${siteId}/review`);
  if (result.ok && result.data?.slug) revalidatePath(`/p/${result.data.slug}`);
  return result;
}