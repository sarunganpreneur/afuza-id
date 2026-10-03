import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { getActiveEntitlementIds } from "./entitlements";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELIVERY_BUCKET = "dpf-delivery-v1";

export async function getProductDownloadAccess(userId: string, productId: string) {
  if (!UUID.test(userId) || !UUID.test(productId)) return { allowed: false as const, reason: "NOT_ENTITLED" };
  const entitlementIds = await getActiveEntitlementIds(userId, productId);
  if (!entitlementIds.length) return { allowed: false as const, reason: "NOT_ENTITLED" };
  const serviceRole = await getServiceRoleClient();
  if (!serviceRole) return { allowed: false as const, reason: "DELIVERY_UNAVAILABLE" };
  const { data: assets, error } = await serviceRole.from("dpf_delivery_assets").select("storage_bucket, storage_key, file_name, signed_url_expiry_seconds")
    .eq("product_id", productId).or(`entitlement_id.is.null,entitlement_id.in.(${entitlementIds.join(",")})`);
  if (error || !assets?.length) return { allowed: false as const, reason: "NO_DELIVERY_ASSETS" };

  const assetUrls: string[] = [];
  for (const asset of assets) {
    if (asset.storage_bucket !== DELIVERY_BUCKET || asset.storage_key.startsWith("/") || asset.storage_key.split("/").includes("..")) {
      return { allowed: false as const, reason: "DELIVERY_UNAVAILABLE" };
    }
    const expiry = Math.min(300, Math.max(60, Number(asset.signed_url_expiry_seconds) || 180));
    const { data, error: signError } = await serviceRole.storage.from(DELIVERY_BUCKET)
      .createSignedUrl(asset.storage_key, expiry, { download: asset.file_name });
    if (signError || !data?.signedUrl) return { allowed: false as const, reason: "DELIVERY_UNAVAILABLE" };
    assetUrls.push(data.signedUrl);
  }
  return { allowed: true as const, assetUrls };
}