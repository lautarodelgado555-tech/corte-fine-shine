import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function SiteHeader() {
  const { t, lang, setLang } = useI18n();
  const [signedIn, setSignedIn] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const check = async (uid?: string) => {
      setSignedIn(!!uid);
      if (!uid) return setIsOwner(false);
      const { data } = await supabase.rpc("has_role", { _user_id: uid, _role: "owner" });
      setIsOwner(!!data);
    };
    supabase.auth.getSession().then(({ data }) => check(data.session?.user.id));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => check(s?.user.id), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header className="bg-header text-header-foreground">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2">
          <Scissors className="size-5 text-primary" />
          <span className="font-display text-xl font-semibold">Corte Fino</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-header-foreground/25 p-0.5 text-xs">
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-full px-2.5 py-1 font-semibold uppercase transition-colors ${
                  lang === l ? "bg-primary text-primary-foreground" : "text-header-foreground/70"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {signedIn ? (
            <>
              {isOwner && (
                <Button asChild variant="header" size="sm">
                  <Link to="/admin">Admin</Link>
                </Button>
              )}
              <Button asChild variant="header" size="sm">
                <Link to="/book" hash="mis-reservas">{t("myBookings")}</Link>
              </Button>
              <Button variant="header" size="sm" onClick={signOut}>
                {t("signOut")}
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">{t("signIn")}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
