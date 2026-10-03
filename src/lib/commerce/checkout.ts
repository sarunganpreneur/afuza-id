import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CheckoutResult, Order, OrderItem } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OrderRow = Record<string, unknown>;

function mapOrder(row: OrderRow): Order {
  return {
    id: String(row.id), orderNumber: String(row.order_number), customerUserId: String(row.customer_user_id),
    status: row.status as Order["status"], subtotal: Number(row.subtotal), addonTotal: Number(row.addon_total),
    total: Number(row.total), createdAt: String(row.created_at), paidAt: row.paid_at == null ? null : String(row.paid_at),
  };
}

export async function createCheckout(input: {
  productId: string;
  addonIds?: string[];
  quantity?: number;
  idempotencyKey: string;
}): Promise<CheckoutResult> {
  if (!UUID.test(input.productId) || (input.addonIds ?? []).some((id) => !UUID.test(id)) ||
      !/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) throw new Error("INVALID_CHECKOUT_INPUT");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTHENTICATION_REQUIRED");
  const { data, error } = await supabase.rpc("dpf_create_checkout", {
    p_product_id: input.productId,
    p_addon_ids: input.addonIds ?? [],
    p_quantity: input.quantity ?? 1,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error || !data || typeof data !== "object") throw new Error("CHECKOUT_FAILED");
  const result = data as Record<string, unknown>;
  return {
    orderId: String(result.orderId), orderNumber: String(result.orderNumber), status: result.status as CheckoutResult["status"],
    subtotal: Number(result.subtotal), addonTotal: Number(result.addonTotal), total: Number(result.total),
  };
}

export async function getOrder(orderId: string, userId: string): Promise<(Order & { items: OrderItem[] }) | null> {
  if (!UUID.test(orderId) || !UUID.test(userId)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return null;
  const { data, error } = await supabase.from("dpf_orders").select("*").eq("id", orderId).eq("customer_user_id", user.id).maybeSingle();
  if (error || !data) return null;
  const { data: items, error: itemError } = await supabase.from("dpf_order_items").select("*, dpf_product_addons(addon_product_id)").eq("order_id", orderId).order("created_at");
  if (itemError) return null;
  return {
    ...mapOrder(data as OrderRow),
    items: (items ?? []).map((row) => {
      const item = row as Record<string, unknown>;
      const addon = item.dpf_product_addons as Record<string, unknown> | null;
      return {
        id: String(item.id), orderId: String(item.order_id), productId: String(item.product_id),
        skuSnapshot: String(item.sku_snapshot), titleSnapshot: String(item.title_snapshot),
        priceSnapshot: Number(item.price_snapshot), itemType: item.item_type as OrderItem["itemType"],
        addonProductId: addon?.addon_product_id == null ? null : String(addon.addon_product_id),
        quantity: Number(item.quantity), createdAt: String(item.created_at),
      };
    }),
  };
}