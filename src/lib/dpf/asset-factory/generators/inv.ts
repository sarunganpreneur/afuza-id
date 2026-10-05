import { MASTER_SPECS } from "../masters";
import type { GeneratedFile, PlannedProduct } from "../types";
import { addHeader, addInstructions, addTitle, createWorkbook, inputCell, MIME, quickStartPdf, styleTable, workbookBytes } from "./shared";

export async function generateInv(plan: PlannedProduct): Promise<GeneratedFile[]> {
  const workbook = createWorkbook(plan.product.title, plan.product.sku);
  const master = workbook.addWorksheet("Daftar Barang");
  addTitle(master, `Master stok ${plan.niche.profile.name}`, "Satu baris untuk satu SKU/barang. Isi stok awal dan batas minimum sesuai pola usaha.", 10);
  addHeader(master, 4, ["SKU internal", "Nama barang", "Kategori", "Satuan", "Pemasok", "Stok awal", "Harga beli (Rp)", "Stok masuk", "Stok keluar", "Stok minimum"]);
  plan.niche.inventoryItems.forEach((item, index) => master.addRow([`${plan.niche.code}-${String(index + 1).padStart(3, "0")}`, item.name, item.category, item.unit, item.supplier, item.opening, item.cost, 0, 0, item.minimum]));
  for (let row = 5; row < 5 + plan.niche.inventoryItems.length; row += 1) {
    ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].forEach((column) => inputCell(master.getCell(`${column}${row}`)));
    master.getCell(`G${row}`).numFmt = '"Rp" #,##0';
  }
  for (let row = 5 + plan.niche.inventoryItems.length; row <= 54; row += 1) {
    ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].forEach((column) => inputCell(master.getCell(`${column}${row}`)));
    master.getCell(`G${row}`).numFmt = '"Rp" #,##0';
  }
  styleTable(master, [18, 35, 25, 14, 32, 14, 20, 14, 14, 16], 4);

  const movement = workbook.addWorksheet("Mutasi Stok");
  addTitle(movement, "Log pergerakan stok", "Catat setiap penerimaan dan pemakaian/penjualan. Ringkasan menarik mutasi dari tabel ini.", 8);
  addHeader(movement, 4, ["Tanggal", "SKU internal", "Nama barang", "Jenis mutasi", "Jumlah", "Satuan", "Dokumen / referensi", "Catatan"]);
  const firstItem = plan.niche.inventoryItems[0];
  const secondItem = plan.niche.inventoryItems[1];
  movement.addRows([
    [new Date("2026-06-02T00:00:00Z"), `${plan.niche.code}-001`, firstItem.name, "Masuk", 6, firstItem.unit, `PO-${plan.niche.code}-001`, "Contoh penerimaan dari pemasok"],
    [new Date("2026-06-03T00:00:00Z"), `${plan.niche.code}-001`, firstItem.name, "Keluar", 2, firstItem.unit, `JOB-${plan.niche.code}-001`, "Contoh pemakaian/penjualan"],
    [new Date("2026-06-04T00:00:00Z"), `${plan.niche.code}-002`, secondItem.name, "Masuk", 4, secondItem.unit, `PO-${plan.niche.code}-002`, "Contoh penerimaan kedua"],
    [new Date("2026-06-06T00:00:00Z"), `${plan.niche.code}-002`, secondItem.name, "Keluar", 1, secondItem.unit, `JOB-${plan.niche.code}-002`, "Contoh pemakaian/penjualan"],
  ]);
  for (let row = 5; row <= 104; row += 1) {
    ["A", "B", "C", "D", "E", "F", "G", "H"].forEach((column) => inputCell(movement.getCell(`${column}${row}`)));
    movement.getCell(`A${row}`).numFmt = "dd mmm yyyy";
  }
  styleTable(movement, [16, 18, 35, 18, 14, 14, 25, 42], 4);

  const stock = workbook.addWorksheet("Ringkasan Stok");
  addTitle(stock, "Stok saat ini dan nilai", "Stok berjalan = stok awal + mutasi masuk - mutasi keluar. Baris di bawah minimum perlu diperiksa.", 9);
  addHeader(stock, 4, ["SKU internal", "Nama barang", "Kategori", "Satuan", "Stok saat ini", "Harga beli (Rp)", "Nilai stok (Rp)", "Stok minimum", "Status"]);
  plan.niche.inventoryItems.forEach((item, index) => {
    const row = 5 + index;
    const sourceRow = 5 + index;
    stock.addRow([
      { formula: `'Daftar Barang'!A${sourceRow}` }, { formula: `'Daftar Barang'!B${sourceRow}` }, { formula: `'Daftar Barang'!C${sourceRow}` }, { formula: `'Daftar Barang'!D${sourceRow}` },
      { formula: `'Daftar Barang'!F${sourceRow}+SUMIFS('Mutasi Stok'!E$5:E$104,'Mutasi Stok'!B$5:B$104,A${row},'Mutasi Stok'!D$5:D$104,"Masuk")-SUMIFS('Mutasi Stok'!E$5:E$104,'Mutasi Stok'!B$5:B$104,A${row},'Mutasi Stok'!D$5:D$104,"Keluar")` },
      { formula: `'Daftar Barang'!G${sourceRow}` }, { formula: `E${row}*F${row}` }, { formula: `'Daftar Barang'!J${sourceRow}` }, { formula: `IF(E${row}<=H${row},"PESAN ULANG","CUKUP")` },
    ]);
    ["F", "G"].forEach((column) => { stock.getCell(`${column}${row}`).numFmt = '"Rp" #,##0'; });
  });
  styleTable(stock, [18, 35, 25, 14, 18, 20, 20, 16, 20], 4);

  const dashboard = workbook.addWorksheet("Dasbor");
  addTitle(dashboard, `Dasbor persediaan ${plan.niche.profile.name}`, "Ringkasan mengacu pada Daftar Barang dan Mutasi Stok.", 3);
  addHeader(dashboard, 4, ["Indikator", "Nilai", "Tindak lanjut"]);
  dashboard.addRows([
    ["Jumlah jenis barang", { formula: `COUNTA('Ringkasan Stok'!A5:A${4 + plan.niche.inventoryItems.length})` }, "Periksa SKU baru sebelum membuat pembelian."],
    ["Total unit tercatat", { formula: `SUM('Ringkasan Stok'!E5:E${4 + plan.niche.inventoryItems.length})` }, "Satuan bisa berbeda; gunakan untuk tren, bukan penjumlahan fisik lintas unit."],
    ["Nilai persediaan (Rp)", { formula: `SUM('Ringkasan Stok'!G5:G${4 + plan.niche.inventoryItems.length})` }, "Nilai berdasarkan harga beli yang diisi."],
    ["Barang perlu dipesan", { formula: `COUNTIF('Ringkasan Stok'!I5:I${4 + plan.niche.inventoryItems.length},"PESAN ULANG")` }, `Perhatikan bahan khas: ${plan.niche.inventoryItems.slice(0, 2).map((item) => item.name).join(" dan ")}.`],
  ]);
  dashboard.getCell("B7").numFmt = '"Rp" #,##0';
  styleTable(dashboard, [28, 22, 75], 4);
  addInstructions(workbook, plan, ["Isi atau perbaiki nama, pemasok, unit, stok awal, harga beli, dan batas minimum.", "Catat setiap barang masuk/keluar sebagai baris pada Mutasi Stok; samakan SKU internal.", "Tinjau Ringkasan Stok untuk kuantitas saat ini dan status pesan ulang.", "Periksa fisik rak secara berkala; koreksi selisih dengan catatan mutasi yang jelas."]);

  return [
    { role: "primary-workbook", filename: `${plan.product.sku}-Inventory.xlsx`, mimeType: MIME.xlsx, bytes: await workbookBytes(workbook) },
    { role: "quick-start", filename: `${plan.product.sku}-Panduan-Cepat.pdf`, mimeType: MIME.pdf, bytes: await quickStartPdf(plan, MASTER_SPECS.INV.modules) },
  ];
}