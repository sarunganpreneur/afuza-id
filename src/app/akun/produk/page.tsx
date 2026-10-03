import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StorefrontChrome } from "@/components/dpf/storefront/StorefrontChrome";
import { ProductDownloadAccess } from "@/components/dpf/storefront/ProductDownloadAccess";
import { createClient } from "@/lib/supabase/server";
import { storefrontAdapters } from "@/lib/dpf/storefront";

export const metadata: Metadata = { title: "Produk Saya | Afuza.id" };

export default async function MyProductsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fakun%2Fproduk");

  const ownedProducts = await storefrontAdapters.myProducts.listOwnedProducts(user.id);
  return (
    <StorefrontChrome>
      <main className="dpf-shell dpf-flow-page dpf-account-products">
        <p className="dpf-kicker">AKUN / PRODUK DIGITAL</p>
        <h1>Produk <em>saya.</em></h1>
        {ownedProducts.length ? <div className="dpf-owned-list">{ownedProducts.map(({ product, accessLabel }) => <article key={product.id}><div><span className="dpf-kicker">{product.category}</span><h2>{product.title}</h2><p>{accessLabel}</p></div><ProductDownloadAccess productId={product.id} /></article>)}</div> : <div className="dpf-empty-state"><span className="dpf-empty-index">KOLEKSI DIGITAL</span><h2>Belum ada produk di koleksi Anda.</h2><p>Produk dengan akses aktif akan muncul di sini setelah pembelian dan entitlements berhasil terdaftar.</p><Link className="dpf-button" href="/produk">Jelajahi katalog <span aria-hidden="true">→</span></Link></div>}
      </main>
    </StorefrontChrome>
  );
}