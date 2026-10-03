import Link from "next/link";
import type { ReactNode } from "react";

export function StorefrontChrome({ children }: { children: ReactNode }) {
  return (
    <div className="dpf-storefront">
      <header className="dpf-header">
        <div className="dpf-shell dpf-header-inner">
          <Link href="/" className="dpf-brand" aria-label="Afuza.id beranda">
            <span className="dpf-brand-mark" aria-hidden="true">a</span>
            <span>afuza<span>.id</span></span>
          </Link>
          <nav className="dpf-nav" aria-label="Navigasi produk digital">
            <Link href="/produk">Produk</Link>
            <Link href="/akun/produk">Produk Saya</Link>
          </nav>
          <Link href="/cart" className="dpf-cart-link" aria-label="Buka keranjang">
            <span aria-hidden="true">Bag</span>
            <span>Keranjang</span>
          </Link>
        </div>
      </header>
      {children}
      <footer className="dpf-footer">
        <div className="dpf-shell dpf-footer-inner">
          <Link href="/" className="dpf-footer-brand">AFUZA.ID</Link>
          <span>Produk digital untuk kerja yang lebih tertata.</span>
          <Link href="/produk">Jelajahi katalog <span aria-hidden="true">→</span></Link>
        </div>
      </footer>
    </div>
  );
}

export function ProductCard({ product }: { product: import("@/lib/dpf/storefront").ProductCardViewModel }) {
  return (
    <article className="dpf-product-card">
      <Link href={`/produk/${product.slug}`} className={`dpf-product-cover dpf-tone-${product.coverTone}`} aria-label={`Lihat ${product.title}`}>
        <span className="dpf-cover-label">{product.previewLabel}</span>
        <span className="dpf-cover-glyph" aria-hidden="true">{product.title.slice(0, 1)}</span>
        <span className="dpf-cover-category">{product.category}</span>
      </Link>
      <div className="dpf-product-card-body">
        <div className="dpf-product-meta"><span>{product.niche}</span><span>{product.format.join(" · ")}</span></div>
        <h2><Link href={`/produk/${product.slug}`}>{product.title}</Link></h2>
        <p>{product.headline}</p>
        <div className="dpf-product-card-bottom">
          <strong>{formatRupiah(product.price)}</strong>
          <Link href={`/produk/${product.slug}`} aria-label={`Lihat detail ${product.title}`} className="dpf-round-arrow">↗</Link>
        </div>
      </div>
    </article>
  );
}

import { formatRupiah } from "@/lib/dpf/storefront/format";