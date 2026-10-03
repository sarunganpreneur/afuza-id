import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StorefrontChrome } from "@/components/dpf/storefront/StorefrontChrome";
import { TestPaymentButton } from "@/components/dpf/storefront/TestPaymentButton";
import { createClient } from "@/lib/supabase/server";
import { storefrontAdapters } from "@/lib/dpf/storefront";
import { getEnabledTestPaymentAdapter } from "@/lib/commerce/payment-adapter";
import { formatRupiah } from "@/lib/dpf/storefront/format";

export const metadata: Metadata = { title: "Status Pesanan | Afuza.id" };

export default async function OrderStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { id } = await params;
  const order = await storefrontAdapters.orders.getOrderStatus(id);
  if (!order) notFound();
  const statusLabels = {
    PENDING: "Menunggu diproses",
    AWAITING_PAYMENT: "Menunggu pembayaran",
    PAID: "Lunas",
    FAILED: "Pembayaran gagal",
    CANCELLED: "Dibatalkan",
  } as const;

  return (
    <StorefrontChrome>
      <main className="dpf-shell dpf-order-page">
        <p className="dpf-kicker">STATUS PESANAN</p>
        <div className="dpf-order-status-mark" aria-hidden="true">i</div>
        <h1>{order.reference}</h1>
        <p className="dpf-order-message">{order.message}</p>
        <div className="dpf-order-state">
          <span>Status</span>
          <strong>{statusLabels[order.state]}</strong>
          {order.total !== undefined && <small>Total Commerce: {formatRupiah(order.total)}</small>}
        </div>
        {order.state === "AWAITING_PAYMENT" && getEnabledTestPaymentAdapter() && <TestPaymentButton orderId={order.id} />}
        {order.state === "PAID" && <Link className="dpf-button" href="/akun/produk">Buka Produk Saya <span aria-hidden="true">→</span></Link>}
        <Link className="dpf-button" href="/produk">Kembali ke katalog <span aria-hidden="true">→</span></Link>
      </main>
    </StorefrontChrome>
  );
}