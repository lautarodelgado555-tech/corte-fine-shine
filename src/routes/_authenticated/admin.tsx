import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: isOwner } = await supabase.rpc("has_role", { _user_id: u.user!.id, _role: "owner" });
    if (!isOwner) throw redirect({ to: "/book" });
  },
  head: () => ({
    meta: [
      { title: "Panel — Corte Fino" },
      { name: "description", content: "Panel de administración de Corte Fino." },
      { property: "og:title", content: "Panel — Corte Fino" },
      { property: "og:description", content: "Panel de administración de Corte Fino." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function useL() {
  const { lang } = useI18n();
  return (es: string, en: string) => (lang === "es" ? es : en);
}

function AdminPage() {
  const L = useL();
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-4xl font-semibold">{L("Panel del salón", "Salon dashboard")}</h1>
      <Tabs defaultValue="calendar" className="mt-6">
        <TabsList>
          <TabsTrigger value="calendar">{L("Agenda", "Calendar")}</TabsTrigger>
          <TabsTrigger value="services">{L("Servicios", "Services")}</TabsTrigger>
          <TabsTrigger value="hours">{L("Horarios", "Availability")}</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar"><WeekCalendar /></TabsContent>
        <TabsContent value="services"><ServicesManager /></TabsContent>
        <TabsContent value="hours"><AvailabilityManager /></TabsContent>
      </Tabs>
    </main>
  );
}

const statusStyle: Record<string, string> = {
  confirmed: "bg-primary/15 text-primary",
  pending_payment: "bg-accent text-accent-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function WeekCalendar() {
  const L = useL();
  const { lang } = useI18n();
  const locale = lang === "es" ? esLocale : enUS;
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const from = format(weekStart, "yyyy-MM-dd");
  const to = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const bookings = useQuery({
    queryKey: ["admin-bookings", from],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, user_id, booking_date, start_time, end_time, status, services(name_es, name_en)")
        .gte("booking_date", from)
        .lte("booking_date", to)
        .order("start_time");
      if (error) throw error;
      const ids = [...new Set(data.map((b) => b.user_id))];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name, phone").in("id", ids)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return data.map((b) => ({ ...b, client: byId.get(b.user_id) }));
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-bookings"] }),
    onError: (e) => toast.error(e.message),
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <section className="mt-4">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
          <ChevronLeft />
        </Button>
        <span className="font-semibold">
          {format(weekStart, "d MMM", { locale })} – {format(addDays(weekStart, 6), "d MMM yyyy", { locale })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          {L("Hoy", "Today")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const list = bookings.data?.filter((b) => b.booking_date === key) ?? [];
          return (
            <div key={key} className="min-h-40 rounded-xl border bg-card p-2">
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {format(d, "EEE d", { locale })}
              </div>
              <div className="space-y-2">
                {list.map((b) => (
                  <div key={b.id} className={`rounded-lg p-2 text-xs ${statusStyle[b.status] ?? ""}`}>
                    <div className="font-semibold">
                      {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                    </div>
                    <div>{lang === "es" ? b.services?.name_es : b.services?.name_en}</div>
                    <div className="text-muted-foreground">{b.client?.full_name || "—"}</div>
                    {b.client?.phone && <div className="text-muted-foreground">{b.client.phone}</div>}
                    {b.status !== "cancelled" && (
                      <div className="mt-1.5 flex gap-1">
                        {b.status !== "confirmed" && (
                          <Button size="sm" className="h-6 px-2 text-[11px]"
                            onClick={() => setStatus.mutate({ id: b.id, status: "confirmed" })}>
                            {L("Confirmar", "Confirm")}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                          onClick={() => setStatus.mutate({ id: b.id, status: "cancelled" })}>
                          {L("Cancelar", "Cancel")}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type ServiceForm = { name_es: string; name_en: string; duration: string; price: string; deposit: string };
const emptyService: ServiceForm = { name_es: "", name_en: "", duration: "30", price: "0", deposit: "0" };

function toServiceRow(f: ServiceForm) {
  const duration = Math.max(15, Math.min(480, Number(f.duration) || 30));
  return {
    name_es: f.name_es.trim().slice(0, 80),
    name_en: f.name_en.trim().slice(0, 80),
    duration_min: duration,
    duration_minutes: duration,
    price: Math.max(0, Number(f.price) || 0),
    deposit: Math.max(0, Number(f.deposit) || 0),
  };
}

function ServicesManager() {
  const L = useL();
  const qc = useQueryClient();
  const services = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("sort");
      if (error) throw error;
      return data;
    },
  });
  const done = () => qc.invalidateQueries({ queryKey: ["services"] });
  const save = useMutation({
    mutationFn: async ({ id, f }: { id?: string; f: ServiceForm }) => {
      const row = toServiceRow(f);
      if (!row.name_es || !row.name_en) throw new Error(L("Completá ambos nombres", "Fill in both names"));
      const { error } = id
        ? await supabase.from("services").update(row).eq("id", id)
        : await supabase.from("services").insert({ ...row, sort: (services.data?.length ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(L("Guardado", "Saved")); done(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw new Error(L("No se puede borrar: tiene reservas", "Can't delete: it has bookings"));
    },
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="mt-4 space-y-3">
      <div className="hidden grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-2 px-3 text-xs font-semibold uppercase text-muted-foreground md:grid">
        <span>Nombre (ES)</span><span>Name (EN)</span><span>{L("Minutos", "Minutes")}</span>
        <span>{L("Precio", "Price")}</span><span>{L("Seña", "Deposit")}</span><span />
      </div>
      {services.data?.map((s) => (
        <ServiceRow
          key={s.id}
          initial={{
            name_es: s.name_es, name_en: s.name_en,
            duration: String(s.duration_minutes ?? s.duration_min),
            price: String(s.price), deposit: String(s.deposit),
          }}
          onSave={(f) => save.mutate({ id: s.id, f })}
          onDelete={() => remove.mutate(s.id)}
        />
      ))}
      <ServiceRow key={services.data?.length} initial={emptyService} isNew onSave={(f) => save.mutate({ f })} />
    </section>
  );
}

function ServiceRow({ initial, onSave, onDelete, isNew }: {
  initial: ServiceForm; onSave: (f: ServiceForm) => void; onDelete?: () => void; isNew?: boolean;
}) {
  const L = useL();
  const [f, setF] = useState(initial);
  const set = (k: keyof ServiceForm) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(f); }}
      className={`grid gap-2 rounded-xl border p-3 md:grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] ${isNew ? "border-dashed" : "bg-card"}`}
    >
      <Input placeholder="Nombre" value={f.name_es} onChange={set("name_es")} maxLength={80} />
      <Input placeholder="Name" value={f.name_en} onChange={set("name_en")} maxLength={80} />
      <Input type="number" min={15} max={480} step={15} value={f.duration} onChange={set("duration")} />
      <Input type="number" min={0} value={f.price} onChange={set("price")} />
      <Input type="number" min={0} value={f.deposit} onChange={set("deposit")} />
      <div className="flex gap-1">
        <Button type="submit" size="sm">{isNew ? L("Agregar", "Add") : L("Guardar", "Save")}</Button>
        {onDelete && (
          <Button type="button" size="icon" variant="ghost" onClick={onDelete} aria-label="Delete">
            <Trash2 />
          </Button>
        )}
      </div>
    </form>
  );
}

const weekdayNames = {
  es: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

function AvailabilityManager() {
  const L = useL();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({ weekday: "2", start: "10:00", end: "20:00" });
  const list = useQuery({
    queryKey: ["availability"],
    queryFn: async () => {
      const { data, error } = await supabase.from("availability").select("*").order("weekday").order("start_time");
      if (error) throw error;
      return data;
    },
  });
  const done = () => qc.invalidateQueries({ queryKey: ["availability"] });
  const add = useMutation({
    mutationFn: async () => {
      if (form.end <= form.start) throw new Error(L("El fin debe ser posterior al inicio", "End must be after start"));
      const { error } = await supabase.from("availability").insert({
        weekday: Number(form.weekday), start_time: form.start, end_time: form.end,
      });
      if (error) throw error;
    },
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="mt-4 max-w-xl space-y-4">
      {list.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {L("Sin horarios cargados: se usa martes a sábado, 10:00–20:00.", "No hours set: Tuesday–Saturday, 10:00–20:00 is used.")}
        </p>
      )}
      <div className="space-y-2">
        {list.data?.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl border bg-card px-4 py-2">
            <span>
              <span className="font-semibold">{weekdayNames[lang][a.weekday]}</span>{" "}
              {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)}
            </span>
            <Button size="icon" variant="ghost" onClick={() => remove.mutate(a.id)} aria-label="Delete">
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); add.mutate(); }}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3"
      >
        <select
          value={form.weekday}
          onChange={(e) => setForm({ ...form, weekday: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {weekdayNames[lang].map((n, i) => <option key={i} value={i}>{n}</option>)}
        </select>
        <Input type="time" className="w-28" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        <Input type="time" className="w-28" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        <Button type="submit" size="sm">{L("Agregar", "Add")}</Button>
      </form>
    </section>
  );
}
