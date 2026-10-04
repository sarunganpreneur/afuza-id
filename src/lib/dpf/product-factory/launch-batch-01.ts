export const FACTORY_VERSION = "1.0.0" as const;
export const NICHE_SOURCE = "V1_FALLBACK" as const;
export const NICHE_SPECIFICITY_THRESHOLD = 60;

export type MasterDefinition = {
  masterId: string;
  master_id: string;
  masterCode: string;
  master_code: string;
  version: string;
  name: string;
  shortName: string;
  short_name: string;
  category: string;
  purpose: string;
  standalonePriceIdr: number;
  standalone_price_idr: number;
  optionalFutureAddonOfferPriceIdr?: number;
  optional_future_addon_offer_price_idr?: number;
  requiredInputs: string[];
  required_inputs: string[];
  requiredFeatures: string[];
  required_features: string[];
  requiredOutputs: string[];
  required_outputs: string[];
  assetContract: string[];
  asset_contract: string[];
  generationRules: string[];
  generation_rules: string[];
  validationRules: string[];
  validation_rules: string[];
};

export type NicheProfile = {
  nicheId: string;
  niche_id: string;
  nicheCode: string;
  niche_code: string;
  name: string;
  audience: string;
  businessModel: string;
  business_model: string;
  costComponents: string[];
  cost_components: string[];
  revenuePatterns: string[];
  revenue_patterns: string[];
  inventoryPatterns: string[];
  inventory_patterns: string[];
  adminNeeds: string[];
  admin_needs: string[];
  marketingNeeds: string[];
  marketing_needs: string[];
  terminologyMap: Record<string, string>;
  terminology_map: Record<string, string>;
  exampleDataProfile: Record<string, string | number | boolean | string[]>;
  example_data_profile: Record<string, string | number | boolean | string[]>;
};

export type DpfProduct = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  shortTitle: string;
  headline: string;
  description: string;
  category: string;
  subcategory: string;
  niche: string;
  nicheId: string;
  niche_id: string;
  buyer: string;
  problem: string;
  useCase: string;
  use_case: string;
  productType: string;
  product_type: string;
  format: string[];
  formats: string[];
  price: number;
  addonMasterId?: string;
  addonNicheId?: string;
  standalonePriceIdr: number;
  standalone_price_idr: number;
  futureAddonOfferPriceIdr?: number;
  future_addon_offer_price_idr?: number;
  trafficRole: "ACQUISITION" | "MONETIZATION" | "ADD_ON" | "SEO_LONGTAIL";
  status: "DRAFT" | "READY" | "PUBLISHED" | "TESTING";
  keywords: string[];
  tags: string[];
  masterId: string;
  master_id: string;
  masterCode: string;
  master_code: string;
  version: string;
  factoryVersion: string;
  masterVersion: string;
  nicheVersion: string;
  masterVersionLabel: string;
  nicheVersionLabel: string;
  requiredInputs: string[];
  required_inputs: string[];
  features: string[];
  requiredOutputs: string[];
  required_outputs: string[];
  assetContract: string[];
  asset_contract: string[];
  validationRules: string[];
  validation_rules: string[];
  relatedProducts: string[];
  compatibility: {
    sameNicheOnly: boolean;
    same_niche_only: boolean;
    allowedMasterIds: string[];
    allowed_master_ids: string[];
    offerMatrix: Record<string, number>;
    relatedSkus: string[];
  };
  generationInput: {
    masterContract: MasterDefinition;
    nicheProfile: NicheProfile;
    terminologyMap: Record<string, string>;
    exampleDataProfile: Record<string, string | number | boolean | string[]>;
    skuIdentity: string;
    pricing: { standalonePriceIdr: number; futureAddonOfferPriceIdr?: number };
    requiredModules: string[];
    requiredFormulas: string[];
    assetRequirements: string[];
    validationRules: string[];
  };
  assetRequirements: string[];
  nicheSpecificityScore: number;
  niche_specificity_score: number;
};

export type ValidationIssue = {
  code: string;
  message: string;
  productSku?: string;
};

export type LaunchBatch01 = {
  batchId: string;
  factoryVersion: string;
  generatedAt: string;
  products: DpfProduct[];
  productCount: number;
};

export type LaunchBatchValidation = {
  valid: boolean;
  summary: {
    masterCount: number;
    nicheCount: number;
    productCount: number;
    validProductCount: number;
    invalidProductCount: number;
    offerMatrix: Record<string, Record<string, number>>;
    nicheSpecificityThreshold: number;
    avgNicheSpecificity: number;
    assetCompleteness: number;
    deterministic: boolean;
  };
  results: Array<{
    productSku: string;
    valid: boolean;
    nicheSpecificityScore: number;
    issues: ValidationIssue[];
  }>;
  issues: ValidationIssue[];
};

