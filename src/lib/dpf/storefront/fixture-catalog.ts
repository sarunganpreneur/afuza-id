import type { Product, ProductAddon, ProductCategory, ProductPresentation } from "./types";

const fixtureTimestamp = "2026-10-04T00:00:00.000Z";

const niches = [
  { name: "UMKM", buyer: "Pemilik usaha kecil", code: "UMKM" },
  { name: "Pendidikan", buyer: "Guru dan tenaga pengajar", code: "EDU" },
  { name: "Rumah Tangga", buyer: "Keluarga dan orang tua", code: "HOME" },
  { name: "Freelancer", buyer: "Pekerja mandiri", code: "FREE" },
  { name: "Event", buyer: "Penyelenggara acara", code: "EVENT" },
  { name: "Karier", buyer: "Pencari kerja dan profesional", code: "CAREER" },
] as const;

const masterCatalog = [
  {
    code: "BOOK",
    type: "Spreadsheet",
    titles: ["Pembukuan Usaha Digital untuk UMKM", "Administrasi Keuangan Kelas", "Anggaran Rumah Tangga Keluarga", "Pencatatan Keuangan Freelancer", "Pencatatan Event Praktis", "Tracker Keuangan Pencari Kerja"],
    categories: ["Bisnis & UMKM", "Pendidikan", "Productivity", "Karier", "Event & Invitation", "Karier"],
    subcategory: "Keuangan",
    price: 19_000,
    problem: "Catatan pemasukan dan pengeluaran tersebar di banyak tempat.",
    useCase: "Mencatat transaksi dan melihat ringkasan keuangan dengan lebih teratur.",
    formats: ["XLSX", "Google Sheets"],
    keywords: ["pembukuan", "keuangan", "catatan transaksi"],
    tone: "green",
  },
  {
    code: "HPP",
    type: "Spreadsheet",
    titles: ["Kalkulator HPP & Harga Jual UMKM", "Kalkulator Anggaran Kelas", "Kalkulator Harga Produk Rumahan", "Kalkulator Tarif Jasa Freelancer", "Kalkulator Anggaran Event", "Kalkulator Target Gaji Karier"],
    categories: ["Bisnis & UMKM", "Pendidikan", "Anak & Worksheet", "Karier", "Event & Invitation", "Productivity"],
    subcategory: "Perencanaan",
    price: 19_000,
    problem: "Perhitungan biaya dan target harga sulit dibandingkan dengan cepat.",
    useCase: "Menyusun komponen biaya dan meninjau hasil perhitungan dalam satu lembar kerja.",
    formats: ["XLSX"],
    keywords: ["kalkulator", "perencanaan", "harga", "anggaran"],
    tone: "yellow",
  },
  {
    code: "ADMIN",
    type: "Template digital",
    titles: ["Business Admin Kit UMKM", "Admin Kit Kelas", "Admin Kit Keluarga", "Admin Kit Freelancer", "Admin Kit Penyelenggara Event", "Admin Kit Pencari Kerja"],
    categories: ["Bisnis & UMKM", "Pendidikan", "Anak & Worksheet", "Productivity", "Event & Invitation", "Karier"],
    subcategory: "Administrasi",
    price: 29_000,
    problem: "Dokumen rutin belum memiliki susunan yang mudah digunakan kembali.",
    useCase: "Mengelola dokumen dan checklist kerja rutin dari template yang terstruktur.",
    formats: ["DOCX", "PDF"],
    keywords: ["administrasi", "template", "checklist"],
    tone: "blue",
  },
  {
    code: "CANVA",
    type: "Template Canva",
    titles: ["Canva Marketing Kit UMKM", "Canva Kit Kelas", "Canva Kit Keluarga", "Canva Kit Freelancer", "Canva Kit Event", "Canva Kit Personal Branding"],
    categories: ["Marketing", "Marketing", "Design & Creative", "Design & Creative", "Event & Invitation", "Karier"],
    subcategory: "Konten visual",
    price: 25_000,
    problem: "Materi visual perlu disusun dari awal untuk setiap kebutuhan.",
    useCase: "Menyesuaikan template visual untuk kebutuhan publikasi dan komunikasi.",
    formats: ["Canva", "PDF"],
    keywords: ["canva", "desain", "konten", "marketing"],
    tone: "coral",
  },
  {
    code: "WORK",
    type: "Worksheet digital",
    titles: ["Worksheet Produktivitas UMKM", "Worksheet Belajar Terstruktur", "Worksheet Aktivitas Anak", "Worksheet Rencana Kerja Mandiri", "Worksheet Persiapan Event", "Worksheet Persiapan Karier"],
    categories: ["Productivity", "Pendidikan", "Anak & Worksheet", "Productivity", "Event & Invitation", "Karier"],
    subcategory: "Worksheet",
    price: 15_000,
    problem: "Langkah kerja atau kegiatan belajar sulit diikuti secara konsisten.",
    useCase: "Mengikuti aktivitas dengan lembar kerja yang dapat dicetak atau diisi digital.",
    formats: ["PDF", "Printable"],
    keywords: ["worksheet", "printable", "aktivitas", "perencanaan"],
    tone: "ink",
  },
] as const;

