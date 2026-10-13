import { createFileRoute } from "@tanstack/react-router";
import { verifyStripeSignature } from "@/lib/stripe-signature";

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