export const MASTER_DEFINITIONS: MasterDefinition[] = [
  {
    masterId: "HPP",
    master_id: "HPP",
    masterCode: "HPP",
    master_code: "HPP",
    version: "V1",
    name: "Kalkulator HPP & Harga Jual",
    shortName: "HPP",
    short_name: "HPP",
    category: "pricing",
    purpose: "Menghitung komponen biaya, margin, dan harga jual yang realistis untuk niche tertentu.",
    standalonePriceIdr: 19000,
    standalone_price_idr: 19000,
    optionalFutureAddonOfferPriceIdr: undefined,
    optional_future_addon_offer_price_idr: undefined,
    requiredInputs: ["biaya bahan utama", "biaya overhead", "margin target", "jumlah yield", "biaya kemasan", "biaya tenaga kerja"],
    required_inputs: ["biaya bahan utama", "biaya overhead", "margin target", "jumlah yield", "biaya kemasan", "biaya tenaga kerja"],
    requiredFeatures: ["perhitungan HPP", "simulasi margin", "rekomendasi harga jual", "alokasi biaya operasional"],
    required_features: ["perhitungan HPP", "simulasi margin", "rekomendasi harga jual", "alokasi biaya operasional"],
    requiredOutputs: ["ringkasan biaya", "harga jual rekomendasi", "margin dan profit projection"],
    required_outputs: ["ringkasan biaya", "harga jual rekomendasi", "margin dan profit projection"],
    assetContract: ["calculator workbook", "sample cost data", "pricing guide", "preview metadata", "version metadata"],
    asset_contract: ["calculator workbook", "sample cost data", "pricing guide", "preview metadata", "version metadata"],
    generationRules: ["Gunakan komponen biaya yang relevan dengan niche dan unit operasionalnya.", "Hindari generic cost assumptions yang tidak didukung oleh niche profile.", "Tetapkan harga dasar sesuai master HPP yang telah ditentukan."],
    generation_rules: ["Gunakan komponen biaya yang relevan dengan niche dan unit operasionalnya.", "Hindari generic cost assumptions yang tidak didukung oleh niche profile.", "Tetapkan harga dasar sesuai master HPP yang telah ditentukan."],
    validationRules: ["harga utama harus sama dengan master HPP", "setiap SKU harus memiliki biaya nyata dari niche", "validasi fitur dan output wajib diisi"],
    validation_rules: ["harga utama harus sama dengan master HPP", "setiap SKU harus memiliki biaya nyata dari niche", "validasi fitur dan output wajib diisi"],
  },
  {
    masterId: "BOOK",
    master_id: "BOOK",
    masterCode: "BOOK",
    master_code: "BOOK",
    version: "V1",
    name: "Pembukuan Usaha",
    shortName: "Book",
    short_name: "Book",
    category: "bookkeeping",
    purpose: "Mencatat transaksi, pendapatan, pengeluaran, dan ringkasan finansial operasional bisnis.",
    standalonePriceIdr: 29000,
    standalone_price_idr: 29000,
    optionalFutureAddonOfferPriceIdr: 19000,
    optional_future_addon_offer_price_idr: 19000,
    requiredInputs: ["transaksi harian", "kategori biaya", "pemasukan", "pengeluaran", "saldo kas"],
    required_inputs: ["transaksi harian", "kategori biaya", "pemasukan", "pengeluaran", "saldo kas"],
    requiredFeatures: ["transaksi harian", "laporan bulanan", "ringkasan laba rugi", "analisis biaya"],
    required_features: ["transaksi harian", "laporan bulanan", "ringkasan laba rugi", "analisis biaya"],
    requiredOutputs: ["workbook transaksi", "laporan bulanan", "summary cashflow"],
    required_outputs: ["workbook transaksi", "laporan bulanan", "summary cashflow"],
    assetContract: ["transaction workbook", "monthly summary", "sample transaction data", "usage guide", "version metadata"],
    asset_contract: ["transaction workbook", "monthly summary", "sample transaction data", "usage guide", "version metadata"],
    generationRules: ["Gunakan pola transaksi dan kategori yang relevan dengan niche per sektor.", "Jangan membuat data keuangan yang umum tanpa profil usaha target.", "Sediakan ringkasan yang dapat dipahami oleh pemilik usaha."],
    generation_rules: ["Gunakan pola transaksi dan kategori yang relevan dengan niche per sektor.", "Jangan membuat data keuangan yang umum tanpa profil usaha target.", "Sediakan ringkasan yang dapat dipahami oleh pemilik usaha."],
    validationRules: ["harga utama harus 29000", "transaksi harus spesifik niche", "ringkasan bulanan wajib ada"],
    validation_rules: ["harga utama harus 29000", "transaksi harus spesifik niche", "ringkasan bulanan wajib ada"],
  },
  {
    masterId: "INV",
    master_id: "INV",
    masterCode: "INV",
    master_code: "INV",
    version: "V1",
    name: "Inventory Tracker",
    shortName: "Inv",
    short_name: "Inv",
    category: "inventory",
    purpose: "Memonitor stok barang, pergerakan persediaan, dan pemesanan ulang sederhana.",
    standalonePriceIdr: 25000,
    standalone_price_idr: 25000,
    optionalFutureAddonOfferPriceIdr: 15000,
    optional_future_addon_offer_price_idr: 15000,
    requiredInputs: ["item master", "stok masuk", "stok keluar", "stok minimum", "harga beli"],
    required_inputs: ["item master", "stok masuk", "stok keluar", "stok minimum", "harga beli"],
    requiredFeatures: ["item master", "low-stock alert", "stok per kategori", "nilai persediaan"],
    required_features: ["item master", "low-stock alert", "stok per kategori", "nilai persediaan"],
    requiredOutputs: ["stok saat ini", "laporan mutasi", "ringkasan persediaan"],
    required_outputs: ["stok saat ini", "laporan mutasi", "ringkasan persediaan"],
    assetContract: ["stock workbook", "item master", "movement log", "sample inventory data", "preview metadata"],
    asset_contract: ["stock workbook", "item master", "movement log", "sample inventory data", "preview metadata"],
    generationRules: ["Gunakan unit dan pola stok yang khas tiap niche.", "Sertakan at least one item master dan ringkasan stok tertentu niche.", "Jangan mengganti seluruh struktur hanya dengan nama niche."],
    generation_rules: ["Gunakan unit dan pola stok yang khas tiap niche.", "Sertakan at least one item master dan ringkasan stok tertentu niche.", "Jangan mengganti seluruh struktur hanya dengan nama niche."],
    validationRules: ["harga utama harus 25000", "item master harus relevan untuk niche", "stok minimum dan laporan mutasi wajib ada"],
    validation_rules: ["harga utama harus 25000", "item master harus relevan untuk niche", "stok minimum dan laporan mutasi wajib ada"],
  },
  {
    masterId: "ADMIN",
    master_id: "ADMIN",
    masterCode: "ADMIN",
    master_code: "ADMIN",
    version: "V1",
    name: "Business Administration Kit",
    shortName: "Admin",
    short_name: "Admin",
    category: "operations",
    purpose: "Menyediakan template administrasi operasional, dokumentasi kerja, dan tugas harian yang relevan dengan bisnis.",
    standalonePriceIdr: 29000,
    standalone_price_idr: 29000,
    optionalFutureAddonOfferPriceIdr: undefined,
    optional_future_addon_offer_price_idr: undefined,
    requiredInputs: ["agenda kerja", "template dokumen", "checklist operasional", "jadwal pengingat"],
    required_inputs: ["agenda kerja", "template dokumen", "checklist operasional", "jadwal pengingat"],
    requiredFeatures: ["operasional checklist", "template dokumen", "jadwal kerja", "catatan pelanggan/mitra"],
    required_features: ["operasional checklist", "template dokumen", "jadwal kerja", "catatan pelanggan/mitra"],
    requiredOutputs: ["operational workbook", "dokumen administrasi", "template siap pakai"],
    required_outputs: ["operational workbook", "dokumen administrasi", "template siap pakai"],
    assetContract: ["operational workbook", "template set", "usage guide", "preview metadata", "license text"],
    asset_contract: ["operational workbook", "template set", "usage guide", "preview metadata", "license text"],
    generationRules: ["Pilih dokumen yang benar-benar dibutuhkan pada niche itu.", "Jangan membuat template admin yang tidak relevan dengan pola bisnis target.", "Sertakan penjelasan penggunaan yang sederhana."],
    generation_rules: ["Pilih dokumen yang benar-benar dibutuhkan pada niche itu.", "Jangan membuat template admin yang tidak relevan dengan pola bisnis target.", "Sertakan penjelasan penggunaan yang sederhana."],
    validationRules: ["harga utama harus 29000", "dokumen administrasi harus konsisten dengan niche", "template siap pakai harus ada"],
    validation_rules: ["harga utama harus 29000", "dokumen administrasi harus konsisten dengan niche", "template siap pakai harus ada"],
  },
  {
    masterId: "MKT",
    master_id: "MKT",
    masterCode: "MKT",
    master_code: "MKT",
    version: "V1",
    name: "Marketing Kit",
    shortName: "Mkt",
    short_name: "Mkt",
    category: "marketing",
    purpose: "Menyediakan materi promosi, konten, dan ide campaign yang sesuai dengan karakter usaha niche.",
    standalonePriceIdr: 39000,
    standalone_price_idr: 39000,
    optionalFutureAddonOfferPriceIdr: undefined,
    optional_future_addon_offer_price_idr: undefined,
    requiredInputs: ["promo utama", "segment pelanggan", "bahan visual", "pesan CTA", "content calendar"],
    required_inputs: ["promo utama", "segment pelanggan", "bahan visual", "pesan CTA", "content calendar"],
    requiredFeatures: ["headline produk", "5–10 konsep konten", "promo dan CTA", "kalender aktifitas pemasaran"],
    required_features: ["headline produk", "5–10 konsep konten", "promo dan CTA", "kalender aktifitas pemasaran"],
    requiredOutputs: ["campaign brief", "caption toolkit", "promo idea set", "content plan"],
    required_outputs: ["campaign brief", "caption toolkit", "promo idea set", "content plan"],
    assetContract: ["campaign planning workbook", "content templates", "usage guide", "preview metadata", "license text"],
    asset_contract: ["campaign planning workbook", "content templates", "usage guide", "preview metadata", "license text"],
    generationRules: ["Konten harus konsisten dengan bisnis dan audience niche.", "Jangan memakai klaim tidak terverifikasi atau testimonial palsu.", "Gunakan fokus pada promosi dan value proposition yang masuk akal untuk niche."],
    generation_rules: ["Konten harus konsisten dengan bisnis dan audience niche.", "Jangan memakai klaim tidak terverifikasi atau testimonial palsu.", "Gunakan fokus pada promosi dan value proposition yang masuk akal untuk niche."],
    validationRules: ["harga utama harus 39000", "konten harus relevan dengan niche", "promosi dan CTA harus berdasar fakta niche"],
    validation_rules: ["harga utama harus 39000", "konten harus relevan dengan niche", "promosi dan CTA harus berdasar fakta niche"],
  },
];

