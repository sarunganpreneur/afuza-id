import { NextResponse } from "next/server";
import { z } from "zod";
import { storefrontAdapters } from "@/lib/dpf/storefront";

const selectionSchema = z.object({
  productId: z.string().min(1).max(160),
  selectedAddonIds: z.array(z.string().uuid()).max(10),
}).strict();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }
  const parsed = selectionSchema.safeParse(body);
  if (!parsed.success || new Set(parsed.data?.selectedAddonIds ?? []).size !== parsed.data?.selectedAddonIds.length) {
    return NextResponse.json({ error: "Pilihan produk tidak valid." }, { status: 400 });
  }
  const result = await storefrontAdapters.checkoutPreview.resolveSelection(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}