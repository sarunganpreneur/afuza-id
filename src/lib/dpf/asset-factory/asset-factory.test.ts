import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { MASTER_SPECS } from "./masters";
import { NICHE_CODES, NICHE_DATA } from "./niches";
import { buildProductPlans } from "./planner";
import { buildProduct } from "./package";

const fixedTime = "2026-10-05T00:00:00.000Z";

describe("DPF Actual Product Asset Factory V1", () => {
  it("defines five masters, ten canonical niches, and 50 deterministic combinations", () => {
    const first = buildProductPlans("ALL");
    const second = buildProductPlans("ALL");
    expect(Object.keys(MASTER_SPECS)).toHaveLength(5);
    expect(NICHE_CODES).toHaveLength(10);
    expect(first).toHaveLength(50);
    expect(new Set(first.map((plan) => plan.product.sku)).size).toBe(50);
    expect(new Set(first.map((plan) => plan.product.slug)).size).toBe(50);
    expect(first.map((plan) => plan.product.sku)).toEqual(second.map((plan) => plan.product.sku));
    expect(first.map((plan) => plan.product.nicheId)).toEqual(expect.arrayContaining(["KUL", "CAF", "RTL", "FAS", "LND", "SAL", "BNG", "ONL", "BAK", "PRO"]));
    expect(new Set(first.map((plan) => plan.master.priceIdr))).toEqual(new Set([19000, 29000, 25000, 39000]));
  });

  it("uses substantively distinct operational examples for every niche", () => {
    for (const niche of Object.values(NICHE_DATA)) {
      expect(niche.products).toHaveLength(3);
      expect(new Set(niche.products.map((product) => product.name)).size).toBe(3);
      expect(niche.inventoryItems).toHaveLength(3);
      expect(new Set(niche.inventoryItems.map((item) => item.name)).size).toBe(3);
      expect(niche.expenseCategories.length).toBeGreaterThanOrEqual(5);
      expect(niche.adminExamples.length).toBeGreaterThanOrEqual(3);
      expect(niche.marketingExamples.length).toBeGreaterThanOrEqual(3);
      expect(niche.units.length).toBeGreaterThanOrEqual(4);
    }
    expect(NICHE_DATA.KUL.products[0].name).not.toBe(NICHE_DATA.CAF.products[0].name);
    expect(NICHE_DATA.BNG.inventoryItems[0].name).not.toBe(NICHE_DATA.FAS.inventoryItems[0].name);
    expect(NICHE_DATA.PRO.marketingExamples[0].offer).not.toBe(NICHE_DATA.RTL.marketingExamples[0].offer);
  });

  it("generates and passes complete KUL pilot packages for all five master families", async () => {
    const pilot = buildProductPlans("KUL");
    expect(pilot).toHaveLength(5);
    const builds = await Promise.all(pilot.map((plan) => buildProduct(plan, fixedTime)));
    expect(builds.map((build) => build.manifest.sku).sort()).toEqual([
      "DPF-KUL-ADMIN-V1", "DPF-KUL-BOOK-V1", "DPF-KUL-HPP-V1", "DPF-KUL-INV-V1", "DPF-KUL-MKT-V1",
    ]);
    expect(builds.every((build) => build.manifest.status === "QA_PASSED")).toBe(true);
    expect(builds.every((build) => build.manifest.qa.structure.failures.length === 0)).toBe(true);
    expect(builds.every((build) => build.manifest.qa.content.failures.length === 0)).toBe(true);
    expect(builds.every((build) => build.manifest.qa.packaging.failures.length === 0)).toBe(true);
    expect(builds.map((build) => build.manifest.package.filename)).toEqual(pilot.map((plan) => `${plan.product.sku}-V1.zip`));
    for (const build of builds) {
      expect(new Set(build.manifest.files.map((file) => file.filename)).size).toBe(build.manifest.files.length);
      const packageFile = build.files.find((file) => file.filename === build.manifest.package.filename);
      expect(packageFile).toBeDefined();
      expect(createHash("sha256").update(packageFile!.bytes).digest("hex")).toBe(build.manifest.package.sha256);
      const zip = await JSZip.loadAsync(packageFile!.bytes, { checkCRC32: true });
      expect(Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort()).toEqual(build.manifest.files.map((file) => file.filename).sort());
      expect(build.manifest.files.every((file) => file.bytes > 0 && file.sha256.length === 64)).toBe(true);
      if (build.plan.master.code === "HPP") expect(build.manifest.qa.formulas.count).toBeGreaterThanOrEqual(6);
      if (build.plan.master.code === "BOOK") expect(build.manifest.qa.formulas.count).toBeGreaterThanOrEqual(6);
      if (build.plan.master.code === "INV") expect(build.manifest.qa.formulas.count).toBeGreaterThanOrEqual(5);
      if (build.plan.master.code === "ADMIN") expect(build.manifest.files.some((file) => file.filename.endsWith(".docx"))).toBe(true);
      if (build.plan.master.code === "ADMIN") {
        const packageBytes = packageFile!.bytes;
        const packageZip = await JSZip.loadAsync(packageBytes);
        const docxFile = build.manifest.files.find((file) => file.filename.endsWith(".docx"))!;
        const productZip = await JSZip.loadAsync(await packageZip.file(docxFile.filename)!.async("nodebuffer"));
        const documentXml = await productZip.file("word/document.xml")!.async("string");
        expect(documentXml).toContain("Template invoice");
      }
      if (build.plan.master.code === "MKT") {
        expect(build.manifest.files.some((file) => file.filename.endsWith(".docx"))).toBe(true);
        const workbookFile = build.files.find((file) => file.filename.endsWith(".xlsx"))!;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(workbookFile.bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
        const calendar = workbook.getWorksheet("Kalender 30 Hari")!;
        const topics = Array.from({ length: 30 }, (_, index) => String(calendar.getCell(index + 5, 3).value));
        expect(new Set(topics).size).toBe(30);
        expect(topics.some((topic) => topic.includes("Nasi Goreng Ayam"))).toBe(true);
        expect(topics.some((topic) => topic.includes("Soto Ayam"))).toBe(true);
        expect(topics.some((topic) => topic.includes("Es Teh Lemon"))).toBe(true);
      }
    }
  }, 120000);

  it("keeps filenames and package bytes deterministic for a fixed product and timestamp", async () => {
    const plan = buildProductPlans("KUL").find((item) => item.product.sku === "DPF-KUL-HPP-V1")!;
    const [first, second] = await Promise.all([buildProduct(plan, fixedTime), buildProduct(plan, fixedTime)]);
    expect(first.manifest.package.filename).toBe(second.manifest.package.filename);
    expect(first.manifest.package.sha256).toBe(second.manifest.package.sha256);
    expect(first.manifest.files.map((file) => file.filename)).toEqual(second.manifest.files.map((file) => file.filename));
  }, 60000);

  it("fails QA if a required workbook section is missing", async () => {
    const source = buildProductPlans("KUL").find((item) => item.product.sku === "DPF-KUL-HPP-V1")!;
    const broken = { ...source, master: { ...source.master, sheets: [...source.master.sheets, "Bagian Wajib Hilang"] } };
    const result = await buildProduct(broken, fixedTime);
    expect(result.manifest.status).toBe("QA_FAILED");
    expect(result.manifest.qa.structure.failures).toContain("required-sheet:Bagian Wajib Hilang");
  }, 30000);
});