function toSlug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const productRows: Product[] = masterCatalog.flatMap((master) =>
  niches.map((niche, index) => {
    const title = master.titles[index];
    const sku = `AFZ-DPF-${master.code}-${niche.code}-001`;
    const id = `dpf-${master.code.toLowerCase()}-${niche.code.toLowerCase()}`;
    const category = master.categories[index] as ProductCategory;
    const isFlagship = master.code === "HPP" && niche.code === "UMKM";
    return {
      id,
      sku: isFlagship ? "AFZ-SPR-HPP-001" : sku,
      slug: isFlagship ? "kalkulator-hpp-harga-jual-umkm" : toSlug(title),
      title,
      shortTitle: title,
      headline: isFlagship ? "Hitung HPP dan harga jual untuk usaha mikro dan kecil." : `${title} untuk membantu ${niche.buyer.toLowerCase()} bekerja lebih teratur.`,
      description: isFlagship ? "Susun komponen biaya produk dan tinjau perhitungan harga jual dalam satu spreadsheet yang mudah disesuaikan." : `${master.useCase} Disusun untuk kebutuhan ${niche.name.toLowerCase()}.`,
      category,
      subcategory: isFlagship ? "Keuangan" : master.subcategory,
      niche: niche.name,
      buyer: niche.buyer,
      problem: isFlagship ? "Sulit menghitung HPP dan harga jual yang tepat." : master.problem,
      useCase: isFlagship ? "Membantu pemilik usaha menentukan harga jual yang sehat." : master.useCase,
      productType: master.type,
      format: [...master.formats],
      price: master.price,
      trafficRole: "ACQUISITION",
      status: "PUBLISHED",
      previewAssets: [],
      deliveryAssets: [],
      keywords: isFlagship ? ["hpp", "harga jual", "umkm", "kalkulator biaya"] : [...master.keywords, niche.name.toLowerCase()],
      seoTitle: title,
      seoDescription: master.useCase,
      publishedAt: fixtureTimestamp,
      createdAt: fixtureTimestamp,
      updatedAt: fixtureTimestamp,
    };
  }),
);

const inventoryProduct: Product = {
  id: "dpf-inventory-umkm",
  sku: "AFZ-DPF-INVENTORY-UMKM-001",
  slug: "inventory-tracker-umkm",
  title: "Inventory Tracker UMKM",
  shortTitle: "Inventory Tracker",
  headline: "Catat stok barang dan pergerakannya dengan rapi.",
  description: "Spreadsheet untuk mencatat stok masuk, stok keluar, dan saldo barang.",
  category: "Bisnis & UMKM",
  subcategory: "Operasional",
  niche: "UMKM",
  buyer: "Pemilik usaha kecil",
  problem: "Perubahan stok sulit ditelusuri dari catatan yang terpisah.",
  useCase: "Mencatat pergerakan dan saldo stok secara berkala.",
  productType: "Spreadsheet",
  format: ["XLSX", "Google Sheets"],
  price: 15_000,
  trafficRole: "ADD_ON",
  status: "PUBLISHED",
  previewAssets: [],
  deliveryAssets: [],
  keywords: ["inventory", "stok", "umkm", "tracker"],
  publishedAt: fixtureTimestamp,
  createdAt: fixtureTimestamp,
  updatedAt: fixtureTimestamp,
};

export const fixtureProducts: Product[] = [...productRows, inventoryProduct];

export const fixtureProductAddons: ProductAddon[] = [
  {
    id: "addon-bookkeeping-umkm",
    productId: "dpf-hpp-umkm",
    addonProductId: "dpf-book-umkm",
    title: "Pembukuan Usaha",
    description: "Template pencatatan transaksi usaha harian.",
    price: 19_000,
    active: true,
    sortOrder: 1,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  },
  {
    id: "addon-inventory-umkm",
    productId: "dpf-hpp-umkm",
    addonProductId: inventoryProduct.id,
    title: "Inventory Tracker",
    description: "Tracker stok barang dan pergerakan persediaan.",
    price: 15_000,
    active: true,
    sortOrder: 2,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  },
];

export const fixturePresentations: ProductPresentation[] = fixtureProducts.map((product) => {
  const master = masterCatalog.find((candidate) => product.sku.includes(candidate.code)) ?? masterCatalog[4];
  const isFlagship = product.id === "dpf-hpp-umkm";
  return {
    productId: product.id,
    benefits: isFlagship
      ? ["Rinci komponen biaya produk.", "Bandingkan beberapa skenario harga.", "Simpan perhitungan dalam spreadsheet yang dapat disesuaikan."]
      : [product.useCase, "Gunakan format yang dapat disesuaikan.", "Simpan pekerjaan dalam satu file terstruktur."],
    included: isFlagship
      ? ["Kalkulator HPP", "Lembar simulasi harga jual", "Petunjuk penggunaan"]
      : [`File ${product.productType}`, `Format ${product.format.join(" dan ")}`, "Petunjuk penggunaan"],
    suitableFor: [product.buyer, `Pengguna di niche ${product.niche}`],
    previewLabel: isFlagship ? "HPP / PRICE PLANNER" : master.code,
    coverTone: isFlagship ? "yellow" : master.tone,
    faqs: [
      { question: "Bagaimana produk diterima?", answer: "Akses dan delivery digital akan tersedia setelah integrasi Commerce dan fulfillment." },
      { question: "Apakah file dapat disesuaikan?", answer: "Format dan isi yang tercantum pada halaman produk menjadi acuan penyesuaian." },
    ],
  };
});

export const fixtureCatalogCount = fixtureProducts.length;