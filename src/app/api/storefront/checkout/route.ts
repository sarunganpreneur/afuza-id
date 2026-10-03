import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckout, getOrder } from "@/lib/commerce/checkout";
import { getProductAddons, listPublishedProducts } from "@/lib/commerce/catalog";
import { createClient } from "@/lib/supabase/server";

const checkoutSchema = z.object({
  productId: z.string().min(1).max(160),
  addonIds: z.array(z.string().uuid()).max(10),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/),
}).strict();

function unavailable() {
  return NextResponse.json({ error: "Pilihan produk tidak tersedia." }, { status: 422 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success || new Set(parsed.data?.addonIds ?? []).size !== parsed.data?.addonIds.length) {
    return NextResponse.json({ error: "Pilihan checkout tidak valid." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk untuk melanjutkan checkout." }, { status: 401 });

  try {
    const products = await listPublishedProducts();
    const product = products.find((item) =>
      item.id === parsed.data.productId || item.slug === parsed.data.productId || item.sku === parsed.data.productId,
    );
    if (!product) return unavailable();

    const availableAddons = await getProductAddons(product.id);
    const selectedAddons = parsed.data.addonIds.map((id) => availableAddons.find((addon) => addon.id === id));
    if (selectedAddons.some((addon) => !addon?.active)) return unavailable();
    const publishedById = new Map(products.map((item) => [item.id, item]));
    if ((selectedAddons as NonNullable<(typeof selectedAddons)[number]>[]).some((addon) => {
      if (addon.productId !== product.id) return true;
      if (!addon.addonProductId) return false;
      const addonProduct = publishedById.get(addon.addonProductId);
      return !addonProduct || addonProduct.niche !== product.niche;
    })) return unavailable();

    const result = await createCheckout({
      productId: product.id,
      addonIds: parsed.data.addonIds,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const order = await getOrder(result.orderId, user.id);
    if (!order) return NextResponse.json({ error: "Pesanan tidak dapat dibaca." }, { status: 503 });

    return NextResponse.json({
      order: {
        id: result.orderId,
        reference: result.orderNumber,
        status: result.status,
        subtotal: result.subtotal,
        addonTotal: result.addonTotal,
        total: result.total,
        items: order.items.map((item) => ({
          title: item.titleSnapshot,
          price: item.priceSnapshot,
          quantity: item.quantity,
          type: item.itemType,
        })),
      },
    }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "AUTHENTICATION_REQUIRED") {
      return NextResponse.json({ error: "Silakan masuk untuk melanjutkan checkout." }, { status: 401 });
    }
    if (code === "ADDON_NICHE_MISMATCH" || code === "PRODUCT_UNAVAILABLE" || code === "ADDON_UNAVAILABLE") {
      return unavailable();
    }
    if (code === "CHECKOUT_IDEMPOTENCY_CONFLICT") {
      return NextResponse.json({ error: "Checkout ini sudah digunakan untuk pilihan berbeda." }, { status: 409 });
    }
    return NextResponse.json({ error: "Checkout tidak dapat diproses saat ini." }, { status: 503 });
  }
}