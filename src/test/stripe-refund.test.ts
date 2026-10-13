import { describe, it, expect, vi } from "vitest";
import { isUnconfirmableBooking, refundCheckoutPayment } from "@/lib/stripe-refund";

describe("isUnconfirmableBooking", () => {
  it("detects a slot taken while the customer was paying", () => {
    expect(isUnconfirmableBooking("Slot not available")).toBe(true);
  });
  it("treats unknown or transient errors as retryable", () => {
    expect(isUnconfirmableBooking("connection reset")).toBe(false);
    expect(isUnconfirmableBooking(undefined)).toBe(false);
  });
});

describe("refundCheckoutPayment", () => {
  it("refunds the payment intent with an idempotency key tied to the session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const ok = await refundCheckoutPayment("pi_123", "cs_456", "sk_test_x", fetchMock);
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: unknown }];
    expect(url).toBe("https://api.stripe.com/v1/refunds");
    expect(init.headers["Idempotency-Key"]).toBe("refund-cs_456");
    expect(String(init.body)).toContain("payment_intent=pi_123");
  });
  it("reports failure so Stripe retries the webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 402 }));
    expect(await refundCheckoutPayment("pi_123", "cs_456", "sk_test_x", fetchMock)).toBe(false);
  });
});