export const NICHE_PROFILES: NicheProfile[] = [
  {
    nicheId: "KUL",
    niche_id: "KUL",
    nicheCode: "KUL",
    niche_code: "KUL",
    name: "Kuliner / Warung / Resto",
    audience: "Pemilik warung, usaha kuliner, dan pelaku restoran skala kecil sampai menengah.",
    businessModel: "Penjualan menu harian dengan fokus pada repeat order, margin per porsi, dan efisiensi bahan baku.",
    business_model: "Penjualan menu harian dengan fokus pada repeat order, margin per porsi, dan efisiensi bahan baku.",
    costComponents: ["bahan baku utama", "bumbu dan pelengkap", "kemasan", "gas dan listrik", "upah tenaga kerja"],
    cost_components: ["bahan baku utama", "bumbu dan pelengkap", "kemasan", "gas dan listrik", "upah tenaga kerja"],
    revenuePatterns: ["penjualan per porsi", "promo menu siang", "combo keluarga", "penjualan nasi dan minuman"],
    revenue_patterns: ["penjualan per porsi", "promo menu siang", "combo keluarga", "penjualan nasi dan minuman"],
    inventoryPatterns: ["stok bahan baku harian", "limbah sisa", "kebutuhan topping", "yield per batch"],
    inventory_patterns: ["stok bahan baku harian", "limbah sisa", "kebutuhan topping", "yield per batch"],
    adminNeeds: ["catatan bahan", "laporan penjualan harian", "stok berulang", "pembelian harian"],
    admin_needs: ["catatan bahan", "laporan penjualan harian", "stok berulang", "pembelian harian"],
    marketingNeeds: ["promo menu favorit", "upsell tambahan", "promosi paket keluarga", "highlight menu baru"],
    marketing_needs: ["promo menu favorit", "upsell tambahan", "promosi paket keluarga", "highlight menu baru"],
    terminologyMap: { ingredient: "bahan baku", yield: "hasil produksi", packaging: "kemasan", gas: "gas dan operasional", menuPrice: "harga menu" },
    terminology_map: { ingredient: "bahan baku", yield: "hasil produksi", packaging: "kemasan", gas: "gas dan operasional", menuPrice: "harga menu" },
    exampleDataProfile: { menuItem: "Nasi Goreng Spesial", dailyVolume: 160, unitPrice: 18000, wasteRatio: 0.08 },
    example_data_profile: { menuItem: "Nasi Goreng Spesial", dailyVolume: 160, unitPrice: 18000, wasteRatio: 0.08 },
  },
  {
    nicheId: "CAF",
    niche_id: "CAF",
    nicheCode: "CAF",
    niche_code: "CAF",
    name: "Cafe / Coffee Shop",
    audience: "Pemilik kedai kopi, cafe, dan usaha minuman berulang.",
    businessModel: "Penjualan minuman dan makanan ringan dengan fokus pada margin per cup, repeat visit, dan upsell add-on.",
    business_model: "Penjualan minuman dan makanan ringan dengan fokus pada margin per cup, repeat visit, dan upsell add-on.",
    costComponents: ["biji kopi", "susu dan sirup", "gelas dan tutup", "listrik", "biaya operasional"],
    cost_components: ["biji kopi", "susu dan sirup", "gelas dan tutup", "listrik", "biaya operasional"],
    revenuePatterns: ["jualan per gelas", "promo combo", "menu bundling", "repeat customer"],
    revenue_patterns: ["jualan per gelas", "promo combo", "menu bundling", "repeat customer"],
    inventoryPatterns: ["stok biji kopi", "susu", "sirup", "sedotan", "cup lid"],
    inventory_patterns: ["stok biji kopi", "susu", "sirup", "sedotan", "cup lid"],
    adminNeeds: ["catatan stok bahan", "harga jual menu", "laporan harian", "pelanggan loyal"],
    admin_needs: ["catatan stok bahan", "harga jual menu", "laporan harian", "pelanggan loyal"],
    marketingNeeds: ["promo signature drink", "bundling pastry", "menu seasonal", "content reels"],
    marketing_needs: ["promo signature drink", "bundling pastry", "menu seasonal", "content reels"],
    terminologyMap: { ingredient: "biji kopi dan susu", yield: "hasil recipe", packaging: "cup, lid, dan sedotan", gas: "energi barista", menuPrice: "harga menu" },
    terminology_map: { ingredient: "biji kopi dan susu", yield: "hasil recipe", packaging: "cup, lid, dan sedotan", gas: "energi barista", menuPrice: "harga menu" },
    exampleDataProfile: { menuItem: "Latte Signature", servings: 120, unitPrice: 22000, mixRatio: 0.75 },
    example_data_profile: { menuItem: "Latte Signature", servings: 120, unitPrice: 22000, mixRatio: 0.75 },
  },
  {
    nicheId: "RTL",
    niche_id: "RTL",
    nicheCode: "RTL",
    niche_code: "RTL",
    name: "Retail / Toko Kelontong",
    audience: "Pemilik warung kelontong, toko sembako, dan retail kebutuhan harian.",
    businessModel: "Penjualan barang kebutuhan sehari-hari dengan volume tinggi dan margin kecil per item.",
    business_model: "Penjualan barang kebutuhan sehari-hari dengan volume tinggi dan margin kecil per item.",
    costComponents: ["harga beli barang", "biaya pengiriman", "kemasan", "promosi", "operasional toko"],
    cost_components: ["harga beli barang", "biaya pengiriman", "kemasan", "promosi", "operasional toko"],
    revenuePatterns: ["unit sales harian", "bundling kebutuhan", "promo stok masuk", "repeat buying"],
    revenue_patterns: ["unit sales harian", "bundling kebutuhan", "promo stok masuk", "repeat buying"],
    inventoryPatterns: ["stok fast moving", "stok slow moving", "barang per kategori", "turnover harian"],
    inventory_patterns: ["stok fast moving", "stok slow moving", "barang per kategori", "turnover harian"],
    adminNeeds: ["pencatatan pembelian", "stok rata-rata", "margin per item", "transaksi harian"],
    admin_needs: ["pencatatan pembelian", "stok rata-rata", "margin per item", "transaksi harian"],
    marketingNeeds: ["promo kebutuhan pokok", "bundle harian", "flash sale", "konten update stok"],
    marketing_needs: ["promo kebutuhan pokok", "bundle harian", "flash sale", "konten update stok"],
    terminologyMap: { ingredient: "barang dagangan", yield: "turnover item", packaging: "kemasan produk", gas: "operasional harian", menuPrice: "harga retail" },
    terminology_map: { ingredient: "barang dagangan", yield: "turnover item", packaging: "kemasan produk", gas: "operasional harian", menuPrice: "harga retail" },
    exampleDataProfile: { item: "Minyak Goreng 1 Liter", salesVolume: 280, unitPrice: 20000, skuCount: 45 },
    example_data_profile: { item: "Minyak Goreng 1 Liter", salesVolume: 280, unitPrice: 20000, skuCount: 45 },
  },
  {
    nicheId: "FAS",
    niche_id: "FAS",
    nicheCode: "FAS",
    niche_code: "FAS",
    name: "Fashion / Clothing",
    audience: "Pemilik brand fashion, konveksi, maupun reseller pakaian.",
    businessModel: "Penjualan pakaian dengan variasi ukuran, stok, dan margin dari produksi maupun reseller.",
    business_model: "Penjualan pakaian dengan variasi ukuran, stok, dan margin dari produksi maupun reseller.",
    costComponents: ["blank product", "biaya produksi", "packing", "size variant", "biaya cetak dan desain"],
    cost_components: ["blank product", "biaya produksi", "packing", "size variant", "biaya cetak dan desain"],
    revenuePatterns: ["penjualan per item", "reseller margin", "size bundle", "promo seasonal"],
    revenue_patterns: ["penjualan per item", "reseller margin", "size bundle", "promo seasonal"],
    inventoryPatterns: ["size variant", "stok per model", "reseller order", "jumlah produksi"],
    inventory_patterns: ["size variant", "stok per model", "reseller order", "jumlah produksi"],
    adminNeeds: ["rekap ukuran", "harga produksi", "margin per model", "order reseller"],
    admin_needs: ["rekap ukuran", "harga produksi", "margin per model", "order reseller"],
    marketingNeeds: ["lookbook", "promo size", "drop model baru", "copy katalog produk"],
    marketing_needs: ["lookbook", "promo size", "drop model baru", "copy katalog produk"],
    terminologyMap: { ingredient: "blank product", yield: "jumlah produksi", packaging: "packing dan label", gas: "operasional produksi", menuPrice: "harga retail" },
    terminology_map: { ingredient: "blank product", yield: "jumlah produksi", packaging: "packing dan label", gas: "operasional produksi", menuPrice: "harga retail" },
    exampleDataProfile: { productType: "Kaos Premium", sizeSet: ["S", "M", "L", "XL"], unitPrice: 65000, marginTarget: 0.32 },
    example_data_profile: { productType: "Kaos Premium", sizeSet: ["S", "M", "L", "XL"], unitPrice: 65000, marginTarget: 0.32 },
  },
  {
    nicheId: "LND",
    niche_id: "LND",
    nicheCode: "LND",
    niche_code: "LND",
    name: "Laundry",
    audience: "Pemilik usaha laundry, cuci kiloan, dan layanan pakaian rumah tangga.",
    businessModel: "Layanan berbasis berat cucian dengan biaya per kg, variasi layanan, dan kebutuhan bahan pembersih.",
    business_model: "Layanan berbasis berat cucian dengan biaya per kg, variasi layanan, dan kebutuhan bahan pembersih.",
    costComponents: ["detergen", "pewangi", "plastik", "air dan listrik", "biaya tenaga kerja"],
    cost_components: ["detergen", "pewangi", "plastik", "air dan listrik", "biaya tenaga kerja"],
    revenuePatterns: ["tarif per kg", "layanan express", "langganan rutin", "paket laundry mingguan"],
    revenue_patterns: ["tarif per kg", "layanan express", "langganan rutin", "paket laundry mingguan"],
    inventoryPatterns: ["kg cucian per hari", "wartel cucian", "jumlah plastik", "permintaan rutin"],
    inventory_patterns: ["kg cucian per hari", "wartel cucian", "jumlah plastik", "permintaan rutin"],
    adminNeeds: ["rekap kg cucian", "biaya per transaksi", "pelanggan loyal", "target harian"],
    admin_needs: ["rekap kg cucian", "biaya per transaksi", "pelanggan loyal", "target harian"],
    marketingNeeds: ["promo per kg", "paket langganan", "layanan express", "berita promo musiman"],
    marketing_needs: ["promo per kg", "paket langganan", "layanan express", "berita promo musiman"],
    terminologyMap: { ingredient: "detergen dan pewangi", yield: "kg cucian", packaging: "plastik dan kantong", gas: "air dan listrik", menuPrice: "tarif laundry" },
    terminology_map: { ingredient: "detergen dan pewangi", yield: "kg cucian", packaging: "plastik dan kantong", gas: "air dan listrik", menuPrice: "tarif laundry" },
    exampleDataProfile: { serviceUnit: "kg", dailyWeightKg: 220, servicePrice: 7000, laundryCycle: "harian" },
    example_data_profile: { serviceUnit: "kg", dailyWeightKg: 220, servicePrice: 7000, laundryCycle: "harian" },
  },
  {
    nicheId: "SAL",
    niche_id: "SAL",
    nicheCode: "SAL",
    niche_code: "SAL",
    name: "Salon / Barbershop",
    audience: "Pemilik salon, barbershop, dan usaha estetika personal.",
    businessModel: "Layanan per sesi atau paket dengan repeat customer dan penjualan produk pendukung.",
    business_model: "Layanan per sesi atau paket dengan repeat customer dan penjualan produk pendukung.",
    costComponents: ["bahan perawatan", "pelayanan tenaga ahli", "alat", "perlengkapan", "iklan lokal"],
    cost_components: ["bahan perawatan", "pelayanan tenaga ahli", "alat", "perlengkapan", "iklan lokal"],
    revenuePatterns: ["tarif per sesi", "paket treatment", "upsell produk", "repeat customer"],
    revenue_patterns: ["tarif per sesi", "paket treatment", "upsell produk", "repeat customer"],
    inventoryPatterns: ["stok produk perawatan", "kebutuhan alat", "pelanggan rutin", "pola layanan"],
    inventory_patterns: ["stok produk perawatan", "kebutuhan alat", "pelanggan rutin", "pola layanan"],
    adminNeeds: ["jadwal layanan", "rekap pendapatan", "paket pelanggan", "stok produk"],
    admin_needs: ["jadwal layanan", "rekap pendapatan", "paket pelanggan", "stok produk"],
    marketingNeeds: ["promo paket baru", "member loyalty", "konten sebelum-sesudah", "reels layanan"],
    marketing_needs: ["promo paket baru", "member loyalty", "konten sebelum-sesudah", "reels layanan"],
    terminologyMap: { ingredient: "bahan perawatan", yield: "durasi sesi", packaging: "produk retail", gas: "waktu tenaga kerja", menuPrice: "tarif layanan" },
    terminology_map: { ingredient: "bahan perawatan", yield: "durasi sesi", packaging: "produk retail", gas: "waktu tenaga kerja", menuPrice: "tarif layanan" },
    exampleDataProfile: { serviceType: "Potong Rambut", sessionMinutes: 45, price: 50000, repeatRate: 0.55 },
    example_data_profile: { serviceType: "Potong Rambut", sessionMinutes: 45, price: 50000, repeatRate: 0.55 },
  },
  {
    nicheId: "BNG",
    niche_id: "BNG",
    nicheCode: "BNG",
    niche_code: "BNG",
    name: "Bengkel",
    audience: "Pemilik bengkel motor, mobil, dan layanan perbaikan kendaraan.",
    businessModel: "Layanan perbaikan dan servis dengan bahan habis pakai, biaya teknisi, dan margin per pekerjaan.",
    business_model: "Layanan perbaikan dan servis dengan bahan habis pakai, biaya teknisi, dan margin per pekerjaan.",
    costComponents: ["spare part", "oli dan consumable", "tenaga teknisi", "service fee", "operasional bengkel"],
    cost_components: ["spare part", "oli dan consumable", "tenaga teknisi", "service fee", "operasional bengkel"],
    revenuePatterns: ["service per kendaraan", "paket servis", "penjualan suku cadang", "maintenance rutin"],
    revenue_patterns: ["service per kendaraan", "paket servis", "penjualan suku cadang", "maintenance rutin"],
    inventoryPatterns: ["komponen stok", "oli", "ban dan sparepart", "harga pembelian bagian"],
    inventory_patterns: ["komponen stok", "oli", "ban dan sparepart", "harga pembelian bagian"],
    adminNeeds: ["order service", "biaya spare part", "waktu pekerjaan", "invoice pelanggan"],
    admin_needs: ["order service", "biaya spare part", "waktu pekerjaan", "invoice pelanggan"],
    marketingNeeds: ["promo servis berkala", "paket tune-up", "konten servis rutin", "upsell part"],
    marketing_needs: ["promo servis berkala", "paket tune-up", "konten servis rutin", "upsell part"],
    terminologyMap: { ingredient: "spare part dan consumable", yield: "service job", packaging: "packing part", gas: "waktu teknisi", menuPrice: "tarif servis" },
    terminology_map: { ingredient: "spare part dan consumable", yield: "service job", packaging: "packing part", gas: "waktu teknisi", menuPrice: "tarif servis" },
    exampleDataProfile: { serviceType: "Tune Up Motor", laborMinutes: 90, partsCost: 320000, serviceFee: 50000 },
    example_data_profile: { serviceType: "Tune Up Motor", laborMinutes: 90, partsCost: 320000, serviceFee: 50000 },
  },
  {
    nicheId: "ONL",
    niche_id: "ONL",
    nicheCode: "ONL",
    niche_code: "ONL",
    name: "Toko Online / Reseller",
    audience: "Pemilik toko online, reseller, dan penjual produk digital atau fisik berulang.",
    businessModel: "Penjualan berbasis katalog, repeat order, dan margin pada setiap paket atau produk.",
    business_model: "Penjualan berbasis katalog, repeat order, dan margin pada setiap paket atau produk.",
    costComponents: ["harga beli produk", "ongkir", "packaging", "promosi digital", "biaya platform"],
    cost_components: ["harga beli produk", "ongkir", "packaging", "promosi digital", "biaya platform"],
    revenuePatterns: ["jualan per produk", "bundle produk", "upsell add-on", "repeat order"],
    revenue_patterns: ["jualan per produk", "bundle produk", "upsell add-on", "repeat order"],
    inventoryPatterns: ["stok per SKU", "pembelian ulang", "drop shipping", "kategori produk"],
    inventory_patterns: ["stok per SKU", "pembelian ulang", "drop shipping", "kategori produk"],
    adminNeeds: ["order tracker", "biaya pengiriman", "margin per SKU", "log pesanan"],
    admin_needs: ["order tracker", "biaya pengiriman", "margin per SKU", "log pesanan"],
    marketingNeeds: ["promo produk", "copy katalog", "review pelanggan", "ads visual"],
    marketing_needs: ["promo produk", "copy katalog", "review pelanggan", "ads visual"],
    terminologyMap: { ingredient: "produk utama", yield: "order volume", packaging: "packing dan label", gas: "biaya pengiriman", menuPrice: "harga reseller" },
    terminology_map: { ingredient: "produk utama", yield: "order volume", packaging: "packing dan label", gas: "biaya pengiriman", menuPrice: "harga reseller" },
    exampleDataProfile: { productSet: ["Kemeja Casual", "Tas Travel"], averageOrderValue: 110000, orderCount: 48 },
    example_data_profile: { productSet: ["Kemeja Casual", "Tas Travel"], averageOrderValue: 110000, orderCount: 48 },
  },
  {
    nicheId: "BAK",
    niche_id: "BAK",
    nicheCode: "BAK",
    niche_code: "BAK",
    name: "Bakery / Snack",
    audience: "Pemilik bakery, toko snack, dan usaha kue rumahan.",
    businessModel: "Penjualan produk jadi berbasis batch, resep, dan perputaran stok harian.",
    business_model: "Penjualan produk jadi berbasis batch, resep, dan perputaran stok harian.",
    costComponents: ["bahan baku", "kemasan", "gas atau oven", "tenaga produksi", "pengiriman"],
    cost_components: ["bahan baku", "kemasan", "gas atau oven", "tenaga produksi", "pengiriman"],
    revenuePatterns: ["penjualan per batch", "promo hari tertentu", "bundle snack", "repeat order"],
    revenue_patterns: ["penjualan per batch", "promo hari tertentu", "bundle snack", "repeat order"],
    inventoryPatterns: ["stok bahan", "batch harian", "produk jadi", "sisa produksi"],
    inventory_patterns: ["stok bahan", "batch harian", "produk jadi", "sisa produksi"],
    adminNeeds: ["jumlah batch", "bahan baku", "resep tetap", "laporan harian"],
    admin_needs: ["jumlah batch", "bahan baku", "resep tetap", "laporan harian"],
    marketingNeeds: ["produk favorit", "promo kemasan", "market day", "content produk baru"],
    marketing_needs: ["produk favorit", "promo kemasan", "market day", "content produk baru"],
    terminologyMap: { ingredient: "bahan kue dan snack", yield: "hasil batch", packaging: "kemasan dan label", gas: "oven dan operasi", menuPrice: "harga produk" },
    terminology_map: { ingredient: "bahan kue dan snack", yield: "hasil batch", packaging: "kemasan dan label", gas: "oven dan operasi", menuPrice: "harga produk" },
    exampleDataProfile: { product: "Brownis Cokelat", batchCount: 12, unitPrice: 12000, freshnessWindow: "1 hari" },
    example_data_profile: { product: "Brownis Cokelat", batchCount: 12, unitPrice: 12000, freshnessWindow: "1 hari" },
  },
  {
    nicheId: "PRO",
    niche_id: "PRO",
    nicheCode: "PRO",
    niche_code: "PRO",
    name: "Jasa Profesional",
    audience: "Freelancer, konsultan, dan penyedia jasa profesional independen.",
    businessModel: "Penjualan jasa dengan tarif per sesi, paket proyek, dan kebutuhan administrasi yang membangun trust.",
    business_model: "Penjualan jasa dengan tarif per sesi, paket proyek, dan kebutuhan administrasi yang membangun trust.",
    costComponents: ["waktu kerja", "komunikasi", "software", "biaya operasional", "promosi personal branding"],
    cost_components: ["waktu kerja", "komunikasi", "software", "biaya operasional", "promosi personal branding"],
    revenuePatterns: ["tarif per sesi", "paket proyek", "retainer", "upsell dokumen"],
    revenue_patterns: ["tarif per sesi", "paket proyek", "retainer", "upsell dokumen"],
    inventoryPatterns: ["jam kerja", "proyek aktif", "reusable template", "repeat client"],
    inventory_patterns: ["jam kerja", "proyek aktif", "reusable template", "repeat client"],
    adminNeeds: ["jadwal client", "invoice proyek", "catatan tugas", "status pengerjaan"],
    admin_needs: ["jadwal client", "invoice proyek", "catatan tugas", "status pengerjaan"],
    marketingNeeds: ["portfolio kerja", "paket jasa", "case study", "personal branding"],
    marketing_needs: ["portfolio kerja", "paket jasa", "case study", "personal branding"],
    terminologyMap: { ingredient: "waktu dan sumber daya", yield: "durasi jasa", packaging: "delivery proposal", gas: "jam kerja", menuPrice: "tarif jasa" },
    terminology_map: { ingredient: "waktu dan sumber daya", yield: "durasi jasa", packaging: "delivery proposal", gas: "jam kerja", menuPrice: "tarif jasa" },
    exampleDataProfile: { service: "Konsultasi Bisnis", sessionHours: 2, rate: 350000, repeatClient: true },
    example_data_profile: { service: "Konsultasi Bisnis", sessionHours: 2, rate: 350000, repeatClient: true },
  },
];

