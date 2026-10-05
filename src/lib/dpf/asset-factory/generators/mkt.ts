import { MASTER_SPECS } from "../masters";
import type { GeneratedFile, PlannedProduct } from "../types";
import { addHeader, addInstructions, addTitle, createWorkbook, editableDocx, inputCell, MIME, quickStartPdf, styleTable, workbookBytes } from "./shared";

export async function generateMkt(plan: PlannedProduct): Promise<GeneratedFile[]> {
  const workbook = createWorkbook(plan.product.title, plan.product.sku);
  const persona = workbook.addWorksheet("Persona");
  addTitle(persona, `Persona pelanggan ${plan.niche.profile.name}`, "Pilih satu kelompok untuk diuji. Jangan menganggap contoh berikut mewakili semua pelanggan.", 4);
  addHeader(persona, 4, ["Aspek", "Hipotesis awal", "Bukti yang perlu dicari", "Hasil wawancara / observasi"]);
  [
    ["Segmen", plan.niche.customerTypes[0], "Siapa yang membeli dan dalam situasi apa?", ""],
    ["Kebutuhan", plan.niche.marketingExamples[0].offer, "Masalah apa yang ingin dibereskan?", ""],
    ["Hambatan", "Harga, waktu, ukuran, ketersediaan, atau kepercayaan", "Pertanyaan apa yang sering ditanyakan sebelum membeli?", ""],
    ["Kanal saat ini", plan.niche.marketingExamples[0].channel, "Di mana pelanggan mencari informasi?", ""],
    ["Pemicu pembelian", plan.niche.profile.revenuePatterns[0], "Kapan mereka siap membeli?", ""],
  ].forEach((row) => persona.addRow(row));
  for (let row = 5; row <= 9; row += 1) inputCell(persona.getCell(`D${row}`));
  styleTable(persona, [25, 44, 52, 50], 4);

  const offer = workbook.addWorksheet("Penawaran");
  addTitle(offer, `Lembar penawaran ${plan.niche.profile.name}`, "Jelaskan isi, batas, harga, dan cara membeli tanpa janji yang tidak dapat dibuktikan.", 3);
  addHeader(offer, 4, ["Elemen", "Draf niche", "Versi usaha Anda"]);
  [
    ["Siapa", plan.niche.customerTypes[0]],
    ["Masalah / kebutuhan", plan.niche.profile.businessModel],
    ["Isi penawaran", plan.niche.marketingExamples[0].offer],
    ["Bukti yang dapat ditunjukkan", `Foto/daftar isi/harga nyata untuk ${plan.niche.products[0].name}`],
    ["Batas dan syarat", "Stok, area layanan, jadwal, masa berlaku: isi sesuai kondisi."],
    ["Harga", `Harga contoh ${plan.niche.products[0].price}; ganti sesuai kalkulasi usaha.`],
    ["CTA", plan.niche.marketingExamples[0].cta],
  ].forEach((row) => offer.addRow([...row, ""]));
  for (let row = 5; row <= 11; row += 1) inputCell(offer.getCell(`C${row}`));
  styleTable(offer, [32, 74, 60], 4);

  const usp = workbook.addWorksheet("USP");
  addTitle(usp, "Lembar pembeda yang dapat dibuktikan", "Gunakan proses, pilihan, atau informasi nyata. Hindari klaim nomor satu atau hasil pasti tanpa bukti.", 4);
  addHeader(usp, 4, ["Pertanyaan", "Contoh awal", "Bukti", "Kalimat yang boleh dipakai"]);
  [
    ["Apa yang dijual?", plan.niche.products[0].name, "Daftar produk/jasa, foto, spesifikasi", "Kami menyediakan …"],
    ["Bagaimana prosesnya?", plan.niche.adminExamples[0], "Alur kerja atau checklist", "Sebelum selesai, kami …"],
    ["Apa pilihan yang jelas?", plan.niche.products.map((item) => item.name).join("; "), "Menu/katalog dan harga yang berlaku", "Pilih … sesuai kebutuhan …"],
    ["Apa batas penawarannya?", "Ketersediaan dan jadwal dikonfirmasi sebelum transaksi.", "Catatan stok/jadwal", "Tanyakan ketersediaan sebelum memesan."],
  ].forEach((row) => usp.addRow([...row, ""]));
  for (let row = 5; row <= 8; row += 1) inputCell(usp.getCell(`D${row}`));
  styleTable(usp, [34, 54, 48, 50], 4);

  const calendar = workbook.addWorksheet("Kalender 30 Hari");
  addTitle(calendar, `Kalender konten 30 hari ${plan.niche.profile.name}`, "Ritme saran: edukasi, bukti, produk, proses, dan ajakan. Sesuaikan dengan kapasitas dan stok.", 8);
  addHeader(calendar, 4, ["Hari", "Pilar", "Topik", "Contoh / detail niche", "Kanal", "Format", "CTA", "Status / hasil"]);
  const pillars = ["Edukasi", "Proses", "Produk", "Bukti", "Tanya jawab", "Penawaran"];
  const contentAngles = [
    (product: string) => `Rincian biaya yang membentuk harga ${product}`,
    (product: string) => `Cara memilih jumlah atau varian ${product} sesuai kebutuhan`,
    (product: string) => `Satu tahap proses menyiapkan ${product} yang pelanggan jarang lihat`,
    (product: string) => `Pertanyaan sebelum membeli ${product}: apa yang termasuk dan tidak termasuk`,
    (product: string) => `Cara menyimpan atau merawat ${product} setelah diterima/digunakan`,
    (product: string) => `Kesalahan umum saat memesan ${product} dan cara mencegahnya`,
    (product: string) => `Perbandingan pilihan ${product} berdasarkan ukuran, waktu, atau kebutuhan`,
    (product: string) => `Bahan, komponen, atau alat yang dipakai untuk ${product}`,
    (product: string) => `Kapan perlu memesan ulang ${product}; jelaskan batas stok/jadwal yang nyata`,
    (product: string, nicheIndex: number) => `Contoh penggunaan ${product} untuk ${plan.niche.customerTypes[nicheIndex]}`,
  ];
  for (let day = 1; day <= 30; day += 1) {
    const productIndex = Math.floor((day - 1) / contentAngles.length);
    const angleIndex = (day - 1) % contentAngles.length;
    const product = plan.niche.products[productIndex];
    const marketing = plan.niche.marketingExamples[productIndex];
    const inventory = plan.niche.inventoryItems[productIndex];
    const topic = contentAngles[angleIndex](`${product.name}${angleIndex === 7 ? `, termasuk ${product.materials[0].name}` : angleIndex === 8 ? `; terkait stok ${inventory.name}` : ""}`, productIndex);
    const evidence = angleIndex === 9 ? `Segmen contoh: ${plan.niche.customerTypes[productIndex]}.` : marketing.hook;
    calendar.addRow([day, pillars[(day - 1) % pillars.length], topic, evidence, marketing.channel, ["Story", "Carousel", "Foto", "Video pendek", "Pesan pelanggan"][day % 5], marketing.cta, "Rencana"]);
  }
  for (let row = 5; row <= 34; row += 1) ["B", "C", "D", "E", "F", "G", "H"].forEach((column) => inputCell(calendar.getCell(`${column}${row}`)));
  styleTable(calendar, [10, 18, 40, 55, 28, 22, 44, 20], 4);

  const hooks = workbook.addWorksheet("Bank Hook CTA");
  addTitle(hooks, "Bank hook dan CTA", "Gunakan sebagai kerangka, lalu tambahkan foto, harga, stok, dan syarat usaha yang benar.", 5);
  addHeader(hooks, 4, ["No.", "Penawaran", "Hook pembuka", "Kanal yang disarankan", "CTA / langkah berikut"]);
  plan.niche.marketingExamples.forEach((item, index) => hooks.addRow([index + 1, item.offer, item.hook, item.channel, item.cta]));
  styleTable(hooks, [10, 42, 60, 32, 48], 4);

  const promo = workbook.addWorksheet("Promo");
  addTitle(promo, "Kalender promosi", "Uji promosi sederhana dengan batas waktu, biaya, stok, dan sasaran yang bisa dihitung.", 7);
  addHeader(promo, 4, ["Mulai", "Selesai", "Penawaran", "Batas / syarat", "Biaya promosi (Rp)", "Target transaksi", "Hasil / catatan"]);
  plan.niche.marketingExamples.forEach((item, index) => promo.addRow([new Date(Date.UTC(2026, 6, 1 + index * 7)), new Date(Date.UTC(2026, 6, 6 + index * 7)), item.offer, "Tulis kuota, area, dan syarat nyata", index === 0 ? 150000 : 0, 10, "Isi setelah promo"]));
  for (let row = 5; row <= 7; row += 1) { ["A", "B", "C", "D", "E", "F", "G"].forEach((column) => inputCell(promo.getCell(`${column}${row}`))); promo.getCell(`A${row}`).numFmt = "dd mmm yyyy"; promo.getCell(`B${row}`).numFmt = "dd mmm yyyy"; promo.getCell(`E${row}`).numFmt = '"Rp" #,##0'; }
  styleTable(promo, [16, 16, 42, 40, 24, 18, 34], 4);

  const campaigns = workbook.addWorksheet("Campaign");
  addTitle(campaigns, "Pelacak campaign", "Pisahkan target dari hasil aktual; gunakan tautan/kode unik bila dapat diterapkan.", 8);
  addHeader(campaigns, 4, ["Campaign", "Kanal", "Biaya (Rp)", "Jangkauan", "Prospek", "Transaksi", "Omzet (Rp)", "Catatan"]);
  plan.niche.marketingExamples.forEach((item) => campaigns.addRow([item.offer, item.channel, 0, 0, 0, 0, 0, `CTA: ${item.cta}`]));
  for (let row = 5; row <= 34; row += 1) ["A", "B", "C", "D", "E", "F", "G", "H"].forEach((column) => inputCell(campaigns.getCell(`${column}${row}`)));
  campaigns.getColumn(3).numFmt = '"Rp" #,##0';
  campaigns.getColumn(7).numFmt = '"Rp" #,##0';
  styleTable(campaigns, [42, 28, 20, 18, 16, 16, 20, 52], 4);

  const kpi = workbook.addWorksheet("KPI");
  addTitle(kpi, "KPI pemasaran dasar", "Rumus sederhana membantu membandingkan kanal; volume kecil mudah berubah, baca dengan konteks.", 4);
  addHeader(kpi, 4, ["Indikator", "Nilai", "Cara hitung", "Catatan keputusan"]);
  kpi.addRows([
    ["Total biaya campaign (Rp)", { formula: "SUM(Campaign!C5:C34)" }, "Jumlah biaya yang dicatat.", "Masukkan biaya kas aktual."],
    ["Prospek", { formula: "SUM(Campaign!E5:E34)" }, "Kontak/pertanyaan yang memenuhi definisi prospek Anda.", "Gunakan definisi yang sama antarkanal."],
    ["Transaksi", { formula: "SUM(Campaign!F5:F34)" }, "Jumlah transaksi yang dikaitkan dengan campaign.", "Hindari menghitung transaksi ganda."],
    ["Omzet (Rp)", { formula: "SUM(Campaign!G5:G34)" }, "Nilai penjualan tercatat.", "Omzet bukan laba."],
    ["Konversi prospek ke transaksi", { formula: "IFERROR(B7/B6,0)" }, "Transaksi dibagi prospek.", "Bandingkan periode dan kanal sejenis."],
    ["Biaya per prospek (Rp)", { formula: "IFERROR(B5/B6,0)" }, "Biaya campaign dibagi prospek.", "Bandingkan dengan margin kontribusi."],
    ["Nilai pesanan rata-rata (Rp)", { formula: "IFERROR(B8/B7,0)" }, "Omzet dibagi transaksi.", "Gunakan untuk menilai paket/upsell."],
    ["ROAS sederhana", { formula: "IFERROR(B8/B5,0)" }, "Omzet atribusi dibagi biaya campaign.", "Bukan laba dan belum memperhitungkan biaya produk."],
  ]);
  [5, 8, 10, 11].forEach((row) => { kpi.getCell(`B${row}`).numFmt = '"Rp" #,##0'; });
  kpi.getCell("B9").numFmt = "0.0%";
  kpi.getCell("B12").numFmt = "0.00x";
  styleTable(kpi, [38, 25, 55, 54], 4);
  addInstructions(workbook, plan, ["Tulis satu kelompok pelanggan dan satu kebutuhan pada Persona.", "Isi Penawaran dengan isi, harga, syarat, stok, dan CTA yang benar-benar berlaku.", "Rencanakan satu ide per hari pada Kalender 30 Hari; ubah kanal sesuai kebiasaan pelanggan.", "Catat biaya dan hasil di Campaign lalu baca KPI bersama margin produk."]);

  const templates = await editableDocx(`Lembar kerja pemasaran ${plan.niche.profile.name}`, `${plan.product.sku} | Editable; validasi fakta sebelum dipublikasikan`, [
    { heading: "Persona dan kebutuhan", paragraphs: [`Segmen contoh: ${plan.niche.customerTypes[0]}`, `Situasi pembelian: ${plan.niche.profile.businessModel}`, "Wawancarai pelanggan atau amati pertanyaan yang muncul; jangan menganggap hipotesis sebagai fakta."] },
    { heading: "Penawaran dan USP", paragraphs: [`Contoh penawaran: ${plan.niche.marketingExamples[0].offer}`, `Hook: ${plan.niche.marketingExamples[0].hook}`, `CTA: ${plan.niche.marketingExamples[0].cta}`, "Bukti yang tersedia, batas stok, jadwal, harga, dan syarat: __________________________"] },
    { heading: "Rencana konten", table: [["Hari", "Topik", "Kanal", "CTA"], ...plan.niche.marketingExamples.map((item, index) => [`${index + 1}`, item.offer, item.channel, item.cta])], paragraphs: plan.niche.marketingExamples.map((item) => `${item.offer}: ${item.hook}`) },
    { heading: "Review sebelum tayang", paragraphs: ["☐ Harga, stok, jadwal, dan syarat diperiksa.", "☐ Foto dan klaim menggambarkan produk/layanan yang benar.", "☐ Tidak menggunakan testimoni, hasil, atau angka yang belum diverifikasi.", "☐ CTA dapat dilakukan oleh pelanggan melalui kanal yang dicantumkan."] },
  ]);
  return [
    { role: "primary-workbook", filename: `${plan.product.sku}-Marketing.xlsx`, mimeType: MIME.xlsx, bytes: await workbookBytes(workbook) },
    { role: "editable-forms", filename: `${plan.product.sku}-Lembar-Kerja-Editable.docx`, mimeType: MIME.docx, bytes: templates },
    { role: "quick-start", filename: `${plan.product.sku}-Panduan-Cepat.pdf`, mimeType: MIME.pdf, bytes: await quickStartPdf(plan, MASTER_SPECS.MKT.modules) },
  ];
}