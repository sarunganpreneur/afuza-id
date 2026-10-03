"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CheckoutPreviewResult } from "@/lib/dpf/storefront";
import { formatRupiah } from "@/lib/dpf/storefront/format";
import { clearCartSelection, getCartSnapshot, subscribeToCart } from "./cart-storage";

type CartExperienceProps = { mode: "cart" | "checkout" };

export function CartExperience({ mode }: CartExperienceProps) {
  const selection = useSyncExternalStore(subscribeToCart, getCartSnapshot, () => null);
  const [previewState, setPreviewState] = useState<{ key: string; result: CheckoutPreviewResult } | null>(null);
  const selectionKey = selection ? `${selection.productId}:${selection.selectedAddonIds.join(",")}` : "";

  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    fetch("/api/storefront/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: selection.productId, selectedAddonIds: selection.selectedAddonIds }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Preview unavailable");
        return response.json() as Promise<CheckoutPreviewResult>;
      })
      .then((result) => setPreviewState({ key: selectionKey, result }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") setPreviewState({ key: selectionKey, result: { ok: false, reason: "PRODUCT_UNAVAILABLE" } });
      });
    return () => controller.abort();
  }, [selection, selectionKey]);

  if (!selection) {
    return (
      <div className="dpf-empty-state">
        <span className="dpf-empty-index">01 / KERANJANG</span>
        <h2>{mode === "cart" ? "Keranjang masih kosong." : "Belum ada pilihan untuk checkout."}</h2>
        <p>Pilih produk digital dari katalog untuk melihat ringkasan estimasi.</p>
        <Link className="dpf-button" href="/produk">Jelajahi produk <span aria-hidden="true">→</span></Link>
      </div>
    );
  }

  const preview = previewState?.key === selectionKey ? previewState.result : null;

  if (preview && !preview.ok) {
    return <div className="dpf-empty-state"><h2>Pilihan produk tidak tersedia.</h2><p>Produk atau add-on mungkin sudah tidak aktif. Kembali ke katalog untuk memilih ulang.</p><button className="dpf-button" type="button" onClick={clearCartSelection}>Kosongkan keranjang</button></div>;
  }

  return (
    <div className="dpf-cart-layout">
      <section className="dpf-cart-lines" aria-label="Pilihan produk">
        <div className="dpf-cart-product-cover"><span>{preview?.ok ? preview.product.previewLabel : "PRODUK DIGITAL"}</span><b aria-hidden="true">{preview?.ok ? preview.product.title.slice(0, 1) : "A"}</b></div>
        <div className="dpf-cart-product-heading"><div><span className="dpf-kicker">{preview?.ok ? preview.product.category : "Memeriksa katalog"}</span><h2>{preview?.ok ? preview.product.title : "Memuat pratinjau pilihan"}</h2></div><Link href={preview?.ok ? `/produk/${preview.product.slug}` : "/produk"}>Ubah pilihan</Link></div>
        {preview?.ok && <div className="dpf-cart-item-row"><span>Produk utama</span><strong>{formatRupiah(preview.product.price)}</strong></div>}
        {preview?.ok && preview.selectedAddons.map((addon) => <div className="dpf-cart-item-row" key={addon.id}><span>{addon.title}</span><strong>{formatRupiah(addon.price)}</strong></div>)}
        <button className="dpf-text-button" type="button" onClick={clearCartSelection}>Hapus pilihan</button>
      </section>
      <aside className="dpf-summary-panel">
        <span className="dpf-kicker">RINGKASAN</span>
        <h2>{mode === "cart" ? "Ringkasan keranjang" : "Ringkasan checkout"}</h2>
        {preview?.ok ? <>
          <div className="dpf-summary-row"><span>Produk utama</span><strong>{formatRupiah(preview.product.price)}</strong></div>
          {preview.selectedAddons.map((addon) => <div className="dpf-summary-row" key={addon.id}><span>{addon.title}</span><strong>{formatRupiah(addon.price)}</strong></div>)}
          <div className="dpf-summary-total"><span>Estimasi total</span><strong>{formatRupiah(preview.estimatedDisplayTotal)}</strong></div>
        </> : <div className="dpf-summary-loading">{preview ? "Katalog tidak menemukan pilihan ini." : "Menghitung estimasi tampilan..."}</div>}
        <p className="dpf-estimate-note">Estimasi tampilan dari katalog. Ini bukan total transaksi Commerce.</p>
        {mode === "cart" ? <Link className="dpf-button dpf-button-wide" href="/checkout">Lanjut ke checkout <span aria-hidden="true">→</span></Link> : <>
          <div className="dpf-checkout-context"><span>AKUN</span><p>Checkout memerlukan akun saat integrasi Commerce tersedia.</p><Link href="/login?next=%2Fcheckout">Masuk ke akun <span aria-hidden="true">↗</span></Link></div>
          <button className="dpf-button dpf-button-wide" type="button" disabled>Pembayaran belum tersedia</button>
        </>}
        <Link href="/produk" className="dpf-back-link">← Kembali ke katalog</Link>
      </aside>
    </div>
  );
}