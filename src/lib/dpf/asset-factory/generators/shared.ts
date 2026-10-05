import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from "docx";
import type { NicheData, PlannedProduct } from "../types";

export const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  json: "application/json",
  zip: "application/zip",
} as const;

export function createWorkbook(title: string, sku: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Afuza Digital Product Factory";
  workbook.lastModifiedBy = "DPF Asset Factory V1";
  workbook.created = new Date("2026-01-01T00:00:00.000Z");
  workbook.modified = new Date("2026-01-01T00:00:00.000Z");
  workbook.subject = sku;
  workbook.title = title;
  workbook.company = "Afuza Digital Product Factory";
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook;
}

export function addTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, columns: number): void {
  sheet.mergeCells(1, 1, 1, columns);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173B36" } };
  sheet.getCell(1, 1).alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.mergeCells(2, 1, 2, columns);
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).font = { italic: true, color: { argb: "FF45605B" } };
  sheet.getRow(2).height = 24;
}

export function addHeader(sheet: ExcelJS.Worksheet, row: number, values: string[]): void {
  const target = sheet.getRow(row);
  target.values = values;
  target.height = 32;
  target.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF287A68" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.autoFilter = { from: { row, column: 1 }, to: { row, column: values.length } };
}

export function styleTable(sheet: ExcelJS.Worksheet, widths: number[], headerRow = 1): void {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > headerRow) {
      row.alignment = { vertical: "top", wrapText: true };
      if (rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7F5" } }; });
    }
  });
}

export function inputCell(cell: ExcelJS.Cell): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  cell.font = { color: { argb: "FF1C4E80" } };
}

export function formulaCell(cell: ExcelJS.Cell, formula: string, numFmt = '"Rp" #,##0;[Red]-"Rp" #,##0'): void {
  cell.value = { formula };
  cell.numFmt = numFmt;
  cell.font = { bold: true, color: { argb: "FF173B36" } };
}

export function rupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function addInstructions(workbook: ExcelJS.Workbook, plan: PlannedProduct, steps: string[]): void {
  const sheet = workbook.addWorksheet("Panduan");
  addTitle(sheet, `Panduan ${plan.master.name}`, `${plan.product.sku} | ${plan.niche.profile.name}`, 3);
  sheet.addRow(["Langkah", "Yang dilakukan", "Catatan"]);
  const guidance = [
    ["1. Simpan salinan", "Buat salinan file sebelum mengisi data usaha.", "File master ini dapat dipakai ulang; jangan menimpa contoh."],
    ["2. Ganti contoh", `Sesuaikan contoh ${plan.niche.products[0].name} dengan harga dan proses usaha Anda.`, "Angka contoh hanya ilustrasi, bukan patokan harga pasar."],
    ...steps.map((step, index) => [`${index + 3}. Langkah`, step, "Isi sel berwarna kuning; rumus ditandai otomatis."]),
    ["Batas penggunaan", "Periksa hasil dengan catatan transaksi dan kondisi usaha sendiri.", "Template membantu pencatatan; bukan nasihat pajak atau hukum."],
  ];
  for (const row of guidance) sheet.addRow(row);
  addHeader(sheet, 3, ["Langkah", "Yang dilakukan", "Catatan"]);
  styleTable(sheet, [22, 64, 58], 3);
  sheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn(3).alignment = { wrapText: true, vertical: "top" };
}

export async function workbookBytes(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function quickStartPdf(plan: PlannedProduct, keyPoints: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 52, info: { Title: `Panduan Cepat ${plan.product.sku}`, Author: "Afuza Digital Product Factory", Subject: plan.product.sku, CreationDate: new Date("2026-01-01T00:00:00.000Z") } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fillColor("#173b36").fontSize(22).text(plan.master.name, { width: 480 });
    doc.moveDown(0.4).fillColor("#287a68").fontSize(12).text(`${plan.niche.profile.name} | ${plan.product.sku}`);
    doc.moveDown().fillColor("#222222").fontSize(11).text(plan.product.description, { lineGap: 4 });
    doc.moveDown().fontSize(15).fillColor("#173b36").text("Mulai dalam 15 menit");
    keyPoints.forEach((point, index) => {
      doc.moveDown(0.45).fontSize(11).fillColor("#222222").text(`${index + 1}. ${point}`, { lineGap: 3 });
    });
    doc.moveDown().fontSize(12).fillColor("#173b36").text("Contoh niche");
    plan.niche.products.forEach((example) => {
      doc.moveDown(0.35).fontSize(10).fillColor("#222222").text(`${example.name}: harga contoh ${rupiah(example.price)} per ${example.unit}. Periksa kembali biaya dan harga di usaha Anda.`);
    });
    doc.moveDown().fontSize(9).fillColor("#45605b").text("Angka contoh bersifat ilustratif. Simpan salinan sebelum mengubah file dan cocokkan hasil dengan transaksi nyata.");
    doc.end();
  });
}

export async function editableDocx(title: string, subtitle: string, sections: Array<{ heading: string; paragraphs: string[]; table?: string[][] }>): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: subtitle, style: "Subtitle" }),
    new Paragraph({ text: "Petunjuk: salin dokumen ini untuk setiap transaksi dan simpan dengan nomor dokumen yang konsisten." }),
  ];
  for (const section of sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    for (const text of section.paragraphs) children.push(new Paragraph({ text }));
    if (section.table) {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: section.table.map((row) => new TableRow({ children: row.map((text) => new TableCell({ children: [new Paragraph(text)] })) })),
      }));
    }
  }
  return Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children }] })));
}

export function nicheTermSet(niche: NicheData): string[] {
  return [...new Set([
    niche.profile.name,
    ...niche.products.map((item) => item.name),
    ...niche.inventoryItems.map((item) => item.name),
    ...niche.expenseCategories,
    ...niche.adminExamples,
    ...niche.marketingExamples.map((item) => item.offer),
  ].map((term) => term.toLowerCase()))];
}

export function usableText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}