const MASTER_BY_ID = new Map(MASTER_DEFINITIONS.map((master) => [master.masterId, master]));
const NICHE_BY_ID = new Map(NICHE_PROFILES.map((niche) => [niche.nicheId, niche]));

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalMasterPrice(masterId: string): number {
  const definition = MASTER_BY_ID.get(masterId);
  return definition?.standalonePriceIdr ?? 0;
}

function sameNicheRelatedSkus(masterId: string, nicheId: string): string[] {
  const allowed = {
    HPP: ["BOOK", "INV"],
    BOOK: ["HPP", "INV"],
    INV: ["HPP", "BOOK"],
    ADMIN: ["BOOK", "MKT"],
    MKT: ["ADMIN", "BOOK"],
  } as Record<string, string[]>;

  const masterTargets = allowed[masterId] ?? [];
  return masterTargets.map((code) => `DPF-${nicheId}-${code}-V1`);
}

function buildNarrative(master: MasterDefinition, niche: NicheProfile): { title: string; shortTitle: string; headline: string; description: string; problem: string; useCase: string; category: string; subcategory: string; buyer: string; productType: string; format: string[]; tags: string[]; features: string[]; requiredOutputs: string[]; assetContract: string[]; validationRules: string[]; } {
  const shortName = `${master.shortName} ${niche.name}`;
  const title = `${master.name} ${niche.name}`;
  const category = master.category === "pricing" ? "Bisnis & UMKM" : master.category === "bookkeeping" ? "Keuangan & Operasional" : master.category === "inventory" ? "Operasional" : master.category === "operations" ? "Administrasi" : "Marketing";
  const subcategory = master.category === "pricing" ? "Perhitungan biaya" : master.category === "bookkeeping" ? "Pembukuan" : master.category === "inventory" ? "Stok & persediaan" : master.category === "operations" ? "Administrasi" : "Konten & promosi";
  const buyer = niche.audience.split(".")[0] ?? niche.audience;
  const problem = master.masterId === "HPP"
    ? `Biaya operasional dan harga jual ${niche.name.toLowerCase()} sulit dihitung secara akurat.`
    : master.masterId === "BOOK"
      ? `Transaksi ${niche.name.toLowerCase()} sering tumpang tindih dan sulit dibaca dalam satu ringkasan.`
      : master.masterId === "INV"
        ? `Stok produk dan kebutuhan bahan ${niche.name.toLowerCase()} sering tidak terdokumentasi dengan rapi.`
        : master.masterId === "ADMIN"
          ? `Dokumen operasional ${niche.name.toLowerCase()} belum terstruktur untuk tugas harian dan pelacakan.`
          : `Konten promosi ${niche.name.toLowerCase()} belum terdokumentasi secara terarah untuk produk dan layanan harian.`;

  const useCase = master.masterId === "HPP"
    ? `Menghitung biaya bahan, operasional, dan harga jual yang tepat untuk ${niche.name.toLowerCase()}.`
    : master.masterId === "BOOK"
      ? `Mencatat pemasukan, pengeluaran, dan ringkasan keuangan harian untuk ${niche.name.toLowerCase()}.`
      : master.masterId === "INV"
        ? `Mencatat item, pergerakan stok, dan kebutuhan pembelian yang relevan untuk ${niche.name.toLowerCase()}.`
        : master.masterId === "ADMIN"
          ? `Menata dokumen operasional, checklist, dan kegiatan harian yang sesuai dengan ${niche.name.toLowerCase()}.`
          : `Menyiapkan promosi, caption, dan campaign yang direkomendasikan untuk ${niche.name.toLowerCase()}.`;

  const headline = `${master.name} untuk ${niche.name}`;
  const description = `${master.purpose} Variasi ini dibuat khusus untuk ${niche.name.toLowerCase()} dan menggunakan ${Object.values(niche.terminologyMap).slice(0, 2).join(" dan ").toLowerCase()} yang sesuai dengan pola bisnis tersebut.`;
  const tags = ["dpf", master.masterCode.toLowerCase(), niche.nicheCode.toLowerCase(), niche.name.toLowerCase()]
    .flatMap((entry) => entry.split(/[\s/]+/))
    .filter(Boolean)
    .slice(0, 10);
  const features = [...master.requiredFeatures, ...niche.costComponents.slice(0, 2), ...niche.marketingNeeds.slice(0, 2)];
  const requiredOutputs = master.requiredOutputs;
  const assetContract = master.assetContract;
  const validationRules = master.validationRules;
  const productType = master.masterId === "HPP" ? "Calculator Workbook" : master.masterId === "BOOK" ? "Transaction Workbook" : master.masterId === "INV" ? "Inventory Workbook" : master.masterId === "ADMIN" ? "Operational Templates" : "Marketing Workbook";
  const format = master.masterId === "HPP" ? ["XLSX"] : master.masterId === "BOOK" ? ["XLSX", "Google Sheets"] : master.masterId === "INV" ? ["XLSX", "CSV"] : master.masterId === "ADMIN" ? ["DOCX", "PDF"] : ["PPTX", "PDF"];

  return { title, shortTitle: shortName, headline, description, problem, useCase, category, subcategory, buyer, productType, format, tags, features, requiredOutputs, assetContract, validationRules };
}

