import { NextResponse } from "next/server";
import { z } from "zod";
import { getProductDownloadAccess } from "@/lib/commerce/delivery";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ productId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Akses produk tidak tersedia." }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk." }, { status: 401 });

  try {
    const access = await getProductDownloadAccess(user.id, parsed.data.productId);
    if (!access.allowed) {
      if (access.reason === "DELIVERY_UNAVAILABLE") {
        return NextResponse.json({ error: "Akses unduhan sedang tidak tersedia." }, { status: 503 });
      }
      return NextResponse.json({ error: "Akses produk tidak tersedia." }, { status: 404 });
    }
    return NextResponse.json({ assetUrls: access.assetUrls });
  } catch {
    return NextResponse.json({ error: "Akses unduhan sedang tidak tersedia." }, { status: 503 });
  }
}