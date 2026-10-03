import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import { getOrder } from "./checkout";
import { getEnabledTestPaymentAdapter } from "./payment-adapter";
import type { PaymentProviderAdapter } from "./types";

async function recordPayment(input: {
  orderId: string;
  provider: string;
  providerReference: string;
  amount: number;
  status: string;
  rawProviderData: Record<string, unknown>;
}) {
  const serviceRole = await getServiceRoleClient();
  if (!serviceRole) throw new Error("PAYMENT_SERVICE_UNAVAILABLE");
  const { data, error } = await serviceRole.rpc("dpf_record_payment", {
    p_order_id: input.orderId,
    p_provider: input.provider,
    p_provider_reference: input.providerReference,
    p_amount: input.amount,
    p_status: input.status,
    p_raw_provider_data: input.rawProviderData,
  });
  if (error || !data) throw new Error("PAYMENT_RECORD_FAILED");
  return data as Record<string, unknown>;
}

function requireTestAdapter(): PaymentProviderAdapter {
  const adapter = getEnabledTestPaymentAdapter();
  if (!adapter) throw new Error("TEST_PAYMENT_DISABLED");
  return adapter;
}

export async function startTestPayment(orderId: string) {
  const adapter = requireTestAdapter();
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("AUTHENTICATION_REQUIRED");
  const order = await getOrder(orderId, user.id);
  if (!order || order.status === "PAID" || order.status === "CANCELLED") throw new Error("ORDER_NOT_PAYABLE");
  const intent = await adapter.createPayment({ orderId: order.id, amount: order.total });
  await recordPayment({
    orderId: order.id, provider: intent.provider, providerReference: intent.providerReference,
    amount: intent.amount, status: intent.status, rawProviderData: intent.rawProviderData,
  });
  return { provider: intent.provider, providerReference: intent.providerReference, amount: intent.amount, currency: intent.currency, status: intent.status };
}

export async function confirmPayment(input: { provider: string; event: unknown }) {
  const adapter = requireTestAdapter();
  if (input.provider !== adapter.provider) throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");
  const event = await adapter.verifyPaymentEvent(input.event);
  if (!event || event.provider !== input.provider) throw new Error("PAYMENT_EVENT_INVALID");
  const orderId = event.providerReference.startsWith("test-") ? event.providerReference.slice(5) : "";
  if (!orderId) throw new Error("PAYMENT_EVENT_INVALID");
  return recordPayment({
    orderId, provider: event.provider, providerReference: event.providerReference,
    amount: event.amount, status: event.status, rawProviderData: event.rawPayload,
  });
}