import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { getActiveEntitlements } from "./entitlements";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELIVERY_BUCKET = "dpf-delivery-v1";
type DeliveryAssetRow = {
  storage_bucket: string;
  storage_key: string;
  file_name: string;
  signed_url_expiry_seconds: number;
  addon_id: string | null;
};

export async function getProductDownloadAccess(userId: string, productId: string) {
  if (!UUID.test(userId) || !UUID.test(productId)) return { allowed: false as const, reason: "NOT_ENTITLED" };
  const entitlements = await getActiveEntitlements(userId, productId);
  if (!entitlements.length) return { allowed: false as const, reason: "NOT_ENTITLED" };
  const serviceRole = await getServiceRoleClient();
  if (!serviceRole) return { allowed: false as const, reason: "DELIVERY_UNAVAILABLE" };
  const { data, error } = await serviceRole.from("dpf_delivery_assets").select("storage_bucket, storage_key, file_name, signed_url_expiry_seconds, addon_id")
    .eq("product_id", productId);
  const assets = data as DeliveryAssetRow[] | null;
  if (error || !assets?.length) return { allowed: false as const, reason: "NO_DELIVERY_ASSETS" };

  const entitledAddonIds = new Set(entitlements.flatMap((entitlement) => entitlement.addonId ? [entitlement.addonId] : []));
  const ownsCore = entitlements.some((entitlement) => entitlement.addonId === null);
  const authorizedAssets = assets.filter((asset) => asset.addon_id === null ? ownsCore : entitledAddonIds.has(asset.addon_id));
  if (!authorizedAssets.length) return { allowed: false as const, reason: "NOT_ENTITLED" };

  const assetUrls: string[] = [];
  for (const asset of authorizedAssets) {
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