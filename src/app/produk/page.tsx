import Link from "next/link";
import type { Metadata } from "next";
import { ProductCard, StorefrontChrome } from "@/components/dpf/storefront/StorefrontChrome";
import { noOpStorefrontAnalytics } from "@/lib/dpf/storefront/analytics";
import { PRODUCT_CATEGORIES, storefrontAdapters } from "@/lib/dpf/storefront";

export const metadata: Metadata = {
  title: "Produk Digital | Afuza.id",
  description: "Jelajahi template, spreadsheet, dan worksheet digital untuk kerja yang lebih teratur.",
};

type SearchParams = { q?: string; category?: string; niche?: string; page?: string };

function pageHref(params: SearchParams, page: number) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.niche) search.set("niche", params.niche);
  search.set("page", String(page));
  return `/produk?${search.toString()}`;
}

export default async function ProductCatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const [catalog, niches] = await Promise.all([
    storefrontAdapters.catalog.listProducts({ q: params.q, category: params.category, niche: params.niche, page: safePage, pageSize: 12 }),
    storefrontAdapters.catalog.getNiches(),
  ]);
  if (params.q || params.category || params.niche) {
    noOpStorefrontAnalytics.track({ event: "search", query: params.q ?? "", category: params.category, niche: params.niche, resultCount: catalog.total });
  }

  return (
    <StorefrontChrome>
      <main className="dpf-shell dpf-catalog-page">
        <div className="dpf-catalog-intro">
          <div><p className="dpf-kicker"><span className="dpf-kicker-mark" /> AFUZA / DIGITAL GOODS</p><h1>Perangkat kecil,<br /><em>kerja lebih tertata.</em></h1></div>
          <p className="dpf-catalog-lede">Template, kalkulator, dan lembar kerja digital untuk kebutuhan bisnis dan keseharian.</p>
        </div>
        <form className="dpf-catalog-filters" action="/produk" method="get">
          <label className="dpf-search-field"><span aria-hidden="true">⌕</span><input type="search" name="q" defaultValue={params.q} placeholder="Cari produk, kebutuhan, atau kata kunci" aria-label="Cari produk" /></label>
          <label className="dpf-filter-field"><span>Kategori</span><select name="category" defaultValue={params.category ?? ""}><option value="">Semua kategori</option>{PRODUCT_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}</select></label>
          <label className="dpf-filter-field"><span>Niche</span><select name="niche" defaultValue={params.niche ?? ""}><option value="">Semua niche</option>{niches.map((niche) => <option value={niche} key={niche}>{niche}</option>)}</select></label>
          <button className="dpf-filter-submit" type="submit">Cari <span aria-hidden="true">→</span></button>
        </form>
        <div className="dpf-results-heading"><span>{catalog.total} produk ditemukan</span><span>Halaman {catalog.page} dari {Math.max(catalog.pageCount, 1)}</span></div>
        {catalog.items.length ? <div className="dpf-product-grid">{catalog.items.map((product) => <ProductCard product={product} key={product.id} />)}</div> : <div className="dpf-empty-catalog"><span className="dpf-empty-index">HASIL PENCARIAN</span><h2>Belum ada produk yang cocok.</h2><p>Coba kata kunci atau filter kategori yang berbeda.</p><Link href="/produk" className="dpf-text-link">Hapus semua filter <span aria-hidden="true">→</span></Link></div>}
        {catalog.pageCount > 1 && <nav className="dpf-pagination" aria-label="Halaman katalog">
          {catalog.page > 1 ? <Link href={pageHref(params, catalog.page - 1)} aria-label="Halaman sebelumnya">← Sebelumnya</Link> : <span />}
          <span>{catalog.page} / {catalog.pageCount}</span>
          {catalog.page < catalog.pageCount ? <Link href={pageHref(params, catalog.page + 1)} aria-label="Halaman berikutnya">Berikutnya →</Link> : <span />}
        </nav>}
      </main>
    </StorefrontChrome>
  );
}