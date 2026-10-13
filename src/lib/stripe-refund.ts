/** Errors raised by validate_booking when the slot can no longer be confirmed. */
const SLOT_ERRORS = ["Slot not available", "Outside opening hours", "Invalid service"];

/** True when a confirm failed because the booking can't be honored (not a transient DB error). */
export function isUnconfirmableBooking(message: string | undefined) {
  return !!message && SLOT_ERRORS.some((e) => message.includes(e));
}

/**
 * Refunds a Checkout payment in full. Uses an idempotency key so Stripe's webhook
 * retries never refund twice.
 */
export async function refundCheckoutPayment(
  paymentIntent: string,
  sessionId: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
) {
  const res = await fetchImpl("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `refund-${sessionId}`,
    },
    body: new URLSearchParams({ payment_intent: paymentIntent, reason: "requested_by_customer" }),
  });
  return res.ok;
}
