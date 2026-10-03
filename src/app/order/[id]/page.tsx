import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StorefrontChrome } from "@/components/dpf/storefront/StorefrontChrome";
import { storefrontAdapters } from "@/lib/dpf/storefront";

export const metadata: Metadata = { title: "Status Pesanan | Afuza.id" };

export default async function OrderStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await storefrontAdapters.orders.getOrderStatus(id);
  if (!order) notFound();
  return (
    <StorefrontChrome>
      <main className="dpf-shell dpf-order-page">
        <p className="dpf-kicker">STATUS PESANAN</p>
        <div className="dpf-order-status-mark" aria-hidden="true">i</div>
        <h1>{order.reference}</h1>
        <p className="dpf-order-message">{order.message}</p>
        <div className="dpf-order-state"><span>Status</span><strong>Pratinjau saja</strong><small>Tidak ada pembayaran atau pesanan nyata yang dibuat.</small></div>
        <Link className="dpf-button" href="/produk">Kembali ke katalog <span aria-hidden="true">→</span></Link>
      </main>
    </StorefrontChrome>
  );
}