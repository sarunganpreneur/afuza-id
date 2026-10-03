import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard, StorefrontChrome } from "@/components/dpf/storefront/StorefrontChrome";
import { ProductDetailActions } from "@/components/dpf/storefront/ProductDetailActions";
import { noOpStorefrontAnalytics } from "@/lib/dpf/storefront/analytics";
import { formatRupiah } from "@/lib/dpf/storefront/format";
import { storefrontAdapters } from "@/lib/dpf/storefront";

type RouteProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await storefrontAdapters.catalog.getProductBySlug(slug);
  if (!product) return {};
  return { title: `${product.title} | Afuza.id`, description: product.seoDescription ?? product.headline };
}

export default async function ProductDetailPage({ params }: RouteProps) {
  const { slug } = await params;
  const product = await storefrontAdapters.catalog.getProductBySlug(slug);
  if (!product) notFound();
  const [addons, related] = await Promise.all([
    storefrontAdapters.catalog.getVisibleAddons(product.id),
    storefrontAdapters.catalog.getRelatedProducts(product.id, 3),
  ]);
  noOpStorefrontAnalytics.track({ event: "product_view", productId: product.id, sku: product.sku, category: product.category, niche: product.niche, price: product.price });

  return (
    <StorefrontChrome>
      <main className="dpf-shell dpf-detail-page">
        <nav className="dpf-breadcrumb" aria-label="Breadcrumb"><Link href="/produk">Produk</Link><span>/</span><span>{product.category}</span></nav>
        <section className="dpf-detail-hero">
          <div className={`dpf-detail-cover dpf-tone-${product.presentation.coverTone}`}>
            <div className="dpf-detail-cover-top"><span>{product.presentation.previewLabel}</span><span>AFUZA / V1</span></div>
            <div className="dpf-detail-cover-main"><span className="dpf-cover-glyph" aria-hidden="true">{product.title.slice(0, 1)}</span><strong>{product.shortTitle ?? product.title}</strong><small>{product.format.join(" · ")}</small></div>
            <div className="dpf-detail-cover-bottom"><span>{product.category}</span><span>{product.niche}</span></div>
          </div>
          <div className="dpf-detail-summary">
            <p className="dpf-kicker">{product.category} <span>/</span> {product.niche}</p>
            <h1>{product.title}</h1>
            <p className="dpf-detail-headline">{product.headline}</p>
            <p className="dpf-detail-description">{product.description}</p>
            <div className="dpf-detail-price"><strong>{formatRupiah(product.price)}</strong><span>Pembelian satu kali · produk digital</span></div>
            <div className="dpf-detail-facts"><span>{product.format.join(" · ")}</span><span>{product.productType}</span><span>Untuk {product.buyer.toLowerCase()}</span></div>
            <a className="dpf-inline-link" href="#pilih-produk">Lihat isi produk <span aria-hidden="true">↓</span></a>
          </div>
        </section>
        <section className="dpf-detail-columns" id="pilih-produk">
          <div className="dpf-detail-content">
            <div className="dpf-content-section"><p className="dpf-kicker">YANG BISA DIBANTU</p><h2>Dirancang untuk kebutuhan yang jelas.</h2><ul className="dpf-check-list">{product.presentation.benefits.map((benefit) => <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul></div>
            <div className="dpf-content-section dpf-included-section"><p className="dpf-kicker">DI DALAM PRODUK</p><h2>Apa yang termasuk</h2><ul className="dpf-included-list">{product.presentation.included.map((item, index) => <li key={item}><span>0{index + 1}</span><strong>{item}</strong></li>)}</ul></div>
            <div className="dpf-content-section"><p className="dpf-kicker">COCOK UNTUK</p><div className="dpf-suitable-list">{product.presentation.suitableFor.map((item) => <span key={item}>{item}</span>)}</div></div>
            <div className="dpf-content-section dpf-faq-section"><p className="dpf-kicker">FAQ</p><h2>Pertanyaan umum</h2>{product.presentation.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div>
          </div>
          <aside className="dpf-detail-aside"><ProductDetailActions product={product} addons={addons} /></aside>
        </section>
        {related.length > 0 && <section className="dpf-related-section"><div className="dpf-section-heading"><div><p className="dpf-kicker">LANJUTKAN EKSPLORASI</p><h2>Produk terkait</h2></div><Link href="/produk" className="dpf-text-link">Semua produk <span aria-hidden="true">→</span></Link></div><div className="dpf-product-grid dpf-related-grid">{related.map((item) => <ProductCard product={item} key={item.id} />)}</div></section>}
      </main>
    </StorefrontChrome>
  );
}