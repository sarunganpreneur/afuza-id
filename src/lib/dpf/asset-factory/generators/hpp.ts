import { MASTER_SPECS } from "../masters";
import type { GeneratedFile, PlannedProduct } from "../types";
import { addHeader, addInstructions, addTitle, createWorkbook, inputCell, MIME, quickStartPdf, styleTable, workbookBytes } from "./shared";

export async function generateHpp(plan: PlannedProduct): Promise<GeneratedFile[]> {
  const workbook = createWorkbook(plan.product.title, plan.product.sku);
  const profile = workbook.addWorksheet("Profil Usaha");
  addTitle(profile, "Profil usaha dan asumsi", `${plan.niche.profile.name} | Ganti semua sel kuning sebelum memakai hasil`, 3);
  addHeader(profile, 4, ["Informasi", "Isian", "Contoh / catatan"]);
  [
    ["Nama usaha", "Usaha Contoh", "Ganti dengan nama usaha Anda."],
    ["Periode harga", new Date("2026-01-01T00:00:00.000Z"), "Tanggal terakhir meninjau harga."],
    ["Kapasitas per bulan", 500, `Gunakan unit sesuai proses: ${plan.niche.units.slice(0, 3).join(", ")}.`],
    ["Biaya tetap bulanan", 1200000, "Sewa, langganan, atau biaya tetap lain yang ingin diperhitungkan."],
    ["Catatan asumsi", `Contoh ${plan.niche.products[0].name}`, "Harga contoh bukan patokan pasar."],
  ].forEach((row) => profile.addRow(row));
  ["B5", "B6", "B7", "B8", "B9"].forEach((cell) => inputCell(profile.getCell(cell)));
  profile.getCell("B6").numFmt = "dd mmm yyyy";
  profile.getCell("B8").numFmt = '"Rp" #,##0';
  styleTable(profile, [28, 28, 64], 4);

  const materials = workbook.addWorksheet("Bahan & Biaya");
  addTitle(materials, `Bahan dan biaya ${plan.niche.profile.name}`, "Ubah jumlah pemakaian dan harga satuan pada sel kuning. Biaya dihitung otomatis.", 6);
  addHeader(materials, 4, ["Produk contoh", "Bahan / komponen", "Jumlah", "Satuan", "Biaya per satuan (Rp)", "Biaya terpakai (Rp)"]);
  const materialRows: Array<[string, string, number, string, number, { formula: string }]> = [];
  for (const example of plan.niche.products) {
    for (const material of example.materials) {
      const row = 5 + materialRows.length;
      materialRows.push([example.name, material.name, material.qty, material.unit, material.unitCost, { formula: `C${row}*E${row}` }]);
    }
  }
  materialRows.forEach((row) => materials.addRow(row));
  for (let row = 5; row < 5 + materialRows.length; row += 1) {
    inputCell(materials.getCell(`C${row}`));
    inputCell(materials.getCell(`E${row}`));
    materials.getCell(`F${row}`).numFmt = '"Rp" #,##0';
  }
  styleTable(materials, [30, 32, 13, 14, 24, 24], 4);

  const calculator = workbook.addWorksheet("Kalkulator");
  addTitle(calculator, "Kalkulator HPP dan harga jual", "Sel kuning dapat diubah. Hasil harga memakai margin dari harga jual, bukan markup biaya.", 14);
  addHeader(calculator, 4, ["Produk / layanan", "Hasil per batch", "Bahan terpakai (Rp)", "Kemasan (Rp)", "Tenaga kerja (Rp)", "Overhead (Rp)", "Susut / waste", "Total biaya batch (Rp)", "HPP per unit (Rp)", "Margin target", "Harga jual saran (Rp)", "Markup", "Profit / unit (Rp)", "Titik impas (unit)"]);
  plan.niche.products.forEach((example, index) => {
    const row = 5 + index;
    const matchingMaterialRows = plan.niche.products.slice(0, index).reduce((count, item) => count + item.materials.length, 0);
    const firstMaterialRow = 5 + matchingMaterialRows;
    const lastMaterialRow = firstMaterialRow + example.materials.length - 1;
    calculator.addRow([
      example.name,
      example.yield,
      { formula: `SUM('Bahan & Biaya'!F${firstMaterialRow}:F${lastMaterialRow})` },
      900,
      1800,
      1200,
      0.05,
      { formula: `(C${row}+D${row}+E${row}+F${row})*(1+G${row})` },
      { formula: `IFERROR(H${row}/B${row},0)` },
      0.35,
      { formula: `IFERROR(I${row}/(1-J${row}),0)` },
      { formula: `IFERROR((K${row}-I${row})/I${row},0)` },
      { formula: `K${row}-I${row}` },
      { formula: `IFERROR(ROUNDUP('Profil Usaha'!B8/(K${row}-I${row}),0),0)` },
    ]);
    ["B", "D", "E", "F", "G", "J"].forEach((column) => inputCell(calculator.getCell(`${column}${row}`)));
    ["C", "D", "E", "F", "H", "I", "K", "M"].forEach((column) => { calculator.getCell(`${column}${row}`).numFmt = '"Rp" #,##0'; });
    ["G", "J", "L"].forEach((column) => { calculator.getCell(`${column}${row}`).numFmt = "0%"; });
  });
  calculator.addRow([]);
  calculator.addRow(["Catatan", "Margin = (harga jual - HPP) / harga jual. Titik impas sederhana memakai biaya tetap bulanan dari Profil Usaha dibagi profit per unit."]);
  styleTable(calculator, [30, 14, 23, 17, 19, 18, 15, 23, 20, 15, 23, 13, 20, 18], 4);

  const simulation = workbook.addWorksheet("Simulasi");
  addTitle(simulation, "Simulasi perubahan harga", "Uji tiga skenario margin sebelum menetapkan harga pada menu atau katalog.", 5);
  addHeader(simulation, 4, ["Produk", "HPP/unit (Rp)", "Margin uji", "Harga saran (Rp)", "Profit/unit (Rp)"]);
  plan.niche.products.forEach((example, index) => {
    const row = 5 + index;
    simulation.addRow([example.name, { formula: `Kalkulator!I${row}` }, [0.25, 0.35, 0.45][index], { formula: `IFERROR(B${row}/(1-C${row}),0)` }, { formula: `D${row}-B${row}` }]);
    inputCell(simulation.getCell(`C${row}`));
    ["B", "D", "E"].forEach((column) => { simulation.getCell(`${column}${row}`).numFmt = '"Rp" #,##0'; });
    simulation.getCell(`C${row}`).numFmt = "0%";
  });
  styleTable(simulation, [32, 22, 16, 22, 22], 4);

  const examples = workbook.addWorksheet("Contoh Niche");
  addTitle(examples, `Contoh usaha ${plan.niche.profile.name}`, "Tiga contoh untuk menunjukkan hubungan resep, stok, dan biaya usaha; sesuaikan yield serta harga pemasok.", 8);
  addHeader(examples, 4, ["Produk", "Harga jual contoh (Rp)", "Hasil", "Satuan", "Bahan dan biaya langsung", "Item stok terkait", "Kategori beban terkait", "Pemasok contoh"]);
  plan.niche.products.forEach((item, index) => examples.addRow([
    item.name,
    item.price,
    item.yield,
    item.unit,
    item.materials.map((material) => `${material.name} ${material.qty} ${material.unit}`).join("; "),
    plan.niche.inventoryItems[index].name,
    plan.niche.expenseCategories[index],
    plan.niche.inventoryItems[index].supplier,
  ]));
  examples.getColumn(2).numFmt = '"Rp" #,##0';
  styleTable(examples, [34, 25, 13, 16, 58, 36, 34, 34], 4);
  addInstructions(workbook, plan, ["Isi Profil Usaha dan biaya tetap bulanan.", "Periksa bahan pada Bahan & Biaya; harga satuan dikalikan pemakaian.", "Buka Kalkulator, isi kemasan, tenaga, overhead, susut, dan margin.", "Bandingkan skenario pada Simulasi; validasi hasil dengan catatan belanja nyata."]);

  return [
    { role: "primary-workbook", filename: `${plan.product.sku}-Kalkulator.xlsx`, mimeType: MIME.xlsx, bytes: await workbookBytes(workbook) },
    { role: "quick-start", filename: `${plan.product.sku}-Panduan-Cepat.pdf`, mimeType: MIME.pdf, bytes: await quickStartPdf(plan, MASTER_SPECS.HPP.modules) },
  ];
}