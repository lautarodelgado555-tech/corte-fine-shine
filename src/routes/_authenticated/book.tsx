import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { format, isSameDay, startOfDay, addDays } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { createDepositCheckout } from "@/lib/payments.functions";
import { availableSlots, isOpenDay, windowsFor } from "@/lib/slots";

export const Route = createFileRoute("/_authenticated/book")({
  head: () => ({
    meta: [
      { title: "Reservar — Corte Fino" },
      { name: "description", content: "Elegí servicio, fecha y horario en Corte Fino." },
      { property: "og:title", content: "Reservar — Corte Fino" },
      { property: "og:description", content: "Elegí servicio, fecha y horario en Corte Fino." },
    ],
  }),
  component: BookPage,
});

const money = (n: number) => "$" + n.toLocaleString("es-AR");

function BookPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const locale = lang === "es" ? esLocale : enUS;
  const [serviceId, setServiceId] = useState<string>();
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState<string>();
  const dateStr = date ? format(date, "yyyy-MM-dd") : undefined;

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").maybeSingle();
      return data;
    },
  });
  const services = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("sort");
      if (error) throw error;
      return data;
    },
  });
  const availability = useQuery({
    queryKey: ["availability"],
    queryFn: async () => {
      const { data, error } = await supabase.from("availability").select("weekday, start_time, end_time");
      if (error) throw error;
      return data;
    },
  });
  const windows = availability.data ?? [];
  const busy = useQuery({
    queryKey: ["busy", dateStr],
    enabled: !!dateStr,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_busy_slots", { p_date: dateStr! });
      if (error) throw error;
      return data;
    },
  });
  const bookings = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date, start_time, status, created_at, services(name_es, name_en, deposit)")
        .in("status", ["confirmed", "pending_payment"])
        .gte("booking_date", format(new Date(), "yyyy-MM-dd"))
        .order("booking_date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const service = services.data?.find((s) => s.id === serviceId);
  const slots = useMemo(() => {
    if (!service || !date || !busy.data) return [];
    const now = new Date();
    return availableSlots(
      service.duration_minutes ?? service.duration_min,
      busy.data,
      isSameDay(date, now),
      now.getHours() * 60 + now.getMinutes(),
      windowsFor(date, windows),
    );
  }, [service, date, busy.data, windows]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["busy"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("bookings")
        .insert({
          user_id: u.user!.id,
          service_id: serviceId!,
          booking_date: dateStr!,
          start_time: time!,
          end_time: time!,
        })
        .select("id, status")
        .single();
      if (error) throw error;
      if (data.status === "pending_payment") await payDeposit(data.id);
      return data;
    },
    onSuccess: (data) => {
      if (data.status === "pending_payment") return;
      toast.success(t("booked"));
      setTime(undefined);
      refresh();
    },
    onError: (e) => {
      toast.error(e.message);
      refresh();
    },
  });

  async function payDeposit(bookingId: string) {
    const { url } = await createDepositCheckout({ data: { bookingId } });
    window.location.href = url;
  }

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("cancelled"));
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const today = startOfDay(new Date());
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("paid") === "1") {
      toast.success(t("paidThanks"));
      window.history.replaceState(null, "", "/book");
    }
  }, [t]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-4xl font-semibold">
        {t("hello")}
        {profile.data?.full_name ? `, ${profile.data.full_name.split(" ")[0]}` : ""}
      </h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <section className="space-y-8 rounded-2xl border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">{t("step1")}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {services.data?.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    setTime(undefined);
                  }}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    s.id === serviceId ? "border-primary bg-accent" : "hover:border-primary/50"
                  }`}
                >
                  <div className="font-semibold">{lang === "es" ? s.name_es : s.name_en}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {s.duration_minutes ?? s.duration_min} {t("min")} · {money(s.price)}
                    {s.deposit > 0 && ` · ${t("deposit")} ${money(s.deposit)}`}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-xl font-semibold">{t("step2")}</h2>
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  setDate(d);
                  setTime(undefined);
                }}
                locale={locale}
                disabled={(d) => d < today || d > addDays(today, 60) || !isOpenDay(d, windows)}
                className="mt-3 rounded-xl border p-3 pointer-events-auto"
              />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{t("step3")}</h2>
              <div className="mt-3">
                {!date || !service ? (
                  <p className="text-sm text-muted-foreground">{t("pickDate")}</p>
                ) : busy.isLoading ? null : slots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noSlots")}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((s) => (
                      <Button
                        key={s}
                        variant={time === s ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTime(s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Button
            size="lg"
            className="h-12 w-full rounded-full text-base"
            disabled={!service || !date || !time || create.isPending}
            onClick={() => create.mutate()}
          >
            {t("confirm")}
            {service && date && time ? ` · ${format(date, "d MMM", { locale })} ${time}` : ""}
          </Button>
        </section>

        <aside id="mis-reservas" className="scroll-mt-24">
          <h2 className="text-xl font-semibold">{t("upcoming")}</h2>
          <div className="mt-3 space-y-3">
            {bookings.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("none")}</p>}
            {bookings.data?.map((b) => (
              <div key={b.id} className="rounded-xl border bg-card p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {format(new Date(b.booking_date + "T00:00"), "EEEE d MMMM", { locale })}
                </div>
                <div className="mt-1 font-semibold">
                  {b.start_time.slice(0, 5)} · {lang === "es" ? b.services?.name_es : b.services?.name_en}
                </div>
                {b.status === "pending_payment" && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {t("pendingDeposit")}
                    </span>
                    {Date.now() - new Date(b.created_at).getTime() < 30 * 60_000 && (
                      <Button
                        size="sm"
                        className="h-7"
                        onClick={() => payDeposit(b.id).catch((e: Error) => toast.error(e.message))}
                      >
                        {t("payDeposit")} {money(b.services?.deposit ?? 0)}
                      </Button>
                    )}
                  </div>
                )}
                <button
                  onClick={() => cancel.mutate(b.id)}
                  className="mt-2 text-sm text-muted-foreground hover:text-destructive"
                >
                  {t("cancel")}
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
