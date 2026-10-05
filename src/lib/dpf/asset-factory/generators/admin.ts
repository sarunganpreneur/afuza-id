import { MASTER_SPECS } from "../masters";
import type { GeneratedFile, PlannedProduct } from "../types";
import { addHeader, addInstructions, addTitle, createWorkbook, editableDocx, inputCell, MIME, quickStartPdf, styleTable, workbookBytes } from "./shared";

export async function generateAdmin(plan: PlannedProduct): Promise<GeneratedFile[]> {
  const workbook = createWorkbook(plan.product.title, plan.product.sku);
  const customers = workbook.addWorksheet("Pelanggan");
  addTitle(customers, `Database pelanggan ${plan.niche.profile.name}`, "Simpan informasi yang diperlukan untuk pelayanan; batasi akses data pribadi.", 8);
  addHeader(customers, 4, ["ID", "Nama pelanggan", "Jenis pelanggan", "Kontak", "Kebutuhan / preferensi", "Tanggal terakhir", "Tindak lanjut", "Izin dihubungi"]);
  plan.niche.customerTypes.forEach((type, index) => customers.addRow([`${plan.niche.code}-C${String(index + 1).padStart(3, "0")}`, `Contoh ${type}`, type, "", plan.niche.adminExamples[index % plan.niche.adminExamples.length], new Date(Date.UTC(2026, 5, index + 1)), "Isi hanya bila disepakati", "Periksa persetujuan"]));
  for (let row = 5; row <= 54; row += 1) { ["A", "B", "C", "D", "E", "F", "G", "H"].forEach((column) => inputCell(customers.getCell(`${column}${row}`))); customers.getCell(`F${row}`).numFmt = "dd mmm yyyy"; }
  styleTable(customers, [18, 30, 30, 24, 45, 18, 34, 22], 4);

  const suppliers = workbook.addWorksheet("Pemasok");
  addTitle(suppliers, `Database pemasok ${plan.niche.profile.name}`, "Catat barang/jasa yang biasa dibeli dan syarat pemesanan.", 7);
  addHeader(suppliers, 4, ["ID pemasok", "Nama pemasok", "Barang / layanan", "Kontak", "Lead time", "Syarat pembayaran", "Evaluasi terakhir"]);
  plan.niche.inventoryItems.forEach((item, index) => suppliers.addRow([`${plan.niche.code}-S${String(index + 1).padStart(3, "0")}`, item.supplier, item.name, "", "Isi hari kerja", "Isi sesuai kesepakatan", "Bandingkan mutu dan ketepatan"]));
  for (let row = 5; row <= 44; row += 1) ["A", "B", "C", "D", "E", "F", "G"].forEach((column) => inputCell(suppliers.getCell(`${column}${row}`)));
  styleTable(suppliers, [20, 34, 34, 24, 18, 28, 36], 4);

  const quote = workbook.addWorksheet("Penawaran");
  addTitle(quote, "Form penawaran", `${plan.niche.profile.name} | Isi ruang lingkup, jumlah, harga, masa berlaku, dan persetujuan.`, 6);
  addHeader(quote, 4, ["No.", "Produk / layanan", "Ruang lingkup", "Jumlah", "Harga satuan (Rp)", "Subtotal (Rp)"]);
  [1, 2, 3, 4, 5].forEach((index) => quote.addRow([index, index === 1 ? plan.niche.products[0].name : "", index === 1 ? `Contoh: ${plan.niche.adminExamples[0]}` : "", index === 1 ? 1 : 0, index === 1 ? plan.niche.products[0].price : 0, { formula: `D${index + 4}*E${index + 4}` }]));
  for (let row = 5; row <= 9; row += 1) { ["B", "C", "D", "E"].forEach((column) => inputCell(quote.getCell(`${column}${row}`))); quote.getCell(`E${row}`).numFmt = '"Rp" #,##0'; quote.getCell(`F${row}`).numFmt = '"Rp" #,##0'; }
  quote.addRow(["Pelanggan", "Isi nama dan kontak yang disepakati", "", "Berlaku sampai", "Isi tanggal", ""]);
  quote.addRow(["Persetujuan", "Nama / tanggal / cara menyetujui penawaran", "", "Total penawaran", "", { formula: "SUM(F5:F9)" }]);
  quote.getCell("F11").numFmt = '"Rp" #,##0';
  styleTable(quote, [18, 32, 44, 18, 22, 22], 4);

  const order = workbook.addWorksheet("Pesanan");
  addTitle(order, "Form pesanan / purchase order", "Catat barang atau layanan, kuantitas, tanggal dibutuhkan, dan bukti persetujuan.", 6);
  addHeader(order, 4, ["No.", "Barang / layanan", "Pemasok / pelanggan", "Jumlah", "Satuan", "Tanggal diperlukan"]);
  for (let index = 1; index <= 8; index += 1) order.addRow([index, index === 1 ? plan.niche.inventoryItems[0].name : "", index === 1 ? plan.niche.inventoryItems[0].supplier : "", index === 1 ? 1 : 0, index === 1 ? plan.niche.inventoryItems[0].unit : "", ""]);
  for (let row = 5; row <= 12; row += 1) ["B", "C", "D", "E", "F"].forEach((column) => inputCell(order.getCell(`${column}${row}`)));
  styleTable(order, [12, 36, 34, 14, 16, 22], 4);

  const register = workbook.addWorksheet("Nomor Dokumen");
  addTitle(register, "Panduan penomoran dan checklist", "Contoh format membantu mencari dokumen; sesuaikan dengan arsip usaha.", 4);
  addHeader(register, 4, ["Jenis dokumen", "Format contoh", "Kapan digunakan", "Checklist sebelum simpan"]);
  [
    ["Penawaran", `QUO-${plan.niche.code}-YYYYMM-001`, "Sebelum menyetujui pekerjaan atau pesanan.", "Ruang lingkup, harga, masa berlaku, persetujuan."],
    ["Pesanan pembelian", `PO-${plan.niche.code}-YYYYMM-001`, "Saat memesan barang ke pemasok.", `Barang: ${plan.niche.inventoryItems[0].name}; jumlah dan tanggal jelas.`],
    ["Invoice", `INV-${plan.niche.code}-YYYYMM-001`, "Saat menagih pembayaran.", "Nama pihak, uraian, jumlah, jatuh tempo, rekening resmi."],
    ["Penerimaan", `GRN-${plan.niche.code}-YYYYMM-001`, "Saat memeriksa barang/jasa diterima.", "Kuantitas, kondisi, selisih, foto bila perlu."],
    ["Beban", `EXP-${plan.niche.code}-YYYYMM-001`, "Saat mendokumentasikan pengeluaran.", `Kategori sesuai usaha: ${plan.niche.expenseCategories[0]}.`],
    ["Pembayaran", `PAY-${plan.niche.code}-YYYYMM-001`, "Saat pembayaran masuk/keluar dikonfirmasi.", "Nomor referensi, nilai, tanggal, bukti tersimpan."],
  ].forEach((row) => register.addRow(row));
  styleTable(register, [26, 33, 48, 62], 4);

  const checklist = workbook.addWorksheet("Checklist");
  addTitle(checklist, `Checklist administrasi ${plan.niche.profile.name}`, "Gunakan sebelum menutup transaksi atau pekerjaan. Tambahkan bukti dan penanggung jawab.", 5);
  addHeader(checklist, 4, ["Tahap", "Pemeriksaan", "Bukti / nomor dokumen", "Penanggung jawab", "Selesai"]);
  [
    ["Pelanggan", plan.niche.adminExamples[0]],
    ["Pemasok", `Pastikan barang/jasa ${plan.niche.inventoryItems[0].name} sesuai pesanan.`],
    ["Penawaran", "Ruang lingkup, nilai, dan masa berlaku sudah disetujui."],
    ["Pesanan", "Jumlah dan tanggal diperlukan dicatat."],
    ["Penerimaan", "Jumlah dan kondisi dibandingkan dengan pesanan."],
    ["Beban", `Pilih kategori yang sesuai seperti ${plan.niche.expenseCategories[0]}.`],
    ["Pembayaran", "Nilai, tanggal, metode, dan bukti direkonsiliasi."],
    ["Arsip", "Dokumen disimpan dengan nomor dan lokasi yang mudah ditemukan."],
  ].forEach((row) => checklist.addRow([...row, "", "", "Belum"]));
  for (let row = 5; row <= 12; row += 1) ["C", "D", "E"].forEach((column) => inputCell(checklist.getCell(`${column}${row}`)));
  styleTable(checklist, [20, 62, 34, 25, 16], 4);
  addInstructions(workbook, plan, ["Isi database pelanggan dan pemasok hanya dengan informasi yang diperlukan.", "Gunakan nomor penawaran/pesanan/invoice berurutan dan jangan mendaur ulang nomor.", "Simpan persetujuan sebelum memulai pekerjaan atau membeli barang.", "Catat penerimaan, beban, dan pembayaran dengan bukti yang dapat ditemukan kembali."]);

  const editableForms = await editableDocx(`Form administrasi usaha ${plan.niche.profile.name}`, `${plan.product.sku} | Template editable; duplikasi per dokumen`, [
    { heading: "Form penawaran", paragraphs: ["Nomor: ____________________    Tanggal: ____________________", "Pelanggan: ____________________    Kontak: ____________________", `Kebutuhan / lingkup: ${plan.niche.products[0].name} | ${plan.niche.adminExamples[0]}`, "Harga dan masa berlaku: __________________________________________", "Persetujuan pelanggan (nama/tanggal): ____________________________"], table: [["Uraian", "Jumlah", "Harga satuan", "Subtotal"], [plan.niche.products[0].name, "", "", ""], ["Total", "", "", ""]] },
    { heading: "Template invoice", paragraphs: ["Nomor invoice: ____________________    Tanggal terbit: ____________________", "Jatuh tempo: ____________________    Status: Belum lunas / Sebagian / Lunas", "Ditagihkan kepada: ____________________    Kontak: ____________________", `Uraian contoh: ${plan.niche.products[0].name}`, "Cara pembayaran dan rekening resmi: __________________________________", "Tanggal dan referensi pembayaran: _____________________________________"], table: [["Uraian", "Jumlah", "Harga satuan", "Subtotal"], [plan.niche.products[0].name, "", "", ""], ["Total tagihan", "", "", ""], ["Pembayaran diterima", "", "", ""], ["Sisa tagihan", "", "", ""]] },
    { heading: "Catatan penerimaan", paragraphs: [`Barang/jasa: ${plan.niche.inventoryItems[0].name}`, `Pemasok: ${plan.niche.inventoryItems[0].supplier}`, "Tanggal diterima: __________  Jumlah dipesan: __________  Jumlah diterima: __________", "Kondisi / selisih / tindakan: ________________________________________", "Diperiksa oleh: ____________________"], table: [["Item", "Satuan", "Jumlah", "Kondisi"], [plan.niche.inventoryItems[0].name, plan.niche.inventoryItems[0].unit, "", ""]] },
    { heading: "Catatan pengeluaran dan pembayaran", paragraphs: [`Kategori contoh: ${plan.niche.expenseCategories[0]}`, "Nomor bukti: __________  Tanggal: __________  Nilai: __________", "Dibayar kepada / diterima dari: ____________________", "Metode dan referensi pembayaran: ____________________", "Lampiran bukti disimpan di: ____________________"] },
    { heading: "Checklist administrasi", paragraphs: plan.niche.adminExamples.map((example) => `☐ ${example}`).concat(["☐ Dokumen diberi nomor dan tanggal.", "☐ Bukti transaksi disimpan bersama catatan."]) },
  ]);
  return [
    { role: "primary-workbook", filename: `${plan.product.sku}-Administrasi.xlsx`, mimeType: MIME.xlsx, bytes: await workbookBytes(workbook) },
    { role: "editable-forms", filename: `${plan.product.sku}-Formulir-Editable.docx`, mimeType: MIME.docx, bytes: editableForms },
    { role: "quick-start", filename: `${plan.product.sku}-Panduan-Cepat.pdf`, mimeType: MIME.pdf, bytes: await quickStartPdf(plan, MASTER_SPECS.ADMIN.modules) },
  ];
}