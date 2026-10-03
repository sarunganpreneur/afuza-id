export type StorefrontAnalyticsEvent =
  | { event: "product_view"; productId: string; sku: string; category: string; niche: string; price: number }
  | { event: "search"; query: string; category?: string; niche?: string; resultCount: number }
  | { event: "add_to_cart"; productId: string; sku: string; category: string; niche: string; price: number; addonIds: string[] }
  | { event: "addon_selected"; productId: string; addonProductId: string; price: number; category: string; niche: string };

export interface StorefrontAnalyticsAdapter {
  track(event: StorefrontAnalyticsEvent): void;
}

export const noOpStorefrontAnalytics: StorefrontAnalyticsAdapter = {
  track(event) {
    void event;
  },
};