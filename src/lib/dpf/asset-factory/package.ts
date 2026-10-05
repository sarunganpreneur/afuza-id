import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { GENERATOR_VERSION } from "./masters";
import { generateFiles } from "./generators";
import { MIME } from "./generators/shared";
import type { GeneratedFile, PlannedProduct, ProductBuild, ProductManifest, QaResult } from "./types";

const PLACEHOLDER_PATTERN = /\{\{[^}]+\}\}|\bLOREM\s+IPSUM\b|\bTODO\b|\bTBD\b|\[ISI DI SINI\]/i;

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function zipFiles(files: GeneratedFile[]): Promise<Buffer> {
  const archive = new JSZip();
  for (const file of [...files].sort((left, right) => left.filename.localeCompare(right.filename))) {
    archive.file(file.filename, file.bytes, { date: new Date("2026-01-01T00:00:00.000Z"), unixPermissions: 0o644, createFolders: false });
  }
  return Buffer.from(await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "UNIX" }));
}

async function inspectXlsx(file: GeneratedFile, failures: string[]): Promise<{ sheets: string[]; formulas: string[]; texts: string[] }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    failures.push(`${file.filename}:xlsx-open`);
    return { sheets: [], formulas: [], texts: [] };
  }
  const names = workbook.worksheets.map((sheet) => sheet.name);
  if (new Set(names).size !== names.length) failures.push(`${file.filename}:duplicate-sheets`);
  const formulas: string[] = [];
  const texts: string[] = [];
  for (const worksheet of workbook.worksheets) {
    if (worksheet.actualRowCount < 4 || worksheet.actualColumnCount < 2) failures.push(`${file.filename}:${worksheet.name}:empty-sheet`);
    worksheet.eachRow((row) => row.eachCell((cell) => {
      if (cell.type === ExcelJS.ValueType.Formula || (cell.value && typeof cell.value === "object" && "formula" in cell.value)) {
        const formula = String((cell.value as ExcelJS.CellFormulaValue).formula ?? "");
        formulas.push(formula);
        if (/#REF!|#NAME\?|#VALUE!|#DIV\/0!/.test(formula)) failures.push(`${file.filename}:${worksheet.name}:broken-formula`);
      }
      if (typeof cell.value === "string") texts.push(cell.value);
    }));
  }
  return { sheets: names, formulas, texts };
}

