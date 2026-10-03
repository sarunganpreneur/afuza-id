import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getMyProducts } from "@/lib/commerce/entitlements";
import { getOrder } from "@/lib/commerce/checkout";
import { getProductAddons, getProductBySlug as getCommerceProductBySlug, listPublishedProducts } from "@/lib/commerce/catalog";
import { createFixtureStorefrontAdapters } from "./fixture-adapter";
import type {
  CatalogPage,
  CatalogQuery,
  CheckoutPreviewRequest,
  CheckoutPreviewResult,
  OrderStatusReadModel,
  ProductCardViewModel,
  ProductDetailViewModel,
  ProductAddon,
  ProductCategory,
  ProductPresentation,
  StorefrontAdapters,
  VisibleAddonViewModel,
} from "./types";

type CommerceProduct = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  shortTitle: string | null;
  headline: string;
  description: string;
  category: string;
  subcategory: string;
  niche: string;
  buyer: string;
  problem: string;
  useCase: string;
  productType: string;
  format: string[];
  price: number;
  compareAtPrice: number | null;
  trafficRole: string;
  status:
    | "DRAFT"
    | "READY"
    | "PUBLISHED"
    | "TESTING"
    | "WINNER"
    | "SCALING"
    | "ARCHIVED";
  previewAssets: string[];
  deliveryAssets: string[];
  keywords: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const fallbackStorefrontAdapters = createFixtureStorefrontAdapters();
const previewOrder: OrderStatusReadModel = {
  id: "preview",
  reference: "Preview status",
  state: "PREVIEW_ONLY",
  message: "Halaman ini hanya contoh status preview untuk pengujian UI.",
  isFixture: true,
};

export function shouldUseFixtureCatalogFallback() {
  const rawMode = process.env.DPF_ENABLE_FIXTURE_CATALOG ?? process.env.NEXT_PUBLIC_DPF_ENABLE_FIXTURE_CATALOG ?? "false";
  const enabled = ["1", "true", "yes", "on"].includes(rawMode.trim().toLowerCase());
  const runtime = (process.env.NODE_ENV ?? "development").trim().toLowerCase();
  return enabled && (runtime === "test" || runtime === "development");
}

function emptyCatalogPage(page: number, pageSize: number): CatalogPage {
  return { items: [], total: 0, page, pageSize, pageCount: 1 };
}

function pickCoverTone(seed: string): ProductPresentation["coverTone"] {
  const tones: ProductPresentation["coverTone"][] = ["green", "coral", "blue", "yellow", "ink"];
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return tones[hash % tones.length];
}

function productToCard(product: CommerceProduct): ProductCardViewModel {
  const coverTone = pickCoverTone(product.id);
  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    title: product.title,
    headline: product.headline,
    category: product.category as ProductCategory,
    niche: product.niche,
    format: product.format,
    price: product.price,
    previewLabel: product.productType || product.title,
    coverTone,
  };
}

function productToDetail(product: CommerceProduct): ProductDetailViewModel {
  const basePresentation = {
    benefits: [
      product.headline,
      `Didesain untuk ${product.buyer.toLowerCase()}`,
      `Membantu mengatasi ${product.problem.toLowerCase()}`,
    ],
    included: [
      "File produk utama",
      "Panduan penggunaan singkat",
      "Konten siap pakai",
    ],
    suitableFor: [product.buyer, product.niche, product.category],
    previewLabel: product.productType || "Produk digital",
    coverTone: pickCoverTone(product.id),
    faqs: [
      { question: "Apakah produk ini cocok untuk kebutuhan saya?", answer: `Produk ini dibuat untuk ${product.buyer.toLowerCase()} yang membutuhkan solusi praktis dalam ${product.niche.toLowerCase()}.` },
      { question: "Bagaimana cara mengakses file setelah pembelian?", answer: "File akan tersedia di akun Anda segera setelah checkout berhasil dan sistem entitlements aktif." },
    ],
  };

  return {
    ...product,
    category: product.category as ProductCategory,
    trafficRole: product.trafficRole as ProductDetailViewModel["trafficRole"],
    presentation: basePresentation,
  } as ProductDetailViewModel;
}

function addonToVisible(addon: ProductAddon): VisibleAddonViewModel {
  return {
    id: addon.id,
    title: addon.title,
    description: addon.description ?? null,
    price: addon.price,
    sortOrder: addon.sortOrder,
    addonProductId: addon.addonProductId,
  };
}

