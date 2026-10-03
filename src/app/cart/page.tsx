import type { Metadata } from "next";
import { CartExperience } from "@/components/dpf/storefront/CartExperience";
import { StorefrontChrome } from "@/components/dpf/storefront/StorefrontChrome";

export const metadata: Metadata = { title: "Keranjang | Afuza.id" };

export default function CartPage() {
  return <StorefrontChrome><main className="dpf-shell dpf-flow-page"><p className="dpf-kicker">LANGKAH 01 / PILIHAN</p><h1>Keranjang <em>Anda.</em></h1><CartExperience mode="cart" /></main></StorefrontChrome>;
}