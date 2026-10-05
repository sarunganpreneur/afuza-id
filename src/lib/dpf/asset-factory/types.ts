import type { DpfProduct, MasterDefinition, NicheProfile } from "@/lib/dpf/product-factory/launch-batch-01";

export type MasterCode = "HPP" | "BOOK" | "INV" | "ADMIN" | "MKT";
export type NicheCode = "KUL" | "CAF" | "RTL" | "FAS" | "LND" | "SAL" | "BNG" | "ONL" | "BAK" | "PRO";
export type AssetRole = "primary-workbook" | "editable-forms" | "quick-start" | "usage-guide" | "license";
export type FactoryStatus = "GENERATED" | "QA_FAILED" | "QA_PASSED" | "STAGING_PUBLISHED";

export type MasterSpec = {
  code: MasterCode;
  name: string;
  priceIdr: number;
  formats: string[];
  sheets: string[];
  formulas: string[];
  modules: string[];
  qaTerms: string[];
};

export type NicheData = {
  code: NicheCode;
  profile: NicheProfile;
  products: Array<{ name: string; price: number; yield: number; unit: string; materials: Array<{ name: string; qty: number; unit: string; unitCost: number }> }>;
  inventoryItems: Array<{ name: string; unit: string; supplier: string; opening: number; cost: number; minimum: number; category: string }>;
  expenseCategories: string[];
  customerTypes: string[];
  adminExamples: string[];
  marketingExamples: Array<{ offer: string; hook: string; channel: string; cta: string }>;
  units: string[];
};

export type PlannedProduct = {
  product: DpfProduct;
  master: MasterSpec;
  sourceMaster: MasterDefinition;
  niche: NicheData;
};

export type GeneratedFile = {
  role: AssetRole;
  filename: string;
  mimeType: string;
  bytes: Buffer;
};

export type QaResult = {
  passed: boolean;
  structure: { passed: boolean; checks: string[]; failures: string[] };
  formulas: { passed: boolean; count: number; failures: string[] };
  content: { passed: boolean; failures: string[] };
  nicheSpecificity: { passed: boolean; score: number; uniqueTerms: string[]; failures: string[] };
  packaging: { passed: boolean; checks: string[]; failures: string[] };
  status: "QA_PASSED" | "QA_FAILED";
};

export type ProductManifest = {
  sku: string;
  slug: string;
  masterCode: MasterCode;
  nicheCode: NicheCode;
  version: string;
  generatorVersion: string;
  generatedAt: string;
  priceIdr: number;
  files: Array<{ role: AssetRole; filename: string; mimeType: string; bytes: number; sha256: string }>;
  package: { filename: string; bytes: number; sha256: string; mimeType: string };
  qa: QaResult;
  status: FactoryStatus;
};

export type ProductBuild = { plan: PlannedProduct; files: GeneratedFile[]; manifest: ProductManifest };