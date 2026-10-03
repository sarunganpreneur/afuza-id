"use client";

import Link from "next/link";
import { useState } from "react";
import { noOpStorefrontAnalytics } from "@/lib/dpf/storefront/analytics";
import { formatRupiah } from "@/lib/dpf/storefront/format";
import type { ProductDetailViewModel, VisibleAddonViewModel } from "@/lib/dpf/storefront";
import { saveCartSelection } from "./cart-storage";

export function ProductDetailActions({ product, addons }: { product: ProductDetailViewModel; addons: VisibleAddonViewModel[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [added, setAdded] = useState(false);
  const estimate = product.price + addons.filter((addon) => selectedIds.includes(addon.id)).reduce((sum, addon) => sum + addon.price, 0);

  function toggleAddon(addon: VisibleAddonViewModel) {
    const selected = selectedIds.includes(addon.id);
    const next = selected ? selectedIds.filter((id) => id !== addon.id) : [...selectedIds, addon.id];
    setSelectedIds(next);
    if (!selected && addon.addonProductId) {
      noOpStorefrontAnalytics.track({ event: "addon_selected", productId: product.id, addonProductId: addon.addonProductId, price: addon.price, category: product.category, niche: product.niche });
    }
  }

  function addToCart() {
    saveCartSelection({ productId: product.id, sku: product.sku, selectedAddonIds: selectedIds });
    noOpStorefrontAnalytics.track({ event: "add_to_cart", productId: product.id, sku: product.sku, category: product.category, niche: product.niche, price: product.price, addonIds: selectedIds });
    setAdded(true);
  }

  return (
    <div className="dpf-detail-purchase">
      <div className="dpf-addon-heading"><div><span className="dpf-kicker">TAMBAHKAN KE PAKET</span><h2>Lengkapi kebutuhan Anda</h2></div><span className="dpf-addon-count">{addons.length} pilihan</span></div>
      <div className="dpf-addon-list">
        {addons.map((addon) => (
          <label className={`dpf-addon-row${selectedIds.includes(addon.id) ? " is-selected" : ""}`} key={addon.id}>
            <input type="checkbox" checked={selectedIds.includes(addon.id)} onChange={() => toggleAddon(addon)} />
            <span className="dpf-checkbox-mark" aria-hidden="true">✓</span>
            <span className="dpf-addon-copy"><strong>{addon.title}</strong><small>{addon.description}</small></span>
            <span className="dpf-addon-price">+{formatRupiah(addon.price)}</span>
          </label>
        ))}
      </div>
      <div className="dpf-estimate-row"><span>Estimasi total tampilan</span><strong>{formatRupiah(estimate)}</strong></div>
      <p className="dpf-estimate-note">Estimasi untuk pratinjau. Total transaksi akan ditentukan Commerce saat integrasi tersedia.</p>
      {added ? (
        <div className="dpf-added-state" role="status"><span>Produk tersimpan di keranjang.</span><Link href="/cart">Lihat keranjang →</Link></div>
      ) : <button className="dpf-button dpf-button-wide" type="button" onClick={addToCart}>Tambah ke keranjang <span aria-hidden="true">→</span></button>}
    </div>
  );
}