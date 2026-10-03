import type { Metadata } from "next";
import { CartExperience } from "@/components/dpf/storefront/CartExperience";
import { StorefrontChrome } from "@/components/dpf/storefront/StorefrontChrome";

export const metadata: Metadata = { title: "Checkout | Afuza.id" };

export default function CheckoutPage() {
  return <StorefrontChrome><main className="dpf-shell dpf-flow-page"><p className="dpf-kicker">LANGKAH 02 / CHECKOUT</p><h1>Periksa pilihan <em>Anda.</em></h1><div className="dpf-integration-notice"><span aria-hidden="true">i</span><p>Pesanan dibuat oleh Commerce setelah Anda masuk. Harga final mengikuti katalog dan snapshot pesanan dari server.</p></div><CartExperience mode="checkout" /></main></StorefrontChrome>;
}