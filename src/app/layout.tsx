import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Afuza.id | AI Business Operating System",
  description:
    "Afuza membantu bisnis menemukan peluang, membangun produk, mendapatkan customer, menjalankan penjualan, dan mengembangkan bisnis dalam satu AI Business Operating System.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
      return <html lang="id"><body>{children}</body></html>;
}
