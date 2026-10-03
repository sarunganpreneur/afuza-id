import { NextResponse } from "next/server";
import { z } from "zod";
import { storefrontAdapters } from "@/lib/dpf/storefront";
import { shouldUseFixtureCatalogFallback } from "@/lib/dpf/storefront/commerce-adapter";

const previewRequestSchema = z.object({
  productId: z.string().min(1).max(120),
  selectedAddonIds: z.array(z.string().min(1).max(120)).max(12),
}).strict();

export async function POST(request: Request) {
  if (!shouldUseFixtureCatalogFallback()) {
    return NextResponse.json({ error: "Endpoint pratinjau hanya tersedia untuk pengujian lokal." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }

  const parsed = previewRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Pilihan produk tidak valid." }, { status: 400 });
  const result = await storefrontAdapters.checkoutPreview.resolveSelection(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}