import { NICHE_PROFILES } from "@/lib/dpf/product-factory/launch-batch-01";
import type { NicheCode, NicheData } from "./types";

type NicheExamples = Omit<NicheData, "profile">;

const EXAMPLES: Record<NicheCode, NicheExamples> = {
  KUL: {
    code: "KUL",
    products: [
      { name: "Nasi Goreng Ayam", price: 22000, yield: 1, unit: "porsi", materials: [{ name: "beras matang", qty: 250, unit: "g", unitCost: 18 }, { name: "ayam fillet", qty: 70, unit: "g", unitCost: 95 }, { name: "telur", qty: 1, unit: "butir", unitCost: 2200 }] },
      { name: "Soto Ayam", price: 20000, yield: 1, unit: "mangkuk", materials: [{ name: "ayam", qty: 80, unit: "g", unitCost: 90 }, { name: "bihun", qty: 35, unit: "g", unitCost: 30 }, { name: "kaldu dan bumbu", qty: 1, unit: "porsi", unitCost: 1800 }] },
      { name: "Es Teh Lemon", price: 10000, yield: 1, unit: "gelas", materials: [{ name: "teh", qty: 4, unit: "g", unitCost: 140 }, { name: "lemon", qty: 25, unit: "g", unitCost: 55 }, { name: "gula", qty: 20, unit: "g", unitCost: 18 }] },
    ],
    inventoryItems: [
      { name: "Beras medium", unit: "kg", supplier: "Pasar induk setempat", opening: 25, cost: 14500, minimum: 8, category: "Bahan pokok" },
      { name: "Ayam fillet", unit: "kg", supplier: "Pemasok ayam pagi", opening: 8, cost: 38000, minimum: 3, category: "Protein segar" },
      { name: "Gelas 16 oz", unit: "pak", supplier: "Toko kemasan", opening: 12, cost: 28000, minimum: 4, category: "Kemasan" },
    ],
    expenseCategories: ["Belanja bahan segar", "Gas LPG", "Kemasan pesan antar", "Biaya aplikasi", "Upah harian", "Susut bahan"],
    customerTypes: ["Pelanggan makan siang kantor", "Keluarga pesan menu bersama", "Pelanggan pesan antar malam"],
    adminExamples: ["Catatan suhu dan penerimaan ayam", "Rekap pesanan nasi kotak", "Checklist kebersihan area prep"],
    marketingExamples: [
      { offer: "Paket makan siang: nasi goreng ayam + es teh", hook: "Butuh makan siang praktis yang tetap mengenyangkan?", channel: "WhatsApp pelanggan sekitar", cta: "Pesan sebelum pukul 11.00" },
      { offer: "Paket keluarga soto ayam 4 mangkuk", hook: "Makan malam keluarga tanpa menyiapkan dapur panjang.", channel: "Instagram Story", cta: "Kirim jumlah porsi untuk cek ketersediaan" },
      { offer: "Tambah telur pada menu nasi goreng", hook: "Lengkapi nasi goreng dengan telur ceplok hangat.", channel: "Menu kasir", cta: "Pilih tambah telur saat memesan" },
    ], units: ["porsi", "mangkuk", "gelas", "kg", "butir"],
  },
  CAF: {
    code: "CAF",
    products: [
      { name: "Es Kopi Susu Gula Aren", price: 24000, yield: 1, unit: "gelas", materials: [{ name: "espresso", qty: 18, unit: "g", unitCost: 180 }, { name: "susu UHT", qty: 120, unit: "ml", unitCost: 19 }, { name: "sirup gula aren", qty: 25, unit: "ml", unitCost: 42 }] },
      { name: "Matcha Latte", price: 28000, yield: 1, unit: "gelas", materials: [{ name: "bubuk matcha", qty: 4, unit: "g", unitCost: 1200 }, { name: "susu", qty: 150, unit: "ml", unitCost: 19 }, { name: "cup dan lid", qty: 1, unit: "set", unitCost: 1700 }] },
      { name: "Croissant Butter", price: 22000, yield: 1, unit: "buah", materials: [{ name: "croissant frozen", qty: 1, unit: "buah", unitCost: 6500 }, { name: "butter", qty: 8, unit: "g", unitCost: 110 }, { name: "paper bag", qty: 1, unit: "lembar", unitCost: 700 }] },
    ],
    inventoryItems: [
      { name: "Biji kopi house blend", unit: "kg", supplier: "Roastery lokal", opening: 6, cost: 185000, minimum: 2, category: "Kopi" },
      { name: "Susu UHT", unit: "karton", supplier: "Distributor dairy", opening: 10, cost: 198000, minimum: 3, category: "Dairy" },
      { name: "Cup 16 oz + lid", unit: "pak", supplier: "Pemasok kemasan", opening: 14, cost: 42000, minimum: 5, category: "Kemasan minuman" },
    ],
    expenseCategories: ["Biji kopi dan susu", "Pastry titip jual", "Biaya platform pesan", "Listrik mesin espresso", "Perawatan grinder", "Program loyalty"],
    customerTypes: ["Komuter pagi", "Pekerja laptop siang hari", "Pengunjung akhir pekan"],
    adminExamples: ["Log dial-in espresso harian", "Jadwal penerimaan pastry", "Rekap voucher kunjungan ulang"],
    marketingExamples: [
      { offer: "Pairing espresso susu dengan croissant", hook: "Jeda pagi dengan kopi house blend dan pastry hangat.", channel: "Instagram Reels", cta: "Tunjukkan postingan ini saat memesan" },
      { offer: "Kartu kunjungan 6 gelas", hook: "Kopi rutin lebih mudah direncanakan dengan kartu kunjungan.", channel: "Kasir dan WhatsApp", cta: "Minta kartu saat transaksi berikutnya" },
      { offer: "Matcha latte ukuran reguler", hook: "Pilihan non-kopi dengan matcha dan susu yang diracik saat dipesan.", channel: "Menu digital", cta: "Pilih tingkat gula di catatan pesanan" },
    ], units: ["gelas", "shot", "ml", "gram", "pak"],
  },
  RTL: {
    code: "RTL",
    products: [
      { name: "Paket Sembako Hemat", price: 128000, yield: 1, unit: "paket", materials: [{ name: "beras 5 kg", qty: 1, unit: "karung", unitCost: 69000 }, { name: "minyak 1 L", qty: 2, unit: "botol", unitCost: 16000 }, { name: "gula 1 kg", qty: 1, unit: "pak", unitCost: 15500 }] },
      { name: "Air Mineral 600 ml", price: 4000, yield: 1, unit: "botol", materials: [{ name: "dus air mineral", qty: 1, unit: "botol", unitCost: 2600 }] },
      { name: "Telur Ayam", price: 30000, yield: 1, unit: "kg", materials: [{ name: "telur dari pemasok", qty: 1, unit: "kg", unitCost: 25500 }, { name: "plastik belanja", qty: 1, unit: "lembar", unitCost: 150 }] },
    ],
    inventoryItems: [
      { name: "Minyak goreng 1 L", unit: "botol", supplier: "Agen sembako kecamatan", opening: 48, cost: 15800, minimum: 16, category: "Bahan pokok" },
      { name: "Mi instan goreng", unit: "dus", supplier: "Distributor FMCG", opening: 9, cost: 112000, minimum: 3, category: "Makanan kemasan" },
      { name: "Baterai AA isi 2", unit: "pak", supplier: "Grosir alat rumah", opening: 24, cost: 5200, minimum: 8, category: "Kebutuhan rumah" },
    ],
    expenseCategories: ["Kulakan barang", "Ongkos angkut", "Biaya QRIS", "Kantong belanja", "Susut atau rusak", "Listrik toko"],
    customerTypes: ["Rumah tangga sekitar", "Warung kecil kulakan ecer", "Pembeli kebutuhan mendadak"],
    adminExamples: ["Rekap faktur agen sembako", "Catatan barang rusak atau kedaluwarsa", "Daftar harga jual rak harian"],
    marketingExamples: [
      { offer: "Paket beras 5 kg, minyak, dan gula", hook: "Belanja kebutuhan pokok dalam satu paket dengan isi dan harga jelas.", channel: "Papan depan toko", cta: "Tanyakan stok paket hari ini" },
      { offer: "Pesan barang rutin lewat WhatsApp", hook: "Daftar belanja mingguan bisa disiapkan sebelum diambil.", channel: "WhatsApp pelanggan", cta: "Kirim daftar dan waktu pengambilan" },
      { offer: "Harga khusus pembelian satu dus", hook: "Bandingkan harga satuan dan harga dus sebelum memilih.", channel: "Label rak", cta: "Tanyakan harga dus pada penjaga" },
    ], units: ["pcs", "botol", "dus", "karung", "pak"],
  },
  FAS: {
    code: "FAS",
    products: [
      { name: "Kaos Cotton Combed 24s", price: 89000, yield: 1, unit: "pcs", materials: [{ name: "blank kaos", qty: 1, unit: "pcs", unitCost: 32000 }, { name: "sablon depan", qty: 1, unit: "area", unitCost: 12500 }, { name: "label dan poly mailer", qty: 1, unit: "set", unitCost: 3500 }] },
      { name: "Kemeja Linen", price: 219000, yield: 1, unit: "pcs", materials: [{ name: "kain linen", qty: 1.7, unit: "m", unitCost: 56000 }, { name: "kancing", qty: 8, unit: "pcs", unitCost: 300 }, { name: "jahit", qty: 1, unit: "pcs", unitCost: 28000 }] },
      { name: "Totebag Kanvas", price: 69000, yield: 1, unit: "pcs", materials: [{ name: "kanvas", qty: 0.6, unit: "m", unitCost: 43000 }, { name: "tali webbing", qty: 1.2, unit: "m", unitCost: 7000 }, { name: "hang tag", qty: 1, unit: "pcs", unitCost: 1000 }] },
    ],
    inventoryItems: [
      { name: "Kaos blank hitam ukuran M", unit: "pcs", supplier: "Konveksi blank lokal", opening: 36, cost: 32000, minimum: 12, category: "Produk jadi" },
      { name: "Kain linen warna natural", unit: "meter", supplier: "Toko kain Tanah Abang", opening: 42, cost: 56000, minimum: 12, category: "Bahan kain" },
      { name: "Poly mailer ukuran M", unit: "pak", supplier: "Pemasok kemasan online", opening: 8, cost: 38000, minimum: 3, category: "Pengiriman" },
    ],
    expenseCategories: ["Bahan kain dan blank", "Jasa jahit", "Sablon atau bordir", "Foto katalog", "Biaya marketplace", "Retur ukuran"],
    customerTypes: ["Pembeli koleksi harian", "Reseller butik kecil", "Pelanggan seragam komunitas"],
    adminExamples: ["Kartu ukuran dan warna per SKU", "Persetujuan sampel jahit", "Form retur dengan kondisi barang"],
    marketingExamples: [
      { offer: "Kaos cotton combed dengan panduan ukuran", hook: "Cek lebar dada dan panjang kaos sebelum memilih ukuran.", channel: "Carousel Instagram", cta: "Kirim tinggi dan ukuran favorit untuk rekomendasi" },
      { offer: "Pre-order kemeja linen warna natural", hook: "Warna netral mudah dipadukan; lihat detail kain sebelum memesan.", channel: "Katalog WhatsApp", cta: "Tanyakan jadwal produksi batch berikut" },
      { offer: "Paket reseller 12 pcs campur ukuran", hook: "Mulai stok dengan campuran ukuran yang tercatat jelas.", channel: "Grup reseller", cta: "Minta lembar size mix dan syarat reseller" },
    ], units: ["pcs", "meter", "roll", "pak", "ukuran"],
  },
  LND: {
    code: "LND",
    products: [
      { name: "Cuci Kering Lipat Reguler", price: 8000, yield: 1, unit: "kg", materials: [{ name: "deterjen", qty: 18, unit: "g", unitCost: 32 }, { name: "pewangi", qty: 12, unit: "ml", unitCost: 28 }, { name: "plastik kemasan", qty: 1, unit: "lembar", unitCost: 500 }] },
      { name: "Cuci Setrika Express", price: 14000, yield: 1, unit: "kg", materials: [{ name: "deterjen", qty: 20, unit: "g", unitCost: 32 }, { name: "listrik mesin", qty: 1, unit: "kg", unitCost: 650 }, { name: "tenaga express", qty: 1, unit: "kg", unitCost: 2400 }] },
      { name: "Cuci Sepatu Basic", price: 45000, yield: 1, unit: "pasang", materials: [{ name: "sabun sepatu", qty: 15, unit: "ml", unitCost: 90 }, { name: "sikat dan cloth", qty: 1, unit: "pakai", unitCost: 1200 }, { name: "tag pelanggan", qty: 1, unit: "pcs", unitCost: 300 }] },
    ],
    inventoryItems: [
      { name: "Deterjen cair konsentrat", unit: "liter", supplier: "Distributor laundry", opening: 14, cost: 42000, minimum: 5, category: "Bahan cuci" },
      { name: "Pewangi floral", unit: "liter", supplier: "Pemasok parfum laundry", opening: 8, cost: 37000, minimum: 3, category: "Finishing" },
      { name: "Plastik laundry 40 x 60", unit: "pak", supplier: "Toko plastik grosir", opening: 10, cost: 29000, minimum: 4, category: "Kemasan" },
    ],
    expenseCategories: ["Deterjen dan pewangi", "Listrik mesin", "Air sumur atau PAM", "Plastik kemasan", "Perawatan mesin", "Antar jemput"],
    customerTypes: ["Keluarga pelanggan kiloan", "Penghuni kos bulanan", "Pelanggan cuci sepatu"],
    adminExamples: ["Tag nomor nota dan nama pelanggan", "Log pakaian khusus atau luntur", "Jadwal servis mesin cuci"],
    marketingExamples: [
      { offer: "Paket langganan cuci 20 kg", hook: "Atur kebutuhan cuci bulanan dengan kuota dan masa berlaku tertulis.", channel: "WhatsApp lingkungan", cta: "Tanyakan area dan jadwal penjemputan" },
      { offer: "Cuci sepatu basic", hook: "Periksa bahan sepatu dulu agar metode pembersihan sesuai.", channel: "Instagram sebelum-sesudah", cta: "Kirim foto kondisi sepatu untuk estimasi" },
      { offer: "Layanan express dengan kuota harian", hook: "Butuh pakaian lebih cepat? Cek kuota express sebelum menitipkan.", channel: "Google Business Profile", cta: "Hubungi outlet untuk cek slot hari ini" },
    ], units: ["kg", "pasang", "liter", "lembar", "siklus"],
  },
  SAL: {
    code: "SAL",
    products: [
      { name: "Potong Rambut Pria", price: 55000, yield: 1, unit: "sesi", materials: [{ name: "cape dan sanitasi", qty: 1, unit: "sesi", unitCost: 1200 }, { name: "pomade tester", qty: 2, unit: "g", unitCost: 300 }, { name: "waktu barber", qty: 30, unit: "menit", unitCost: 650 }] },
      { name: "Hair Spa Basic", price: 135000, yield: 1, unit: "sesi", materials: [{ name: "cream bath", qty: 25, unit: "g", unitCost: 115 }, { name: "handuk laundry", qty: 1, unit: "pcs", unitCost: 1800 }, { name: "waktu stylist", qty: 50, unit: "menit", unitCost: 700 }] },
      { name: "Paket Potong + Cuci", price: 85000, yield: 1, unit: "sesi", materials: [{ name: "shampoo", qty: 12, unit: "ml", unitCost: 35 }, { name: "conditioner", qty: 8, unit: "ml", unitCost: 42 }, { name: "waktu layanan", qty: 45, unit: "menit", unitCost: 680 }] },
    ],
    inventoryItems: [
      { name: "Shampoo salon 1 L", unit: "botol", supplier: "Distributor perawatan rambut", opening: 6, cost: 118000, minimum: 2, category: "Bahan layanan" },
      { name: "Sarung cape", unit: "pcs", supplier: "Perlengkapan barber", opening: 12, cost: 28000, minimum: 4, category: "Perlengkapan" },
      { name: "Pomade retail 80 g", unit: "pcs", supplier: "Distributor grooming", opening: 18, cost: 39000, minimum: 6, category: "Produk retail" },
    ],
    expenseCategories: ["Bahan treatment", "Laundry handuk", "Komisi stylist", "Sewa kursi", "Perawatan alat", "Iklan lokal"],
    customerTypes: ["Pelanggan potong rutin", "Pelanggan treatment rambut", "Pelanggan grooming menjelang acara"],
    adminExamples: ["Kartu preferensi dan formula warna", "Jadwal barber per kursi", "Persetujuan harga treatment"],
    marketingExamples: [
      { offer: "Paket potong dan cuci", hook: "Satu kunjungan untuk potong rapi dan cuci rambut.", channel: "Google Business Profile", cta: "Pilih slot layanan melalui WhatsApp" },
      { offer: "Pengingat jadwal potong 3-4 minggu", hook: "Catat tanggal kunjungan agar mudah mengatur jadwal berikutnya.", channel: "Pesan pascalayanan", cta: "Balas pesan ini untuk pilih waktu" },
      { offer: "Hair spa setelah konsultasi kondisi rambut", hook: "Mulai dari konsultasi singkat sebelum memilih perawatan.", channel: "Instagram edukasi", cta: "Tanyakan durasi dan bahan yang digunakan" },
    ], units: ["sesi", "menit", "ml", "gram", "kursi"],
  },
  BNG: {
    code: "BNG",
    products: [
      { name: "Servis Berkala Motor Matic", price: 185000, yield: 1, unit: "pekerjaan", materials: [{ name: "oli mesin", qty: 0.8, unit: "liter", unitCost: 78000 }, { name: "busi", qty: 1, unit: "pcs", unitCost: 18000 }, { name: "tenaga mekanik", qty: 1, unit: "pekerjaan", unitCost: 42000 }] },
      { name: "Ganti Kampas Rem Depan", price: 145000, yield: 1, unit: "pekerjaan", materials: [{ name: "kampas rem", qty: 1, unit: "set", unitCost: 52000 }, { name: "pembersih rem", qty: 20, unit: "ml", unitCost: 85 }, { name: "waktu mekanik", qty: 35, unit: "menit", unitCost: 680 }] },
      { name: "Tambal Ban Tubeless", price: 35000, yield: 1, unit: "pekerjaan", materials: [{ name: "plug tubeless", qty: 1, unit: "pcs", unitCost: 2500 }, { name: "lem", qty: 2, unit: "ml", unitCost: 300 }, { name: "waktu mekanik", qty: 15, unit: "menit", unitCost: 700 }] },
    ],
    inventoryItems: [
      { name: "Oli mesin 10W-40", unit: "botol", supplier: "Distributor oli resmi", opening: 24, cost: 68000, minimum: 8, category: "Pelumas" },
      { name: "Busi motor matic", unit: "pcs", supplier: "Agen suku cadang", opening: 18, cost: 13500, minimum: 6, category: "Suku cadang" },
      { name: "Kampas rem depan", unit: "set", supplier: "Distributor part", opening: 10, cost: 47000, minimum: 3, category: "Suku cadang" },
    ],
    expenseCategories: ["Suku cadang", "Consumable bengkel", "Upah mekanik", "Listrik kompresor", "Pembuangan oli bekas", "Peralatan kerja"],
    customerTypes: ["Pengendara motor harian", "Pemilik armada kurir", "Pelanggan servis berkala"],
    adminExamples: ["Form keluhan dan kilometer kendaraan", "Persetujuan estimasi suku cadang", "Checklist inspeksi akhir servis"],
    marketingExamples: [
      { offer: "Pemeriksaan ringan sebelum servis berkala", hook: "Catat kilometer dan keluhan sebelum mekanik mulai bekerja.", channel: "WhatsApp pelanggan lama", cta: "Kirim tipe motor dan kilometer terakhir" },
      { offer: "Paket oli dan pemeriksaan rem", hook: "Rincian oli, pemeriksaan, dan ongkos kerja ditulis sebelum pengerjaan.", channel: "Papan bengkel", cta: "Minta estimasi tertulis di meja servis" },
      { offer: "Pengingat servis armada kurir", hook: "Rekap tanggal servis dan kilometer tiap motor dalam satu daftar.", channel: "Penawaran langsung ke usaha kurir", cta: "Minta jadwal pemeriksaan armada" },
    ], units: ["pekerjaan", "pcs", "set", "liter", "menit"],
  },
  ONL: {
    code: "ONL",
    products: [
      { name: "Kemeja Casual Reseller", price: 145000, yield: 1, unit: "pcs", materials: [{ name: "harga supplier", qty: 1, unit: "pcs", unitCost: 82000 }, { name: "poly mailer", qty: 1, unit: "pcs", unitCost: 900 }, { name: "biaya platform", qty: 1, unit: "order", unitCost: 8700 }] },
      { name: "Paket Organizer Meja", price: 99000, yield: 1, unit: "paket", materials: [{ name: "organizer", qty: 1, unit: "pcs", unitCost: 42000 }, { name: "bubble wrap", qty: 1, unit: "lembar", unitCost: 1800 }, { name: "kardus", qty: 1, unit: "pcs", unitCost: 3200 }] },
      { name: "Bundle Perawatan Sepatu", price: 119000, yield: 1, unit: "bundle", materials: [{ name: "cleaner", qty: 1, unit: "botol", unitCost: 38000 }, { name: "brush", qty: 1, unit: "pcs", unitCost: 16000 }, { name: "kain microfiber", qty: 1, unit: "pcs", unitCost: 6500 }] },
    ],
    inventoryItems: [
      { name: "Kemeja casual warna navy", unit: "pcs", supplier: "Supplier reseller Bandung", opening: 20, cost: 82000, minimum: 6, category: "Fashion" },
      { name: "Kardus kirim ukuran M", unit: "pcs", supplier: "Toko kemasan online", opening: 75, cost: 3200, minimum: 25, category: "Pengiriman" },
      { name: "Bubble wrap 50 cm", unit: "roll", supplier: "Pemasok packing", opening: 4, cost: 48000, minimum: 2, category: "Pengiriman" },
    ],
    expenseCategories: ["Pembelian supplier", "Biaya marketplace", "Iklan produk", "Packing", "Subsidi ongkir", "Retur dan refund"],
    customerTypes: ["Pembeli marketplace baru", "Pelanggan repeat order", "Reseller mengambil stok kecil"],
    adminExamples: ["Nomor pesanan dan kanal penjualan", "Log retur dengan alasan", "Rekap stok sinkron per SKU"],
    marketingExamples: [
      { offer: "Bundle organizer meja dengan dua ukuran", hook: "Bandingkan ukuran meja sebelum memilih organizer.", channel: "Foto listing marketplace", cta: "Lihat tabel ukuran di gambar produk" },
      { offer: "Voucher repeat order terjadwal", hook: "Gunakan voucher pada pembelian berikutnya sebelum masa berlaku berakhir.", channel: "Pesan pascapembelian", cta: "Buka toko dan masukkan kode voucher" },
      { offer: "Video proses packing pesanan rapuh", hook: "Lihat cara barang dikemas sebelum dikirim.", channel: "Video marketplace", cta: "Tanyakan opsi kemasan tambahan" },
    ], units: ["pcs", "paket", "bundle", "order", "roll"],
  },
  BAK: {
    code: "BAK",
    products: [
      { name: "Brownies Cokelat Loyang 20 cm", price: 115000, yield: 8, unit: "potong", materials: [{ name: "cokelat compound", qty: 180, unit: "g", unitCost: 95 }, { name: "telur", qty: 3, unit: "butir", unitCost: 2200 }, { name: "box brownies", qty: 1, unit: "pcs", unitCost: 6500 }] },
      { name: "Roti Sobek Keju", price: 48000, yield: 6, unit: "pcs", materials: [{ name: "tepung protein tinggi", qty: 350, unit: "g", unitCost: 16 }, { name: "keju", qty: 80, unit: "g", unitCost: 105 }, { name: "gas oven", qty: 1, unit: "batch", unitCost: 4200 }] },
      { name: "Cookies Oat 250 g", price: 65000, yield: 1, unit: "toples", materials: [{ name: "rolled oat", qty: 120, unit: "g", unitCost: 45 }, { name: "butter", qty: 90, unit: "g", unitCost: 115 }, { name: "toples PET", qty: 1, unit: "pcs", unitCost: 4800 }] },
    ],
    inventoryItems: [
      { name: "Tepung protein tinggi", unit: "kg", supplier: "Toko bahan bakery", opening: 18, cost: 14500, minimum: 6, category: "Bahan adonan" },
      { name: "Cokelat compound", unit: "kg", supplier: "Distributor cokelat", opening: 7, cost: 95000, minimum: 2, category: "Bahan topping" },
      { name: "Box brownies 20 cm", unit: "pcs", supplier: "Pemasok kemasan kue", opening: 32, cost: 6500, minimum: 12, category: "Kemasan" },
    ],
    expenseCategories: ["Tepung dan bahan resep", "Gas oven", "Kemasan dan label", "Produk gagal batch", "Komisi titip jual", "Pengiriman dingin"],
    customerTypes: ["Pelanggan hampers", "Kantor pesan snack rapat", "Pembeli roti harian"],
    adminExamples: ["Kartu resep dan berat adonan", "Label tanggal produksi dan batas konsumsi", "Rekap pesanan hampers per tanggal"],
    marketingExamples: [
      { offer: "Brownies loyang untuk rapat", hook: "Potongan seragam untuk dibagikan; pesan sebelum jadwal produksi.", channel: "WhatsApp kantor sekitar", cta: "Kirim jumlah loyang dan tanggal ambil" },
      { offer: "Roti sobek keju batch pagi", hook: "Roti dibuat per batch; tanyakan jam keluar oven.", channel: "Instagram Story", cta: "Pesan jumlah sebelum batch habis" },
      { offer: "Hampers cookies dengan kartu ucapan", hook: "Pilih isi toples dan jadwal kirim sebelum tanggal acara.", channel: "Katalog WhatsApp", cta: "Minta daftar isi serta pilihan kartu" },
    ], units: ["batch", "loyang", "potong", "toples", "gram"],
  },
  PRO: {
    code: "PRO",
    products: [
      { name: "Konsultasi Operasional 90 Menit", price: 650000, yield: 1, unit: "sesi", materials: [{ name: "waktu konsultan", qty: 1.5, unit: "jam", unitCost: 180000 }, { name: "persiapan dokumen", qty: 1, unit: "jam", unitCost: 120000 }, { name: "video call", qty: 1, unit: "sesi", unitCost: 8000 }] },
      { name: "Paket Desain Identitas Dasar", price: 2800000, yield: 1, unit: "proyek", materials: [{ name: "jam desain", qty: 18, unit: "jam", unitCost: 95000 }, { name: "font berlisensi", qty: 1, unit: "proyek", unitCost: 120000 }, { name: "revisi terjadwal", qty: 3, unit: "putaran", unitCost: 65000 }] },
      { name: "Review Laporan Keuangan", price: 950000, yield: 1, unit: "paket", materials: [{ name: "waktu analis", qty: 3, unit: "jam", unitCost: 145000 }, { name: "software akuntansi", qty: 1, unit: "bulan", unitCost: 45000 }, { name: "rapat hasil", qty: 1, unit: "sesi", unitCost: 18000 }] },
    ],
    inventoryItems: [
      { name: "Jam konsultasi tersedia", unit: "jam", supplier: "Kapasitas internal", opening: 80, cost: 180000, minimum: 18, category: "Kapasitas layanan" },
      { name: "Lisensi desain bulanan", unit: "lisensi", supplier: "Vendor perangkat lunak", opening: 3, cost: 420000, minimum: 1, category: "Perangkat kerja" },
      { name: "Slot proyek aktif", unit: "proyek", supplier: "Kapasitas tim", opening: 5, cost: 0, minimum: 1, category: "Kapasitas delivery" },
    ],
    expenseCategories: ["Jam kerja delivery", "Lisensi software", "Subkontraktor", "Komunikasi klien", "Riset dan persiapan", "Pemasaran profesional"],
    customerTypes: ["Pemilik usaha yang butuh pendampingan", "Tim kecil tanpa staf spesialis", "Klien proyek dengan kebutuhan terukur"],
    adminExamples: ["Brief kebutuhan dan ruang lingkup", "Log jam kerja per proyek", "Persetujuan revisi dan serah terima"],
    marketingExamples: [
      { offer: "Sesi pemetaan masalah 90 menit", hook: "Sesi berakhir dengan daftar prioritas dan langkah yang disepakati.", channel: "LinkedIn dan jaringan profesional", cta: "Kirim ringkasan kebutuhan untuk cek kecocokan" },
      { offer: "Paket desain identitas dengan batas revisi jelas", hook: "Lihat tahapan, file akhir, dan jumlah putaran revisi sebelum mulai.", channel: "Portofolio situs", cta: "Minta brief awal dan jadwal proyek" },
      { offer: "Review laporan keuangan untuk pemilik usaha", hook: "Fokus pada pencatatan, arus kas, dan pertanyaan yang perlu ditindaklanjuti.", channel: "Webinar komunitas", cta: "Siapkan laporan bulanan untuk sesi pengenalan" },
    ], units: ["jam", "sesi", "proyek", "lisensi", "putaran"],
  },
};

export const NICHE_DATA: Record<NicheCode, NicheData> = Object.fromEntries(
  NICHE_PROFILES.map((profile) => [profile.nicheCode as NicheCode, { ...EXAMPLES[profile.nicheCode as NicheCode], profile }]),
) as Record<NicheCode, NicheData>;

export const NICHE_CODES = Object.keys(NICHE_DATA) as NicheCode[];