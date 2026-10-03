import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrder } from "@/lib/commerce/checkout";
import { confirmPayment, startTestPayment } from "@/lib/commerce/payments";
import { getEnabledTestPaymentAdapter } from "@/lib/commerce/payment-adapter";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ orderId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Pesanan tidak tersedia." }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk." }, { status: 401 });
  const adapter = getEnabledTestPaymentAdapter();
  if (!adapter) return NextResponse.json({ error: "Pembayaran simulasi tidak tersedia." }, { status: 404 });

  try {
    const order = await getOrder(parsed.data.orderId, user.id);
    if (!order) return NextResponse.json({ error: "Pesanan tidak tersedia." }, { status: 404 });
    if (order.status === "PAID") {
      return NextResponse.json({ orderId: order.id, status: "PAID", replayed: true });
    }

    const intent = await startTestPayment(order.id);
    const confirmation = await confirmPayment({
      provider: intent.provider,
      event: {
        provider: intent.provider,
        providerReference: intent.providerReference,
        amount: intent.amount,
        currency: intent.currency,
        status: "PAID",
        signature: `test-signature:${intent.providerReference}:${intent.amount}`,
      },
    });
    if (confirmation.status !== "PAID") {
      return NextResponse.json({ error: "Konfirmasi pembayaran tidak berhasil." }, { status: 409 });
    }
    return NextResponse.json({ orderId: order.id, status: "PAID", replayed: false });
  } catch {
    return NextResponse.json({ error: "Pembayaran simulasi tidak dapat diproses." }, { status: 409 });
  }
}