function buildNicheSpecificity(product: DpfProduct): number {
  const niche = NICHE_BY_ID.get(product.nicheId) ?? NICHE_PROFILES[0];
  const prose = [product.title, product.description, product.headline, product.features.join(" "), product.tags.join(" ")].join(" ").toLowerCase();
  const terms = new Set([
    ...Object.values(niche.terminologyMap).map((value) => value.toLowerCase()),
    ...niche.costComponents.map((value) => value.toLowerCase()),
    ...niche.adminNeeds.map((value) => value.toLowerCase()),
    ...niche.marketingNeeds.map((value) => value.toLowerCase()),
    niche.name.toLowerCase(),
    niche.nicheCode.toLowerCase(),
    product.masterCode.toLowerCase(),
  ]);

  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (prose.includes(term)) score += 4;
  }
  if (product.features.length >= 3) score += 20;
  if (product.assetContract.length >= 4) score += 10;
  if (product.relatedProducts.length >= 1) score += 5;
  return Math.min(100, score);
}

function buildProduct(master: MasterDefinition, niche: NicheProfile): DpfProduct {
  const sku = `DPF-${niche.nicheCode}-${master.masterCode}-V1`;
  const slug = `${toSlug(`dpf ${niche.nicheCode} ${master.masterCode} v1`)}`;
  const narrative = buildNarrative(master, niche);
  const relatedProducts = sameNicheRelatedSkus(master.masterId, niche.nicheId);
  const futureAddonPrice = master.optionalFutureAddonOfferPriceIdr ?? undefined;
  const product: DpfProduct = {
    id: `${niche.nicheId.toLowerCase()}-${master.masterId.toLowerCase()}`,
    sku,
    slug,
    title: narrative.title,
    shortTitle: narrative.shortTitle,
    headline: narrative.headline,
    description: narrative.description,
    category: narrative.category,
    subcategory: narrative.subcategory,
    niche: niche.name,
    nicheId: niche.nicheId,
    niche_id: niche.nicheId,
    buyer: narrative.buyer,
    problem: narrative.problem,
    useCase: narrative.useCase,
    use_case: narrative.useCase,
    productType: narrative.productType,
    product_type: narrative.productType,
    format: narrative.format,
    formats: narrative.format,
    price: master.standalonePriceIdr,
    standalonePriceIdr: master.standalonePriceIdr,
    standalone_price_idr: master.standalonePriceIdr,
    futureAddonOfferPriceIdr: futureAddonPrice,
    future_addon_offer_price_idr: futureAddonPrice,
    trafficRole: master.masterId === "HPP" ? "ACQUISITION" : master.masterId === "ADMIN" ? "SEO_LONGTAIL" : "MONETIZATION",
    status: "DRAFT",
    keywords: narrative.tags,
    tags: narrative.tags,
    masterId: master.masterId,
    master_id: master.masterId,
    masterCode: master.masterCode,
    master_code: master.masterCode,
    version: "V1",
    factoryVersion: FACTORY_VERSION,
    masterVersion: master.version,
    nicheVersion: "V1",
    masterVersionLabel: `${master.masterId}-${master.version}`,
    nicheVersionLabel: `${niche.nicheId}-V1`,
    requiredInputs: master.requiredInputs,
    required_inputs: master.requiredInputs,
    features: narrative.features,
    requiredOutputs: narrative.requiredOutputs,
    required_outputs: narrative.requiredOutputs,
    assetContract: narrative.assetContract,
    asset_contract: narrative.assetContract,
    validationRules: narrative.validationRules,
    validation_rules: narrative.validationRules,
    relatedProducts,
    compatibility: {
      sameNicheOnly: true,
      same_niche_only: true,
      allowedMasterIds: relatedProducts.length ? [...new Set(relatedProducts.map((value) => value.split("-").slice(-2, -1)[0]))] : [],
      allowed_master_ids: relatedProducts.length ? [...new Set(relatedProducts.map((value) => value.split("-").slice(-2, -1)[0]))] : [],
      offerMatrix: {
        HPP: 19000,
        BOOK: 19000,
        INV: 15000,
        ADMIN: 19000,
        MKT: 29000,
      },
      relatedSkus: relatedProducts,
    },
    generationInput: {
      masterContract: master,
      nicheProfile: niche,
      terminologyMap: niche.terminologyMap,
      exampleDataProfile: niche.exampleDataProfile,
      skuIdentity: sku,
      pricing: {
        standalonePriceIdr: master.standalonePriceIdr,
        futureAddonOfferPriceIdr: futureAddonPrice,
      },
      requiredModules: master.requiredInputs,
      requiredFormulas: master.requiredFeatures,
      assetRequirements: master.assetContract,
      validationRules: master.validationRules,
    },
    assetRequirements: master.assetContract,
    nicheSpecificityScore: 0,
    niche_specificity_score: 0,
  };

  const nicheSpecificityScore = buildNicheSpecificity(product);
  product.nicheSpecificityScore = nicheSpecificityScore;
  product.niche_specificity_score = nicheSpecificityScore;
  return product;
}

