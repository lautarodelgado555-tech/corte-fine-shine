import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "@/lib/stripe-signature";

const secret = "whsec_test";
const body = '{"type":"checkout.session.completed"}';
const sign = (t: number, b = body) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${b}`).digest("hex")}`;

describe("stripe webhook signature", () => {
  it("accepts a valid signature", async () => {
    expect(await verifyStripeSignature(body, sign(1000), secret, 1000)).toBe(true);
  });
  it("rejects a tampered body", async () => {
    expect(await verifyStripeSignature(body + " ", sign(1000), secret, 1000)).toBe(false);
  });
  it("rejects signatures older than 5 minutes", async () => {
    expect(await verifyStripeSignature(body, sign(1000), secret, 1301)).toBe(false);
  });
  it("rejects a missing header", async () => {
    expect(await verifyStripeSignature(body, null, secret, 1000)).toBe(false);
  });
});
