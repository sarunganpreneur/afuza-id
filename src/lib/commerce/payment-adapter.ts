import type { PaymentEvent, PaymentIntent, PaymentProviderAdapter } from "./types";

const TEST_PROVIDER = "test";
type PaymentEnvironment = Record<string, string | undefined>;

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

export function isTestPaymentEnabled(environment: PaymentEnvironment = process.env): boolean {
  if (environment.DPF_TEST_PAYMENT_ENABLED !== "true") return false;

  const deploymentEnvironment = environment.AFUZA_RUNTIME_ENV?.trim().toLowerCase();
  if (deploymentEnvironment === "production") return false;
  if (deploymentEnvironment === "staging") return true;

  if (!["local", "development", "test"].includes(deploymentEnvironment ?? "")) return false;
  return environment.NODE_ENV?.trim().toLowerCase() !== "production";
}

export function getEnabledTestPaymentAdapter(): PaymentProviderAdapter | null {
  if (!isTestPaymentEnabled()) return null;
  return createTestPaymentAdapter();
}