function findDuplicateDescription(batch: DpfProduct[]): string[] {
  const map = new Map<string, string>();
  const duplicates: string[] = [];
  for (const product of batch) {
    const key = product.description.toLowerCase().trim();
    if (map.has(key)) {
      duplicates.push(`${map.get(key)}|${product.sku}`);
      continue;
    }
    map.set(key, product.sku);
  }
  return duplicates;
}

function buildOfferMatrix(): Record<string, Record<string, number>> {
  return {
    HPP: { BOOK: 19000, INV: 15000 },
    BOOK: { INV: 15000, ADMIN: 19000, MKT: 29000 },
    INV: { BOOK: 19000, ADMIN: 19000, MKT: 29000 },
    ADMIN: { BOOK: 19000, MKT: 29000 },
    MKT: { BOOK: 19000, ADMIN: 19000 },
  };
}

export function generateLaunchBatch01(): LaunchBatch01 {
  const products = MASTER_DEFINITIONS.flatMap((master) => NICHE_PROFILES.map((niche) => buildProduct(master, niche)));
  return {
    batchId: "DPF-LAUNCH-BATCH-01",
    factoryVersion: FACTORY_VERSION,
    generatedAt: new Date("2026-10-04T00:00:00.000Z").toISOString(),
    products,
    productCount: products.length,
  };
}

