import type { PaymentEvent, PaymentIntent, PaymentProviderAdapter } from "./types";

const TEST_PROVIDER = "test";

export function createTestPaymentAdapter(): PaymentProviderAdapter {
  return {
    provider: TEST_PROVIDER,
    async createPayment({ orderId, amount }): Promise<PaymentIntent> {
      const providerReference = `test-${orderId}`;
      return {
        provider: TEST_PROVIDER,
        providerReference,
        status: "PENDING",
        amount,
        currency: "IDR",
        rawProviderData: { mode: "simulated", orderId },
      };
    },
    async verifyPaymentEvent(input): Promise<PaymentEvent | null> {
      if (!input || typeof input !== "object") return null;
      const event = input as Record<string, unknown>;
      const providerReference = event.providerReference;
      const amount = event.amount;
      const status = event.status;
      if (
        event.provider !== TEST_PROVIDER ||
        typeof providerReference !== "string" ||
        typeof amount !== "number" ||
        !Number.isInteger(amount) ||
        event.currency !== "IDR" ||
        !["INITIATED", "PENDING", "PAID", "FAILED", "CANCELLED"].includes(String(status)) ||
        event.signature !== `test-signature:${providerReference}:${amount}`
      ) return null;
      return {
        provider: TEST_PROVIDER,
        providerReference,
        amount,
        status: status as PaymentEvent["status"],
        currency: "IDR",
        rawPayload: { provider: TEST_PROVIDER, providerReference, amount, status },
      };
    },
  };
}

export function getEnabledTestPaymentAdapter(): PaymentProviderAdapter | null {
  if (process.env.NODE_ENV === "production" || process.env.DPF_ENABLE_TEST_PAYMENTS !== "true") return null;
  return createTestPaymentAdapter();
}