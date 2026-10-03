"use client";

export type CartSelection = {
  productId: string;
  sku: string;
  selectedAddonIds: string[];
};

const cartStorageKey = "afuza.dpf.cart.v1";
let cachedSerialized: string | null | undefined;
let cachedSelection: CartSelection | null = null;

function parseCartSelection(stored: string | null): CartSelection | null {
  try {
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return null;
    const selection = parsed as Record<string, unknown>;
    if (typeof selection.productId !== "string" || typeof selection.sku !== "string" || !Array.isArray(selection.selectedAddonIds)) return null;
    if (!selection.selectedAddonIds.every((id) => typeof id === "string")) return null;
    return { productId: selection.productId, sku: selection.sku, selectedAddonIds: selection.selectedAddonIds };
  } catch {
    return null;
  }
}

export function getCartSnapshot(): CartSelection | null {
  const stored = window.localStorage.getItem(cartStorageKey);
  if (stored === cachedSerialized) return cachedSelection;
  cachedSerialized = stored;
  cachedSelection = parseCartSelection(stored);
  return cachedSelection;
}

export function subscribeToCart(notify: () => void) {
  const handleUpdate = () => {
    cachedSerialized = undefined;
    notify();
  };
  window.addEventListener("storage", handleUpdate);
  window.addEventListener("dpf-cart-updated", handleUpdate);
  return () => {
    window.removeEventListener("storage", handleUpdate);
    window.removeEventListener("dpf-cart-updated", handleUpdate);
  };
}

export function saveCartSelection(selection: CartSelection) {
  const serialized = JSON.stringify(selection);
  window.localStorage.setItem(cartStorageKey, serialized);
  cachedSerialized = serialized;
  cachedSelection = selection;
  window.dispatchEvent(new Event("dpf-cart-updated"));
}

export function clearCartSelection() {
  window.localStorage.removeItem(cartStorageKey);
  cachedSerialized = null;
  cachedSelection = null;
  window.dispatchEvent(new Event("dpf-cart-updated"));
}