export function validateLaunchBatch01(batch: LaunchBatch01): LaunchBatchValidation {
  const masterIds = new Set(MASTER_DEFINITIONS.map((master) => master.masterId));
  const nicheIds = new Set(NICHE_PROFILES.map((niche) => niche.nicheId));
  const skuSet = new Set<string>();
  const slugSet = new Set<string>();
  const issues: ValidationIssue[] = [];
  const results: LaunchBatchValidation["results"] = [];
  const allProducts = batch.products || [];

  for (const product of allProducts) {
    const productIssues: ValidationIssue[] = [];

    if (!masterIds.has(product.masterId)) productIssues.push({ code: "INVALID_MASTER", message: `Invalid master ${product.masterId}`, productSku: product.sku });
    if (!nicheIds.has(product.nicheId)) productIssues.push({ code: "INVALID_NICHE", message: `Invalid niche ${product.nicheId}`, productSku: product.sku });
    if (!product.version || !product.version.trim()) productIssues.push({ code: "INVALID_VERSION", message: "Version missing", productSku: product.sku });
    if (typeof product.price !== "number" || product.price < 10000) productIssues.push({ code: "LOW_PRICE", message: `Price below minimum for ${product.sku}`, productSku: product.sku });
    if (product.price !== canonicalMasterPrice(product.masterId)) productIssues.push({ code: "CANONICAL_PRICE_MISMATCH", message: `Canonical price mismatch for ${product.masterId}`, productSku: product.sku });
    if (skuSet.has(product.sku)) productIssues.push({ code: "DUPLICATE_SKU", message: `Duplicate SKU ${product.sku}`, productSku: product.sku });
    if (slugSet.has(product.slug)) productIssues.push({ code: "DUPLICATE_SLUG", message: `Duplicate slug ${product.slug}`, productSku: product.sku });
    if (product.assetContract.length === 0 || product.assetRequirements.length === 0) productIssues.push({ code: "MISSING_ASSET", message: `Missing asset contract for ${product.sku}`, productSku: product.sku });
    if (product.features.length === 0 || product.requiredOutputs.length === 0) productIssues.push({ code: "MISSING_FEATURES", message: `Missing required features for ${product.sku}`, productSku: product.sku });
    if (product.title.includes("TODO") || product.description.includes("TODO") || product.title.includes("placeholder") || product.description.includes("placeholder")) productIssues.push({ code: "PLACEHOLDER_TEXT", message: `Placeholder text found in ${product.sku}`, productSku: product.sku });
    if (product.relatedProducts.some((related) => !related.includes(product.nicheId))) productIssues.push({ code: "CROSS_NICHE_COMPATIBILITY", message: `Same-niche compatibility only for ${product.sku}`, productSku: product.sku });
    if (product.nicheSpecificityScore < NICHE_SPECIFICITY_THRESHOLD) productIssues.push({ code: "LOW_NICHE_SPECIFICITY", message: `Niche specificity below threshold for ${product.sku}`, productSku: product.sku });

    const normalizedTitle = product.title.toLowerCase();
    const normalizedDescription = product.description.toLowerCase();
    const niche = NICHE_BY_ID.get(product.nicheId);
    const terms = niche ? [...Object.values(niche.terminologyMap), ...niche.costComponents, ...niche.adminNeeds, ...niche.marketingNeeds].map((entry) => entry.toLowerCase()) : [];
    const nicheMatchCount = terms.filter((term) => normalizedTitle.includes(term) || normalizedDescription.includes(term)).length;
    if (nicheMatchCount === 0) productIssues.push({ code: "GENERIC_NICHE_CONTENT", message: `Generic content for ${product.sku}`, productSku: product.sku });

    skuSet.add(product.sku);
    slugSet.add(product.slug);

    const valid = productIssues.length === 0;
    results.push({ productSku: product.sku, valid, nicheSpecificityScore: product.nicheSpecificityScore, issues: productIssues });
    issues.push(...productIssues);
  }

  const duplicateDescriptions = findDuplicateDescription(allProducts);
  for (const duplicate of duplicateDescriptions) {
    const [skuA, skuB] = duplicate.split("|");
    issues.push({ code: "DUPLICATE_DESCRIPTION", message: `Duplicate description detected across ${skuA} and ${skuB}` });
    const result = results.find((entry) => entry.productSku === skuA || entry.productSku === skuB);
    if (result) result.valid = false;
  }

  const validProducts = results.filter((entry) => entry.valid).length;
  const avgNicheSpecificity = results.length ? results.reduce((sum, entry) => sum + entry.nicheSpecificityScore, 0) / results.length : 0;
  const summary = {
    masterCount: MASTER_DEFINITIONS.length,
    nicheCount: NICHE_PROFILES.length,
    productCount: allProducts.length,
    validProductCount: validProducts,
    invalidProductCount: results.length - validProducts,
    offerMatrix: buildOfferMatrix(),
    nicheSpecificityThreshold: NICHE_SPECIFICITY_THRESHOLD,
    avgNicheSpecificity,
    assetCompleteness: allProducts.length ? allProducts.filter((product) => product.assetContract.length >= 4).length / allProducts.length : 0,
    deterministic: true,
  };

  return {
    valid: issues.length === 0 && allProducts.length === 50 && summary.masterCount === 5 && summary.nicheCount === 10,
    summary,
    results,
    issues,
  };
}

