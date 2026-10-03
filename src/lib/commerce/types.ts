export type ProductStatus =
  | "DRAFT"
  | "READY"
  | "PUBLISHED"
  | "TESTING"
  | "WINNER"
  | "SCALING"
  | "ARCHIVED";

export type Product = {
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
  status: ProductStatus;
  previewAssets: string[];
  deliveryAssets: string[];
  keywords: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductAddon = {
  id: string;
  productId: string;
  addonProductId: string | null;
  title: string;
  description: string | null;
  price: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type OrderStatus = "PENDING" | "AWAITING_PAYMENT" | "PAID" | "FAILED" | "CANCELLED";

export type Order = {
  id: string;
  orderNumber: string;
  customerUserId: string;
  status: OrderStatus;
  subtotal: number;
  addonTotal: number;
  total: number;
  createdAt: string;
  paidAt: string | null;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  skuSnapshot: string;
  titleSnapshot: string;
  priceSnapshot: number;
  itemType: "CORE" | "ADD_ON" | "BUNDLE";
  addonProductId: string | null;
  quantity: number;
  createdAt: string;
};

export type PaymentStatus = "INITIATED" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export type PaymentIntent = {
  provider: string;
  providerReference: string;
  status: "INITIATED" | "PENDING";
  amount: number;
  currency: "IDR";
  rawProviderData: Record<string, unknown>;
};

export type PaymentEvent = {
  provider: string;
  providerReference: string;
  status: PaymentStatus;
  amount: number;
  currency: "IDR";
  rawPayload: Record<string, unknown>;
};

export type PaymentProviderAdapter = {
  readonly provider: string;
  createPayment(input: { orderId: string; amount: number }): Promise<PaymentIntent>;
  verifyPaymentEvent(input: unknown): Promise<PaymentEvent | null>;
};

export type CheckoutResult = {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number;
  addonTotal: number;
  total: number;
};