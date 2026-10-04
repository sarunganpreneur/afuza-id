import "server-only";

import { createClient } from "@/lib/supabase/server";
import { mapProduct } from "./catalog";
import type { Product } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getMyProducts(userId: string): Promise<Product[]> {
  if (!UUID.test(userId)) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return [];
  const { data: entitlements, error } = await supabase.from("dpf_customer_entitlements").select("product_id").eq("user_id", user.id).eq("status", "ACTIVE");
  if (error || !entitlements?.length) return [];
  const productIds = [...new Set(entitlements.map((row) => row.product_id))];
  const { data: products, error: productError } = await supabase.from("dpf_products").select("*").in("id", productIds);
  if (productError) return [];
  return (products ?? []).map((row) => mapProduct(row as unknown as Record<string, unknown>));
}

export async function getActiveEntitlements(userId: string, productId: string): Promise<Array<{ id: string; addonId: string | null }>> {
  if (!UUID.test(userId) || !UUID.test(productId)) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return [];
  const { data: entitlements, error } = await supabase.from("dpf_customer_entitlements").select("id, order_item_id").eq("user_id", user.id).eq("product_id", productId).eq("status", "ACTIVE");
  if (error || !entitlements?.length) return [];
  const { data: items, error: itemError } = await supabase.from("dpf_order_items").select("id, addon_id").in("id", entitlements.map((row) => row.order_item_id));
  if (itemError) return [];
  const addonByOrderItem = new Map((items ?? []).map((item) => [item.id, item.addon_id]));
  return entitlements.flatMap((entitlement) => addonByOrderItem.has(entitlement.order_item_id)
    ? [{ id: entitlement.id, addonId: addonByOrderItem.get(entitlement.order_item_id) ?? null }]
    : []);
}