async function inspectDocx(file: GeneratedFile, failures: string[]): Promise<string[]> {
  try {
    const zip = await JSZip.loadAsync(file.bytes, { checkCRC32: true });
    const requiredParts = ["[Content_Types].xml", "word/document.xml", "word/styles.xml"];
    if (requiredParts.some((part) => !zip.file(part))) failures.push(`${file.filename}:docx-required-part`);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    if (!documentXml || !/<w:body[\s>]/.test(documentXml) || !/<w:p[\s>]/.test(documentXml)) failures.push(`${file.filename}:docx-body`);
    const text = [...(documentXml ?? "").matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    if (text.length < 6) failures.push(`${file.filename}:docx-content`);
    return text;
  } catch {
    failures.push(`${file.filename}:docx-open`);
    return [];
  }
}

async function inspectPdf(file: GeneratedFile, failures: string[]): Promise<string[]> {
  try {
    const document = await PDFDocument.load(Uint8Array.from(file.bytes), { updateMetadata: false });
    if (document.getPageCount() < 1 || document.getTitle() === undefined) failures.push(`${file.filename}:pdf-structure`);
    return [file.filename];
  } catch {
    failures.push(`${file.filename}:pdf-open`);
    return [];
  }
}

function expectedFiles(plan: PlannedProduct): string[] {
  return plan.master.formats.map((format) => {
    const extensions: Record<string, string> = { xlsx: "xlsx", docx: "docx", pdf: "pdf" };
    return extensions[format];
  });
}

export async function buildProduct(plan: PlannedProduct, generatedAt: string): Promise<ProductBuild> {
  const files = await generateFiles(plan);
  const packageBytes = await zipFiles(files);
  const packageFilename = `${plan.product.sku}-V1.zip`;
  const fileRecords = files.map((file) => ({ role: file.role, filename: file.filename, mimeType: file.mimeType, bytes: file.bytes.length, sha256: sha256(file.bytes) }));
  const requiredExtensions = expectedFiles(plan);
  const packageFailures: string[] = [];
  let zipEntries: string[] = [];
  try {
    const zip = await JSZip.loadAsync(packageBytes, { checkCRC32: true });
    zipEntries = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort();
    if (zipEntries.some((name) => name.startsWith("__MACOSX/") || name.includes(".DS_Store") || name.includes("node_modules"))) packageFailures.push("unexpected-system-file");
    if (zipEntries.length !== files.length || files.some((file) => !zip.files[file.filename])) packageFailures.push("required-files-missing");
    for (const name of zipEntries) if ((await zip.file(name)!.async("nodebuffer")).length === 0) packageFailures.push(`empty-entry:${name}`);
  } catch {
    packageFailures.push("zip-open-or-crc");
  }

  const structuralFailures: string[] = [];
  const formulaFailures: string[] = [];
  const allText: string[] = [];
  const formulaTexts: string[] = [];
  let foundXlsx = false;
  let foundDocx = false;
  let foundPdf = false;
  const sheets: string[] = [];
  for (const file of files) {
    if (file.bytes.length === 0) structuralFailures.push(`${file.filename}:empty-file`);
    if (file.mimeType === MIME.xlsx) {
      foundXlsx = true;
      const result = await inspectXlsx(file, structuralFailures);
      sheets.push(...result.sheets);
      formulaTexts.push(...result.formulas);
      allText.push(...result.texts);
    } else if (file.mimeType === MIME.docx) {
      foundDocx = true;
      allText.push(...await inspectDocx(file, structuralFailures));
    } else if (file.mimeType === MIME.pdf) {
      foundPdf = true;
      allText.push(...await inspectPdf(file, structuralFailures));
    }
  }
  const requiredSheets = plan.master.sheets;
  const missingSheets = requiredSheets.filter((name) => !sheets.includes(name));
  structuralFailures.push(...missingSheets.map((name) => `required-sheet:${name}`));
  if (requiredExtensions.includes("xlsx") && !foundXlsx) structuralFailures.push("required-xlsx-missing");
  if (requiredExtensions.includes("docx") && !foundDocx) structuralFailures.push("required-docx-missing");
  if (requiredExtensions.includes("pdf") && !foundPdf) structuralFailures.push("required-pdf-missing");
  const formulaCount = formulaTexts.length;
  const requiredFormulaPatterns: Record<string, string[]> = {
    HPP: ["SUM(", "IFERROR(", "ROUNDUP(", "1-J5", "C5+D5+E5+F5", "K5-I5"],
    BOOK: ["SUMIFS(", "B5-B6", "COUNTIFS(", "EDATE("],
    INV: ["SUMIFS(", "COUNTIF(", "'DAFTAR BARANG'!F5+SUMIFS(", "E5*F5"],
    ADMIN: ["D5*E5", "SUM(F5:F9)"],
    MKT: ["SUM(", "IFERROR(", "B7/B6", "B8/B5"],
  };
  for (const pattern of requiredFormulaPatterns[plan.master.code] ?? []) {
    if (!formulaTexts.some((formula) => formula.toUpperCase().includes(pattern.toUpperCase()))) formulaFailures.push(`required-formula-pattern-missing:${pattern}`);
  }
  const text = allText.join("\n");
  const contentFailures: string[] = [];
  if (PLACEHOLDER_PATTERN.test(text)) contentFailures.push("placeholder-token-detected");
  if (text.length < 700) contentFailures.push("insufficient-product-content");
  const nicheNeedles = [...plan.niche.products.map((item) => item.name), ...plan.niche.inventoryItems.map((item) => item.name), ...plan.niche.expenseCategories, ...plan.niche.marketingExamples.map((item) => item.offer)];
  const matchedTerms = [...new Set(nicheNeedles.filter((term) => text.toLowerCase().includes(term.toLowerCase())))];
  const nicheFailures = matchedTerms.length < 4 ? ["insufficient-distinct-niche-examples"] : [];
  const suspiciousCopyFailures: string[] = [];
  if (new Set(plan.niche.products.map((item) => item.name)).size !== plan.niche.products.length) suspiciousCopyFailures.push("duplicate-product-examples");
  const qa: QaResult = {
    passed: structuralFailures.length === 0 && formulaFailures.length === 0 && contentFailures.length === 0 && nicheFailures.length === 0 && packageFailures.length === 0 && suspiciousCopyFailures.length === 0,
    structure: { passed: structuralFailures.length === 0, checks: [`sheets:${sheets.length}`, `files:${files.length}`], failures: structuralFailures },
    formulas: { passed: formulaFailures.length === 0, count: formulaCount, failures: formulaFailures },
    content: { passed: contentFailures.length === 0, failures: contentFailures },
    nicheSpecificity: { passed: nicheFailures.length === 0 && suspiciousCopyFailures.length === 0, score: matchedTerms.length, uniqueTerms: matchedTerms, failures: [...nicheFailures, ...suspiciousCopyFailures] },
    packaging: { passed: packageFailures.length === 0, checks: [`zipEntries:${zipEntries.length}`, `packageBytes:${packageBytes.length}`], failures: packageFailures },
    status: structuralFailures.length === 0 && formulaFailures.length === 0 && contentFailures.length === 0 && nicheFailures.length === 0 && packageFailures.length === 0 && suspiciousCopyFailures.length === 0 ? "QA_PASSED" : "QA_FAILED",
  };
  const manifest: ProductManifest = {
    sku: plan.product.sku,
    slug: plan.product.slug,
    masterCode: plan.master.code,
    nicheCode: plan.niche.code,
    version: plan.product.version,
    generatorVersion: GENERATOR_VERSION,
    generatedAt,
    priceIdr: plan.master.priceIdr,
    files: fileRecords,
    package: { filename: packageFilename, bytes: packageBytes.length, sha256: sha256(packageBytes), mimeType: MIME.zip },
    qa,
    status: qa.passed ? "QA_PASSED" : "QA_FAILED",
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const metadataFile: GeneratedFile = { role: "usage-guide", filename: `${plan.product.sku}-manifest.json`, mimeType: MIME.json, bytes: manifestBytes };
  return { plan, files: [...files, metadataFile, { role: "primary-workbook", filename: packageFilename, mimeType: MIME.zip, bytes: packageBytes }], manifest };
}

export { sha256 };