export function createCommerceStorefrontAdapters(): StorefrontAdapters {
  return {
    catalog: {
      async listProducts(query: CatalogQuery = {}): Promise<CatalogPage> {
        const page = Number.isInteger(query.page) && (query.page ?? 1) > 0 ? query.page! : 1;
        const pageSize = Number.isInteger(query.pageSize) && (query.pageSize ?? 0) > 0 ? Math.min(query.pageSize!, 48) : 12;
        const fallback = await fallbackStorefrontAdapters.catalog.listProducts(query);
        try {
          const liveProducts = await listPublishedProducts({ q: query.q, category: query.category });
          const filtered = liveProducts.filter((product) => !query.niche || product.niche === query.niche);
          const start = (page - 1) * pageSize;
          return {
            items: filtered.slice(start, start + pageSize).map(productToCard),
            total: filtered.length,
            page,
            pageSize,
            pageCount: Math.max(1, Math.ceil(filtered.length / pageSize || 1)),
          };
        } catch {
          if (shouldUseFixtureCatalogFallback()) return fallback;
          return emptyCatalogPage(page, pageSize);
        }
      },
      async getProductBySlug(slug: string): Promise<ProductDetailViewModel | null> {
        const fallbackResult = await fallbackStorefrontAdapters.catalog.getProductBySlug(slug);
        try {
          const product = await getCommerceProductBySlug(slug);
          if (!product) return shouldUseFixtureCatalogFallback() ? fallbackResult : null;
          return productToDetail(product);
        } catch {
          if (shouldUseFixtureCatalogFallback()) return fallbackResult;
          return null;
        }
      },
      async getRelatedProducts(productId: string, limit = 4): Promise<ProductCardViewModel[]> {
        const fallbackResult = await fallbackStorefrontAdapters.catalog.getRelatedProducts(productId, limit);
        try {
          const products = await listPublishedProducts();
          const product = products.find((item) => item.id === productId);
          if (!product || limit <= 0) return shouldUseFixtureCatalogFallback() ? fallbackResult : [];
          const sameCategory = products.filter((item) => item.id !== productId && item.category === product.category);
          const related = sameCategory.length >= limit
            ? sameCategory
            : [...sameCategory, ...products.filter((item) => item.id !== productId && item.category !== product.category)];
          return related.slice(0, Math.min(limit, 48)).map(productToCard);
        } catch {
          if (shouldUseFixtureCatalogFallback()) return fallbackResult;
          return [];
        }
      },
      async getVisibleAddons(productId: string): Promise<VisibleAddonViewModel[]> {
        const fallbackResult = await fallbackStorefrontAdapters.catalog.getVisibleAddons(productId);
        try {
          const addons = await getProductAddons(productId);
          return addons.map(addonToVisible);
        } catch {
          if (shouldUseFixtureCatalogFallback()) return fallbackResult;
          return [];
        }
      },
      async getCategories(): Promise<ProductCategory[]> {
        const fallbackResult = await fallbackStorefrontAdapters.catalog.getCategories();
        try {
          const products = await listPublishedProducts();
          return [...new Set(products.map((product) => product.category as ProductCategory))].sort() as ProductCategory[];
        } catch {
          if (shouldUseFixtureCatalogFallback()) return fallbackResult;
          return [];
        }
      },
      async getNiches(): Promise<string[]> {
        const fallbackResult = await fallbackStorefrontAdapters.catalog.getNiches();
        try {
          const products = await listPublishedProducts();
          return [...new Set(products.map((product) => product.niche))].sort();
        } catch {
          if (shouldUseFixtureCatalogFallback()) return fallbackResult;
          return [];
        }
      },
    },
    checkoutPreview: {
      async resolveSelection(request: CheckoutPreviewRequest): Promise<CheckoutPreviewResult> {
        const fallbackResult = await fallbackStorefrontAdapters.checkoutPreview.resolveSelection(request);
        if (request.selectedAddonIds.length > 12) return fallbackResult;

        try {
          const publishedProducts = await listPublishedProducts();
          const product = publishedProducts.find((item) => item.id === request.productId);
          if (!product) return { ok: false, reason: "PRODUCT_UNAVAILABLE" };
          if (new Set(request.selectedAddonIds).size !== request.selectedAddonIds.length) {
            return { ok: false, reason: "ADDON_UNAVAILABLE" };
          }
          const addons = await getProductAddons(product.id);
          const mapped = request.selectedAddonIds.map((id) => addons.find((item) => item.id === id));
          if (mapped.some((addon) => !addon)) {
            return { ok: false, reason: "ADDON_UNAVAILABLE" };
          }
          const selectedAddons = mapped as ProductAddon[];
          const mismatched = selectedAddons.some((addon) => {
            if (!addon.addonProductId) return false;
            const addonProduct = publishedProducts.find((item) => item.id === addon.addonProductId);
            return addonProduct ? addonProduct.niche !== product.niche : false;
          });
          if (mismatched) {
            return { ok: false, reason: "ADDON_UNAVAILABLE" };
          }
          return {
            ok: true,
            product: productToCard(product),
            selectedAddons: selectedAddons.map(addonToVisible),
            estimatedDisplayTotal: product.price + selectedAddons.reduce((sum, addon) => sum + addon.price, 0),
            currency: "IDR",
            estimateOnly: true,
          };
        } catch {
          if (shouldUseFixtureCatalogFallback()) return fallbackResult;
          return { ok: false, reason: "PRODUCT_UNAVAILABLE" };
        }
      },
    },
    orders: {
      async getOrderStatus(id: string): Promise<OrderStatusReadModel | null> {
        if (id === "preview") return previewOrder;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        try {
          const order = await getOrder(id, user.id);
          if (!order) return null;
          const state = order.status === "AWAITING_PAYMENT" ? "AWAITING_PAYMENT" : order.status;
          const message = order.status === "PAID"
            ? `Pesanan ${order.orderNumber} telah dibayar.`
            : order.status === "AWAITING_PAYMENT"
              ? `Pesanan ${order.orderNumber} menunggu pembayaran.`
              : `Pesanan ${order.orderNumber} saat ini berstatus ${order.status}.`;
          return {
            id: order.id,
            reference: order.orderNumber,
            state,
            message,
            isFixture: false,
          };
        } catch {
          return null;
        }
      },
    },
    myProducts: {
      async listOwnedProducts(userId: string) {
        try {
          const products = await getMyProducts(userId);
          return products.map((product) => ({
            product: productToCard(product),
            accessLabel: `Akses aktif · ${product.category}`,
          }));
        } catch {
          return [];
        }
      },
    },
  };
}

export const storefrontAdapters = createCommerceStorefrontAdapters();
