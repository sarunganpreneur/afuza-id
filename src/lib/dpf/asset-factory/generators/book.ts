import { MASTER_SPECS } from "../masters";
import type { GeneratedFile, PlannedProduct } from "../types";
import { addHeader, addInstructions, addTitle, createWorkbook, inputCell, MIME, quickStartPdf, styleTable, workbookBytes } from "./shared";

export async function generateBook(plan: PlannedProduct): Promise<GeneratedFile[]> {
  const workbook = createWorkbook(plan.product.title, plan.product.sku);
  const setup = workbook.addWorksheet("Setup Usaha");
  addTitle(setup, "Setup pembukuan", `${plan.niche.profile.name} | Atur nama usaha, bulan laporan, dan saldo awal.`, 3);
  addHeader(setup, 4, ["Informasi", "Isian usaha", "Cara mengisi"]);
  [["Nama usaha", `Usaha ${plan.niche.profile.name}`, "Tulis nama yang tampil di laporan."], ["Bulan laporan", new Date("2026-06-01T00:00:00.000Z"), "Gunakan tanggal pertama bulan."], ["Saldo kas awal (Rp)", 2500000, "Saldo sebelum transaksi pertama."], ["Kontak pencatat", "", "Opsional."]].forEach((row) => setup.addRow(row));
  ["B5", "B6", "B7", "B8"].forEach((cell) => inputCell(setup.getCell(cell)));
  setup.getCell("B6").numFmt = "mmmm yyyy";
  setup.getCell("B7").numFmt = '"Rp" #,##0';
  styleTable(setup, [26, 34, 60], 4);

  const transactions = workbook.addWorksheet("Transaksi");
  addTitle(transactions, `Transaksi ${plan.niche.profile.name}`, "Satu baris untuk satu kejadian uang. Tandai pemasukan/pengeluaran dan status lunas.", 10);
  addHeader(transactions, 4, ["Tanggal", "Jenis", "Kategori", "Uraian", "Pelanggan / pemasok", "Masuk (Rp)", "Keluar (Rp)", "Status", "Jatuh tempo", "Catatan"]);
  const samples = [
    { day: 2, type: "Pemasukan", category: plan.niche.profile.revenuePatterns[0], desc: `Penjualan ${plan.niche.products[0].name}`, party: plan.niche.customerTypes[0], amount: plan.niche.products[0].price * 12, status: "Lunas" },
    { day: 3, type: "Pengeluaran", category: plan.niche.expenseCategories[0], desc: `Pembelian untuk ${plan.niche.products[0].name}`, party: plan.niche.inventoryItems[0].supplier, amount: plan.niche.inventoryItems[0].cost * 4, status: "Lunas" },
    { day: 7, type: "Pemasukan", category: plan.niche.profile.revenuePatterns[1], desc: `Pesanan ${plan.niche.products[1].name}`, party: plan.niche.customerTypes[1], amount: plan.niche.products[1].price * 8, status: "Piutang" },
    { day: 9, type: "Pengeluaran", category: plan.niche.expenseCategories[1], desc: plan.niche.adminExamples[0], party: "Pemasok rutin", amount: 285000, status: "Utang" },
    { day: 14, type: "Pemasukan", category: plan.niche.profile.revenuePatterns[2], desc: `Pesanan ulang ${plan.niche.products[2].name}`, party: plan.niche.customerTypes[2], amount: plan.niche.products[2].price * 6, status: "Lunas" },
  ];
  samples.forEach((item) => transactions.addRow([new Date(Date.UTC(2026, 5, item.day)), item.type, item.category, item.desc, item.party, item.type === "Pemasukan" ? item.amount : 0, item.type === "Pengeluaran" ? item.amount : 0, item.status, item.status === "Lunas" ? "" : new Date(Date.UTC(2026, 5, item.day + 7)), "Contoh; ganti dengan transaksi usaha"]));
  for (let row = 5; row < 5 + samples.length; row += 1) {
    ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].forEach((column) => inputCell(transactions.getCell(`${column}${row}`)));
    transactions.getCell(`A${row}`).numFmt = "dd mmm yyyy";
    transactions.getCell(`I${row}`).numFmt = "dd mmm yyyy";
    transactions.getCell(`F${row}`).numFmt = '"Rp" #,##0';
    transactions.getCell(`G${row}`).numFmt = '"Rp" #,##0';
  }
  for (let row = 10; row <= 104; row += 1) {
    ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].forEach((column) => inputCell(transactions.getCell(`${column}${row}`)));
    transactions.getCell(`A${row}`).numFmt = "dd mmm yyyy";
    transactions.getCell(`I${row}`).numFmt = "dd mmm yyyy";
    transactions.getCell(`F${row}`).numFmt = '"Rp" #,##0';
    transactions.getCell(`G${row}`).numFmt = '"Rp" #,##0';
  }
  styleTable(transactions, [16, 16, 29, 39, 31, 18, 18, 15, 16, 36], 4);

  const summary = workbook.addWorksheet("Ringkasan Bulanan");
  addTitle(summary, "Ringkasan bulanan", "Pilih rentang tanggal; nilai ditarik dari log Transaksi.", 4);
  addHeader(summary, 4, ["Ukuran", "Nilai (Rp)", "Cara baca", "Formula sumber"]);
  summary.addRows([
    ["Pemasukan lunas", { formula: `SUMIFS(Transaksi!F5:F104,Transaksi!A5:A104,">="&DATE(YEAR('Setup Usaha'!B6),MONTH('Setup Usaha'!B6),1),Transaksi!A5:A104,"<"&EDATE('Setup Usaha'!B6,1),Transaksi!H5:H104,"Lunas")` }, "Kas yang benar-benar diterima pada bulan pilihan.", "Tanggal + status Lunas"],
    ["Pengeluaran lunas", { formula: `SUMIFS(Transaksi!G5:G104,Transaksi!A5:A104,">="&DATE(YEAR('Setup Usaha'!B6),MONTH('Setup Usaha'!B6),1),Transaksi!A5:A104,"<"&EDATE('Setup Usaha'!B6,1),Transaksi!H5:H104,"Lunas")` }, "Kas keluar yang telah dibayar.", "Tanggal + status Lunas"],
    ["Laba/rugi kas sederhana", { formula: "B5-B6" }, "Belum termasuk stok akhir atau penyusutan aset.", "Pemasukan lunas - pengeluaran lunas"],
    ["Saldo kas akhir", { formula: "'Setup Usaha'!B7+B7" }, "Saldo awal ditambah hasil kas sederhana.", "Saldo awal + hasil kas"],
    ["Piutang belum lunas", { formula: `SUMIFS(Transaksi!F5:F104,Transaksi!H5:H104,"Piutang",Transaksi!I5:I104,"<="&EOMONTH('Setup Usaha'!B6,0))` }, "Tagih transaksi pemasukan yang belum lunas.", "Status Piutang"],
    ["Utang belum lunas", { formula: `SUMIFS(Transaksi!G5:G104,Transaksi!H5:H104,"Utang",Transaksi!I5:I104,"<="&EOMONTH('Setup Usaha'!B6,0))` }, "Jadwalkan pembayaran biaya yang masih terutang.", "Status Utang"],
  ]);
  for (let row = 5; row <= 10; row += 1) summary.getCell(`B${row}`).numFmt = '"Rp" #,##0';
  styleTable(summary, [30, 22, 57, 39], 4);

  const profit = workbook.addWorksheet("Laba Rugi");
  addTitle(profit, "Ringkasan laba/rugi sederhana", "Ringkasan ini berbasis transaksi lunas, bukan laporan pajak atau akuntansi formal.", 3);
  addHeader(profit, 4, ["Komponen", "Nilai (Rp)", "Catatan"]);
  profit.addRows([
    ["Penjualan diterima", { formula: "'Ringkasan Bulanan'!B5" }, "Transaksi masuk berstatus Lunas."],
    ["Beban dibayar", { formula: "'Ringkasan Bulanan'!B6" }, "Transaksi keluar berstatus Lunas."],
    ["Laba/rugi operasional kas", { formula: "B5-B6" }, "Periksa kembali biaya yang belum dicatat."],
    ["Nilai rata-rata pemasukan tercatat", { formula: `IFERROR(B5/COUNTIFS(Transaksi!B5:B104,"Pemasukan",Transaksi!H5:H104,"Lunas"),0)` }, "Pembagi adalah jumlah transaksi lunas, bukan jumlah pelanggan."],
  ]);
  [5, 6, 7, 8].forEach((row) => { profit.getCell(`B${row}`).numFmt = '"Rp" #,##0'; });
  styleTable(profit, [37, 24, 70], 4);

  const dashboard = workbook.addWorksheet("Dasbor");
  addTitle(dashboard, `Dasbor kas ${plan.niche.profile.name}`, "Angka diambil dari Ringkasan Bulanan; lihat rincian transaksi untuk mengambil keputusan.", 3);
  addHeader(dashboard, 4, ["Indikator", "Nilai (Rp)", "Tindak lanjut"]);
  dashboard.addRows([
    ["Pemasukan lunas", { formula: "'Ringkasan Bulanan'!B5" }, "Bandingkan dengan target bulanan."],
    ["Pengeluaran lunas", { formula: "'Ringkasan Bulanan'!B6" }, `Periksa kategori: ${plan.niche.expenseCategories.slice(0, 2).join("; ")}.`],
    ["Hasil kas", { formula: "'Ringkasan Bulanan'!B7" }, "Jika negatif, periksa waktu pembayaran dan margin."],
    ["Piutang", { formula: "'Ringkasan Bulanan'!B9" }, "Tinjau pelanggan dan tanggal jatuh tempo."],
    ["Utang", { formula: "'Ringkasan Bulanan'!B10" }, "Rencanakan pembayaran kepada pemasok."],
  ]);
  for (let row = 5; row <= 9; row += 1) dashboard.getCell(`B${row}`).numFmt = '"Rp" #,##0';
  styleTable(dashboard, [30, 22, 70], 4);

  addInstructions(workbook, plan, ["Isi nama usaha, bulan laporan, dan saldo kas awal.", "Catat uang masuk dan keluar pada Transaksi; gunakan kategori dari sektor usaha Anda.", "Tandai Piutang atau Utang bila uang belum berpindah.", "Tinjau Ringkasan Bulanan dan Laba Rugi; cocokkan dengan kas dan bukti transaksi."]);
  return [
    { role: "primary-workbook", filename: `${plan.product.sku}-Pembukuan.xlsx`, mimeType: MIME.xlsx, bytes: await workbookBytes(workbook) },
    { role: "quick-start", filename: `${plan.product.sku}-Panduan-Cepat.pdf`, mimeType: MIME.pdf, bytes: await quickStartPdf(plan, MASTER_SPECS.BOOK.modules) },
  ];
}