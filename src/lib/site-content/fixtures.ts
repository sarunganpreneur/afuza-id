import type { SiteContentV1 } from "./schema";

const base = (name: string, slug: string, heroTitle: string): SiteContentV1 => ({
  schemaVersion: "site_content_v1",
  site: { name, slug, description: `${name} untuk kebutuhan Anda.`, whatsapp: "081234567890" },
  seo: { title: name, description: `${name} - informasi resmi`, image: "/images/og.jpg" },
  theme: {
    style: "editorial",
    primaryColor: "#123456",
    accentColor: "#F59E0B",
    fontStyle: "sans",
    borderRadius: "md",
    density: "comfortable",
  },
  header: { navigation: [{ label: "Tentang", target: "about" }, { label: "Kontak", target: "contact" }] },
  sections: [
    { id: "hero", type: "hero", title: heroTitle, body: `Kenali ${name}.`, image: "/images/hero.jpg", cta: { label: "Hubungi kami", kind: "whatsapp", target: "081234567890" } },
    { id: "about", type: "about", title: "Tentang kami", body: `Cerita ${name} dan cara kami membantu pelanggan.` },
    { id: "contact", type: "contact", title: "Hubungi kami", body: "Kami siap membantu.", email: "halo@example.com", cta: { label: "Kirim email", kind: "email", target: "halo@example.com" } },
  ],
  footer: { description: `Informasi ${name}.`, links: [{ label: "Beranda", target: "hero" }], copyright: "2026" },
});

export const validSiteContentFixtures: Record<string, SiteContentV1> = {
  umkmKuliner: base("Dapur Rasa", "dapur-rasa", "Masakan rumahan untuk hari istimewa"),
  jasaSertifikasiHalal: base("HalalPro", "halalpro", "Pendampingan sertifikasi halal yang jelas"),
  sekolahPesantren: base("Pesantren Cendekia", "pesantren-cendekia", "Belajar dan bertumbuh bersama"),
  produk: base("Ruang Kerja", "ruang-kerja", "Peralatan kerja yang dibuat untuk fokus"),
  event: base("Festival Kota", "festival-kota", "Satu hari penuh karya dan cerita"),
  kursus: base("Kelas Bahasa", "kelas-bahasa", "Belajar bahasa dengan langkah nyata"),
  properti: base("Rumah Asri", "rumah-asri", "Temukan ruang yang terasa seperti rumah"),
};