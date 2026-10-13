import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Creates a Stripe Checkout session for a booking's deposit. Stripe key stays server-side. */
export const createDepositCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env['STRIPE_SECRET_KEY'];
    if (!key) throw new Error("Payments are not configured yet");
    if (!key.startsWith("sk_test_")) throw new Error("Only Stripe test mode is allowed");

    // Read through RLS: only the booking's own client can see it.
    const { data: booking, error } = await context.supabase
      .from("bookings")
      .select("id, status, user_id, services(name_es, deposit)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error || !booking || booking.user_id !== context.userId) throw new Error("Booking not found");
    if (booking.status !== "pending_payment") throw new Error("This booking doesn't need a deposit");
    const deposit = booking.services?.deposit ?? 0;
    if (deposit <= 0) throw new Error("This service has no deposit");

    const origin = new URL(getRequest().url).origin;
    const body = new URLSearchParams({
      mode: "payment",
      success_url: `${origin}/book?paid=1`,
      cancel_url: `${origin}/book`,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "ars",
      "line_items[0][price_data][unit_amount]": String(deposit * 100),
      "line_items[0][price_data][product_data][name]": `Seña · ${booking.services?.name_es ?? "Corte Fino"}`,
      "metadata[booking_id]": booking.id,
      client_reference_id: booking.id,
      expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const session = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
    if (!res.ok || !session.id || !session.url) {
      console.error("Stripe checkout error", session.error?.message);
      throw new Error("Could not start payment");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("bookings").update({ stripe_session_id: session.id }).eq("id", booking.id);
    return { url: session.url };
  });
