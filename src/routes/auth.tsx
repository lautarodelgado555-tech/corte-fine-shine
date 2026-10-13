import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingresar — Corte Fino" },
      { name: "description", content: "Ingresá o creá tu cuenta en Corte Fino." },
      { property: "og:title", content: "Ingresar — Corte Fino" },
      { property: "og:description", content: "Ingresá o creá tu cuenta en Corte Fino." },
    ],
  }),
  component: AuthPage,
});

const signUpSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
});

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "up") {
        const parsed = signUpSchema.safeParse(form);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          toast.error(issue ? `${issue.path.join(" ")}: ${issue.message}` : t("error"));
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin + "/book",
            data: { full_name: parsed.data.full_name, phone: parsed.data.phone },
          },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/book" });
        else toast.success(t("checkEmail"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        });
        if (error) throw error;
        navigate({ to: "/book" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <h1 className="text-4xl font-semibold">{mode === "in" ? t("signIn") : t("signUp")}</h1>
      <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        {mode === "up" && (
          <>
            <Field id="name" label={t("fullName")}>
              <Input id="name" value={form.full_name} onChange={set("full_name")} required />
            </Field>
            <Field id="phone" label={t("phone")}>
              <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} required />
            </Field>
          </>
        )}
        <Field id="email" label={t("email")}>
          <Input id="email" type="email" value={form.email} onChange={set("email")} required />
        </Field>
        <Field id="password" label={t("password")}>
          <Input id="password" type="password" value={form.password} onChange={set("password")} required minLength={6} />
        </Field>
        <Button type="submit" className="h-11 w-full rounded-full" disabled={loading}>
          {mode === "in" ? t("signIn") : t("signUp")}
        </Button>
      </form>
      <button
        onClick={() => setMode(mode === "in" ? "up" : "in")}
        className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
      >
        {mode === "in" ? t("noAccount") : t("haveAccount")}
      </button>
    </main>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
