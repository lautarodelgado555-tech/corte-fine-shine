import { createFileRoute } from "@tanstack/react-router";

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Verifies a Stripe-Signature header (t=...,v1=...) with a 5-minute tolerance. */
export async function verifyStripeSignature(body: string, header: string | null, secret: string, nowSec = Date.now() / 1000) {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(nowSec - Number(t)) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  return sigs.some((s) => safeEqual(s, expected));
}

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 500 });
        const body = await request.text();
        if (!(await verifyStripeSignature(body, request.headers.get("stripe-signature"), secret))) {
          return new Response("Invalid signature", { status: 400 });
        }

        const event = JSON.parse(body) as {
          type: string;
          data: { object: { id: string; payment_status?: string; metadata?: { booking_id?: string } } };
        };
        if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
          const s = event.data.object;
          const bookingId = s.metadata?.booking_id;
          if (bookingId) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { error } = await supabaseAdmin
              .from("bookings")
              .update({ status: "confirmed" })
              .eq("id", bookingId)
              .eq("stripe_session_id", s.id)
              .eq("status", "pending_payment");
            if (error) {
              console.error("Webhook confirm failed", error.message);
              return new Response("Update failed", { status: 500 });
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
