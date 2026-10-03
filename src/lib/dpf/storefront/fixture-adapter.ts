import { fixturePresentations, fixtureProductAddons, fixtureProducts } from "./fixture-catalog";
import type {
  CatalogPage,
  CatalogQuery,
  CheckoutPreviewRequest,
  CheckoutPreviewResult,
  OrderStatusReadModel,
  Product,
  ProductCardViewModel,
  ProductDetailViewModel,
  ProductAddon,
  ProductPresentation,
  StorefrontAdapters,
  VisibleAddonViewModel,
} from "./types";

const MAX_PAGE_SIZE = 48;

function searchableText(product: Product) {
  return [product.title, product.category, product.subcategory, product.niche, product.buyer, product.problem, ...product.keywords]
    .join(" ")
    .toLocaleLowerCase("id-ID");
}

const previewOrder: OrderStatusReadModel = {
  id: "preview",
  reference: "Contoh status pesanan",
  state: "PREVIEW_ONLY",
  message: "Halaman ini hanya contoh tampilan. Pembuatan pesanan dan status Commerce belum terhubung.",
  isFixture: true,
};

export type FixtureStorefrontCatalog = {
  products: Product[];
  addons: ProductAddon[];
  presentations: ProductPresentation[];
};

export function createFixtureStorefrontAdapters(
  catalog: FixtureStorefrontCatalog = {
    products: fixtureProducts,
    addons: fixtureProductAddons,
    presentations: fixturePresentations,
  },
): StorefrontAdapters {
  const { products, addons, presentations } = catalog;
  const presentationById = new Map(presentations.map((item) => [item.productId, item]));
  const toCard = (product: Product): ProductCardViewModel => {
    const presentation = presentationById.get(product.id);
    return {
      id: product.id,
      sku: product.sku,
      slug: product.slug,
      title: product.title,
      headline: product.headline,
      category: product.category,
      niche: product.niche,
      format: [...product.format],
      price: product.price,
      previewLabel: presentation?.previewLabel ?? product.productType,
      coverTone: presentation?.coverTone ?? "green",
    };
  };
  const findVisibleAddons = (productId: string): VisibleAddonViewModel[] => {
    const product = products.find((item) => item.id === productId && item.status === "PUBLISHED");
    if (!product) return [];
    return addons
      .filter((addon) => addon.productId === productId && addon.active)
      .filter((addon) => !addon.addonProductId || products.some((item) => item.id === addon.addonProductId && item.status === "PUBLISHED"))
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(({ id, title, description, price, sortOrder, addonProductId }) => ({ id, title, description, price, sortOrder, addonProductId }));
  };

  return {
    catalog: {
      async listProducts(query: CatalogQuery = {}): Promise<CatalogPage> {
        const page = Number.isInteger(query.page) && (query.page ?? 1) > 0 ? query.page! : 1;
        const pageSize = Number.isInteger(query.pageSize) && (query.pageSize ?? 0) > 0 ? Math.min(query.pageSize!, MAX_PAGE_SIZE) : 12;
        const normalizedQuery = query.q?.trim().toLocaleLowerCase("id-ID");
        const filtered = products
          .filter((product) => product.status === "PUBLISHED")
          .filter((product) => !query.category || product.category === query.category)
          .filter((product) => !query.niche || product.niche === query.niche)
          .filter((product) => !normalizedQuery || searchableText(product).includes(normalizedQuery))
          .sort((left, right) => left.sku.localeCompare(right.sku));
        const start = (page - 1) * pageSize;
        return { items: filtered.slice(start, start + pageSize).map(toCard), total: filtered.length, page, pageSize, pageCount: Math.ceil(filtered.length / pageSize) };
      },
      async getProductBySlug(slug: string): Promise<ProductDetailViewModel | null> {
        const product = products.find((item) => item.slug === slug && item.status === "PUBLISHED");
        const presentation = product && presentationById.get(product.id);
        if (!product || !presentation) return null;
        return { ...product, presentation: { benefits: [...presentation.benefits], included: [...presentation.included], suitableFor: [...presentation.suitableFor], previewLabel: presentation.previewLabel, coverTone: presentation.coverTone, faqs: [...presentation.faqs] } };
      },
      async getRelatedProducts(productId: string, limit = 4): Promise<ProductCardViewModel[]> {
        const product = products.find((item) => item.id === productId);
        if (!product || limit <= 0) return [];
        const sameCategory = products.filter((item) => item.id !== productId && item.status === "PUBLISHED" && item.category === product.category);
        const related = sameCategory.length >= limit ? sameCategory : [...sameCategory, ...products.filter((item) => item.id !== productId && item.status === "PUBLISHED" && item.category !== product.category)];
        return related.slice(0, Math.min(limit, MAX_PAGE_SIZE)).map(toCard);
      },
      async getVisibleAddons(productId: string) {
        return findVisibleAddons(productId);
      },
      async getCategories() {
        return [...new Set(products.filter((item) => item.status === "PUBLISHED").map((item) => item.category))].sort();
      },
      async getNiches() {
        return [...new Set(products.filter((item) => item.status === "PUBLISHED").map((item) => item.niche))].sort();
      },
    },
    checkoutPreview: {
      async resolveSelection(request: CheckoutPreviewRequest): Promise<CheckoutPreviewResult> {
        const product = products.find((item) => item.id === request.productId && item.status === "PUBLISHED");
        if (!product) return { ok: false, reason: "PRODUCT_UNAVAILABLE" };
        if (new Set(request.selectedAddonIds).size !== request.selectedAddonIds.length) return { ok: false, reason: "ADDON_UNAVAILABLE" };
        const available = findVisibleAddons(product.id);
        const selectedAddons = request.selectedAddonIds.map((id) => available.find((addon) => addon.id === id));
        if (selectedAddons.some((addon) => !addon)) return { ok: false, reason: "ADDON_UNAVAILABLE" };
        const resolvedAddons = selectedAddons as VisibleAddonViewModel[];
        return {
          ok: true,
          product: toCard(product),
          selectedAddons: resolvedAddons,
          estimatedDisplayTotal: product.price + resolvedAddons.reduce((sum, addon) => sum + addon.price, 0),
          currency: "IDR",
          estimateOnly: true,
        };
      },
    },
    orders: {
      async getOrderStatus(id) {
        return id === previewOrder.id ? previewOrder : null;
      },
    },
    myProducts: {
      async listOwnedProducts(userId) {
        void userId;
        return [];
      },
    },
  };
}

export const fixtureStorefrontAdapters = createFixtureStorefrontAdapters();