export const PRODUCT_STATUSES = [
  "DRAFT",
  "READY",
  "PUBLISHED",
  "TESTING",
  "WINNER",
  "SCALING",
  "ARCHIVED",
] as const;

export const TRAFFIC_ROLES = [
  "ACQUISITION",
  "MONETIZATION",
  "ADD_ON",
  "BUNDLE_COMPONENT",
  "SEO_LONGTAIL",
] as const;

export const PRODUCT_CATEGORIES = [
  "Bisnis & UMKM",
  "Marketing",
  "Pendidikan",
  "Anak & Worksheet",
  "Karier",
  "Event & Invitation",
  "Productivity",
  "Design & Creative",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type TrafficRole = (typeof TRAFFIC_ROLES)[number];
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type Product = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  shortTitle?: string | null;
  headline: string;
  description: string;
  category: ProductCategory;
  subcategory: string;
  niche: string;
  buyer: string;
  problem: string;
  useCase: string;
  productType: string;
  format: string[];
  price: number;
  compareAtPrice?: number | null;
  trafficRole: TrafficRole;
  status: ProductStatus;
  previewAssets: string[];
  deliveryAssets: string[];
  keywords: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductAddon = {
  id: string;
  productId: string;
  addonProductId?: string | null;
  title: string;
  description?: string | null;
  price: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductPresentation = {
  productId: string;
  benefits: string[];
  included: string[];
  suitableFor: string[];
  previewLabel: string;
  coverTone: "green" | "coral" | "blue" | "yellow" | "ink";
  faqs: Array<{ question: string; answer: string }>;
};

export type ProductCardViewModel = Pick<
  Product,
  "id" | "sku" | "slug" | "title" | "headline" | "category" | "niche" | "format" | "price"
> & {
  previewLabel: string;
  coverTone: ProductPresentation["coverTone"];
};

export type ProductDetailViewModel = Product & {
  presentation: Omit<ProductPresentation, "productId" | "coverTone"> & {
    coverTone: ProductPresentation["coverTone"];
  };
};

export type VisibleAddonViewModel = Pick<
  ProductAddon,
  "id" | "title" | "description" | "price" | "sortOrder" | "addonProductId"
>;

export type CatalogQuery = {
  q?: string;
  category?: string;
  niche?: string;
  page?: number;
  pageSize?: number;
};

export type CatalogPage = {
  items: ProductCardViewModel[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type CheckoutPreviewRequest = {
  productId: string;
  selectedAddonIds: string[];
};

export type CheckoutPreviewResult =
  | {
      ok: true;
      product: ProductCardViewModel;
      selectedAddons: VisibleAddonViewModel[];
      estimatedDisplayTotal: number;
      currency: "IDR";
      estimateOnly: true;
    }
  | {
      ok: false;
      reason: "PRODUCT_UNAVAILABLE" | "ADDON_UNAVAILABLE";
    };

export type OrderStatusReadModel = {
  id: string;
  reference: string;
  state: "PREVIEW_ONLY";
  message: string;
  isFixture: true;
};

export type OwnedProductReadModel = {
  product: ProductCardViewModel;
  accessLabel: string;
};

export interface CatalogReadAdapter {
  listProducts(query?: CatalogQuery): Promise<CatalogPage>;
  getProductBySlug(slug: string): Promise<ProductDetailViewModel | null>;
  getRelatedProducts(productId: string, limit?: number): Promise<ProductCardViewModel[]>;
  getVisibleAddons(productId: string): Promise<VisibleAddonViewModel[]>;
  getCategories(): Promise<ProductCategory[]>;
  getNiches(): Promise<string[]>;
}

export interface CheckoutPreviewAdapter {
  resolveSelection(request: CheckoutPreviewRequest): Promise<CheckoutPreviewResult>;
}

export interface OrderReadAdapter {
  getOrderStatus(id: string): Promise<OrderStatusReadModel | null>;
}

export interface MyProductsReadAdapter {
  listOwnedProducts(userId: string): Promise<OwnedProductReadModel[]>;
}

export type StorefrontAdapters = {
  catalog: CatalogReadAdapter;
  checkoutPreview: CheckoutPreviewAdapter;
  orders: OrderReadAdapter;
  myProducts: MyProductsReadAdapter;
};