import type { GeneratedFile, PlannedProduct } from "../types";
import { generateAdmin } from "./admin";
import { generateBook } from "./book";
import { generateHpp } from "./hpp";
import { generateInv } from "./inv";
import { generateMkt } from "./mkt";

export async function generateFiles(plan: PlannedProduct): Promise<GeneratedFile[]> {
  switch (plan.master.code) {
    case "HPP": return generateHpp(plan);
    case "BOOK": return generateBook(plan);
    case "INV": return generateInv(plan);
    case "ADMIN": return generateAdmin(plan);
    case "MKT": return generateMkt(plan);
  }
}