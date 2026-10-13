import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import salon from "@/assets/salon.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Corte Fino — Peluquería · Reservá tu turno" },
      { name: "description", content: "Reservá online tu corte, barba o color en Corte Fino." },
      { property: "og:title", content: "Corte Fino — Peluquería" },
      { property: "og:description", content: "Reservá online tu corte, barba o color en Corte Fino." },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  return (
    <main className="mx-auto grid max-w-5xl items-center gap-10 px-5 py-14 md:grid-cols-2 md:py-20">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">{t("tagline")}</p>
        <h1 className="mt-4 text-5xl font-semibold leading-[1.05] md:text-6xl">{t("heroTitle")}</h1>
        <p className="mt-5 max-w-md text-lg text-muted-foreground">{t("heroSub")}</p>
        <Button asChild size="lg" className="mt-8 h-12 rounded-full px-8 text-base">
          <Link to="/book">{t("bookNow")}</Link>
        </Button>
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4" /> {t("hours")}
        </p>
      </div>
      <img
        src={salon}
        alt="Corte Fino"
        width={1280}
        height={960}
        className="aspect-[4/5] w-full rounded-3xl object-cover shadow-2xl"
      />
    </main>
  );
}
