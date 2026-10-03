import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Product, ProductAddon } from "./types";

type ProductRow = Record<string, unknown>;
type AddonRow = Record<string, unknown>;

function mapProduct(row: ProductRow): Product {
  return {
    id: String(row.id), sku: String(row.sku), slug: String(row.slug), title: String(row.title),
    shortTitle: row.short_title == null ? null : String(row.short_title), headline: String(row.headline),
    description: String(row.description), category: String(row.category), subcategory: String(row.subcategory),
    niche: String(row.niche), buyer: String(row.buyer), problem: String(row.problem), useCase: String(row.use_case),
    productType: String(row.product_type), format: (row.format as string[]) ?? [], price: Number(row.price),
    compareAtPrice: row.compare_at_price == null ? null : Number(row.compare_at_price),
    trafficRole: String(row.traffic_role), status: row.status as Product["status"],
    previewAssets: (row.preview_assets as string[]) ?? [], deliveryAssets: [],
    keywords: (row.keywords as string[]) ?? [], seoTitle: row.seo_title == null ? null : String(row.seo_title),
    seoDescription: row.seo_description == null ? null : String(row.seo_description),
    publishedAt: row.published_at == null ? null : String(row.published_at),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapAddon(row: AddonRow): ProductAddon {
  return {
    id: String(row.id), productId: String(row.product_id),
    addonProductId: row.addon_product_id == null ? null : String(row.addon_product_id),
    title: String(row.title), description: row.description == null ? null : String(row.description),
    price: Number(row.price), active: Boolean(row.active), sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export async function listPublishedProducts(input: { category?: string; q?: string } = {}): Promise<Product[]> {
  const supabase = await createClient();
  let query = supabase.from("dpf_products").select("*").eq("status", "PUBLISHED").order("title");
  if (input.category) query = query.eq("category", input.category);
  if (input.q?.trim()) query = query.ilike("title", `%${input.q.trim().replace(/[,%_]/g, " ")}%`);
  const { data, error } = await query;
  if (error) throw new Error("PRODUCT_CATALOG_UNAVAILABLE");
  return (data ?? []).map((row) => mapProduct(row as ProductRow));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("dpf_products").select("*").eq("slug", slug).eq("status", "PUBLISHED").maybeSingle();
  if (error || !data) return null;
  return mapProduct(data as ProductRow);
}

export async function getProductAddons(productId: string): Promise<ProductAddon[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("dpf_product_addons").select("*").eq("product_id", productId).eq("active", true).order("sort_order");
  if (error) throw new Error("PRODUCT_ADDONS_UNAVAILABLE");
  return (data ?? []).map((row) => mapAddon(row as AddonRow));
}

export { mapProduct, mapAddon };