export function buildLaunchBatchManifest(batch: LaunchBatch01) {
  const validation = validateLaunchBatch01(batch);
  return {
    batchId: batch.batchId,
    factoryVersion: batch.factoryVersion,
    generatedAt: batch.generatedAt,
    masterVersions: Object.fromEntries(MASTER_DEFINITIONS.map((master) => [master.masterId, master.version])),
    nicheVersions: Object.fromEntries(NICHE_PROFILES.map((niche) => [niche.nicheId, "V1"])),
    products: batch.products.map((product) => ({
      sku: product.sku,
      slug: product.slug,
      masterId: product.masterId,
      nicheId: product.nicheId,
      price: product.price,
      description: product.description,
      features: product.features,
      tags: product.tags,
      assetContract: product.assetContract,
      compatibility: product.compatibility,
      validation: { nicheSpecificityScore: product.nicheSpecificityScore },
    })),
    validationSummary: { ...validation.summary, valid: validation.valid },
    validationResults: validation.results,
    compatibilityMetadata: {
      sameNicheOnly: true,
      offerMatrix: buildOfferMatrix(),
    },
  };
}

export function dryRunProductImport(existingProducts: DpfProduct[], incomingProducts: Array<Partial<DpfProduct> & { addonMasterId?: string; addonNicheId?: string }> = []) {
  const productMap = new Map(existingProducts.map((product) => [product.sku, product]));

  if (incomingProducts.length === 0) {
    return {
      classification: "CREATE",
      productCount: existingProducts.length,
      productMap,
      reasons: [],
    };
  }

  for (const candidate of incomingProducts) {
    const candidateMaster = candidate.masterId;
    const candidateNiche = candidate.nicheId;
    if (!candidateMaster || !MASTER_BY_ID.has(candidateMaster)) {
      return { classification: "INVALID", productCount: existingProducts.length, productMap, reasons: [`Invalid master ${candidateMaster ?? "unknown"}`] };
    }
    if (!candidateNiche || !NICHE_BY_ID.has(candidateNiche)) {
      return { classification: "INVALID", productCount: existingProducts.length, productMap, reasons: [`Invalid niche ${candidateNiche ?? "unknown"}`] };
    }
    if (candidate.addonMasterId && candidate.addonNicheId && candidate.addonNicheId !== candidate.nicheId) {
      return { classification: "INVALID", productCount: existingProducts.length, productMap, reasons: ["Cross-niche add-on is not allowed; same niche only."] };
    }
  }

  for (const candidate of incomingProducts) {
    if (candidate.sku && productMap.has(candidate.sku)) {
      const existing = productMap.get(candidate.sku);
      if (existing && JSON.stringify(existing) === JSON.stringify(candidate)) {
        return {
          classification: "SKIP_IDENTICAL",
          productCount: existingProducts.length,
          productMap,
          reasons: [`Existing SKU ${candidate.sku} matches catalog.`],
        };
      }
      return {
        classification: "UPDATE_REQUIRED",
        productCount: existingProducts.length,
        productMap,
        reasons: [`SKU ${candidate.sku} requires update metadata.`],
      };
    }
  }

  return {
    classification: "CREATE",
    productCount: existingProducts.length,
    productMap,
    reasons: [],
  };
}

export function getLaunchBatchManifest(): ReturnType<typeof buildLaunchBatchManifest> {
  return buildLaunchBatchManifest(generateLaunchBatch01());
}

export function getLaunchBatchSummary(): ReturnType<typeof validateLaunchBatch01> {
  return validateLaunchBatch01(generateLaunchBatch01());
}

export const launchBatch01 = generateLaunchBatch01();
