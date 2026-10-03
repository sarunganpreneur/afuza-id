"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CheckoutPreviewResult } from "@/lib/dpf/storefront";
import { formatRupiah } from "@/lib/dpf/storefront/format";
import { clearCartSelection, getCartSnapshot, subscribeToCart } from "./cart-storage";

type CartExperienceProps = { mode: "cart" | "checkout" };
type CreatedOrder = {
  id: string;
  reference: string;
  status: string;
  total: number;
};

export function CartExperience({ mode }: CartExperienceProps) {
  const selection = useSyncExternalStore(subscribeToCart, getCartSnapshot, () => null);
  const [previewState, setPreviewState] = useState<{ key: string; result: CheckoutPreviewResult } | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectionKey = selection ? `${selection.productId}:${selection.selectedAddonIds.join(",")}` : "";

  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    fetch("/api/storefront/selection-summary", {
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

  async function createOrder() {
    if (!selection || submitting) return;
    setSubmitting(true);
    setCheckoutError(null);
    const storageKey = `afuza.dpf.checkout.${selectionKey}`;
    let idempotencyKey = window.sessionStorage.getItem(storageKey);
    if (!idempotencyKey) {
      idempotencyKey = window.crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, idempotencyKey);
    }
    try {
      const response = await fetch("/api/storefront/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: selection.productId,
          addonIds: selection.selectedAddonIds,
          idempotencyKey,
        }),
      });
      const result = await response.json() as { order?: CreatedOrder; error?: string };
      if (!response.ok || !result.order) throw new Error(result.error ?? "Checkout tidak dapat diproses.");
      setCreatedOrder(result.order);
      window.sessionStorage.removeItem(storageKey);
      clearCartSelection();
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout tidak dapat diproses.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "checkout" && createdOrder) {
    return (
      <div className="dpf-empty-state" role="status">
        <span className="dpf-empty-index">PESANAN DIBUAT</span>
        <h2>{createdOrder.reference}</h2>
        <p>Total Commerce: <strong>{formatRupiah(createdOrder.total)}</strong></p>
        <p>Status pesanan: {createdOrder.status === "AWAITING_PAYMENT" ? "Menunggu pembayaran" : createdOrder.status}</p>
        <Link className="dpf-button" href={`/order/${createdOrder.id}`}>Lihat pesanan <span aria-hidden="true">→</span></Link>
      </div>
    );
  }

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

  return (
    <div className="dpf-cart-layout">
      <section className="dpf-cart-lines" aria-label="Pilihan produk">
        <div className="dpf-cart-product-cover"><span>{preview?.ok ? preview.product.previewLabel : "PRODUK DIGITAL"}</span><b aria-hidden="true">{preview?.ok ? preview.product.title.slice(0, 1) : "A"}</b></div>
        <div className="dpf-cart-product-heading"><div><span className="dpf-kicker">{preview?.ok ? preview.product.category : "Memeriksa katalog"}</span><h2>{preview?.ok ? preview.product.title : "Memuat ringkasan pilihan"}</h2></div><Link href={preview?.ok ? `/produk/${preview.product.slug}` : "/produk"}>Ubah pilihan</Link></div>
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
        <p className="dpf-estimate-note">Estimasi katalog sebelum checkout. Total pesanan ditetapkan oleh Commerce.</p>
        {mode === "cart" ? <Link className="dpf-button dpf-button-wide" href="/checkout">Lanjut ke checkout <span aria-hidden="true">→</span></Link> : <>
          <div className="dpf-checkout-context"><span>AKUN</span><p>Pesanan akan dibuat untuk akun yang sedang masuk.</p><Link href="/login?next=%2Fcheckout">Masuk ke akun <span aria-hidden="true">↗</span></Link></div>
          {checkoutError && <p role="alert">{checkoutError}</p>}
          <button className="dpf-button dpf-button-wide" type="button" onClick={createOrder} disabled={submitting}>
            {submitting ? "Membuat pesanan..." : "Buat pesanan"}
          </button>
        </>}
        <Link href="/produk" className="dpf-back-link">← Kembali ke katalog</Link>
      </aside>
    </div>
  );
}