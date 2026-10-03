export type PricedProduct = { id: string; status: string; price: number };
export type PricedAddon = { id: string; productId: string; active: boolean; price: number };

export type CheckoutPrice = {
  subtotal: number;
  addonTotal: number;
  total: number;
};

export function calculateCheckoutPrice(input: {
  product: PricedProduct;
  addons: PricedAddon[];
  selectedAddonIds?: string[];
  quantity?: number;
}): CheckoutPrice {
  const quantity = input.quantity ?? 1;
  const selectedAddonIds = input.selectedAddonIds ?? [];
  if (input.product.status !== "PUBLISHED") throw new Error("PRODUCT_UNAVAILABLE");
  if (!Number.isInteger(input.product.price) || input.product.price < 10000) throw new Error("INVALID_PRODUCT_PRICE");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error("INVALID_QUANTITY");
  if (new Set(selectedAddonIds).size !== selectedAddonIds.length) throw new Error("DUPLICATE_ADDON");

  const selectedAddons = selectedAddonIds.map((id) => {
    const addon = input.addons.find((candidate) => candidate.id === id);
    if (!addon || addon.productId !== input.product.id || !addon.active) throw new Error("ADDON_UNAVAILABLE");
    if (!Number.isInteger(addon.price) || addon.price < 0) throw new Error("INVALID_ADDON_PRICE");
    return addon;
  });

  const subtotal = input.product.price * quantity;
  const addonTotal = selectedAddons.reduce((total, addon) => total + addon.price, 0);
  return { subtotal, addonTotal, total: subtotal + addonTotal };
}