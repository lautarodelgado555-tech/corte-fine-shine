import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "es" | "en";

const dict = {
  tagline: { es: "Peluquería de autor", en: "Signature hair salon" },
  heroTitle: { es: "Tu próximo corte, a un clic.", en: "Your next cut, one click away." },
  heroSub: {
    es: "Elegí el servicio, el día y el horario. Nosotros nos encargamos del resto.",
    en: "Pick a service, a day and a time. We'll take care of the rest.",
  },
  bookNow: { es: "Reservar turno", en: "Book now" },
  hours: { es: "Martes a sábado · 10:00 – 20:00", en: "Tuesday to Saturday · 10:00 – 20:00" },
  signIn: { es: "Ingresar", en: "Sign in" },
  signUp: { es: "Crear cuenta", en: "Create account" },
  signOut: { es: "Salir", en: "Sign out" },
  email: { es: "Email", en: "Email" },
  password: { es: "Contraseña", en: "Password" },
  fullName: { es: "Nombre completo", en: "Full name" },
  phone: { es: "Teléfono", en: "Phone" },
  noAccount: { es: "¿No tenés cuenta? Registrate", en: "No account? Sign up" },
  haveAccount: { es: "¿Ya tenés cuenta? Ingresá", en: "Already have an account? Sign in" },
  checkEmail: {
    es: "Revisá tu email para confirmar la cuenta.",
    en: "Check your email to confirm your account.",
  },
  myBookings: { es: "Mis reservas", en: "My bookings" },
  step1: { es: "1. Servicio", en: "1. Service" },
  step2: { es: "2. Fecha", en: "2. Date" },
  step3: { es: "3. Horario", en: "3. Time" },
  pickDate: { es: "Elegí una fecha primero", en: "Pick a date first" },
  noSlots: { es: "No hay horarios disponibles", en: "No times available" },
  confirm: { es: "Confirmar reserva", en: "Confirm booking" },
  booked: { es: "¡Reserva confirmada!", en: "Booking confirmed!" },
  upcoming: { es: "Próximas reservas", en: "Upcoming bookings" },
  none: { es: "Todavía no tenés reservas.", en: "You have no bookings yet." },
  cancel: { es: "Cancelar", en: "Cancel" },
  cancelled: { es: "Reserva cancelada", en: "Booking cancelled" },
  min: { es: "min", en: "min" },
  hello: { es: "Hola", en: "Hi" },
  pendingDeposit: { es: "Seña pendiente", en: "Deposit pending" },
  payDeposit: { es: "Pagar seña", en: "Pay deposit" },
  deposit: { es: "seña", en: "deposit" },
  paidThanks: {
    es: "¡Pago recibido! Tu reserva se confirma en instantes.",
    en: "Payment received! Your booking will be confirmed shortly.",
  },
  error: { es: "Algo salió mal", en: "Something went wrong" },
} as const;

export type Key = keyof typeof dict;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "es",
  setLang: () => {},
  t: (k) => dict[k].es,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");
  useEffect(() => {
    const saved = localStorage.getItem("cf-lang");
    if (saved === "en" || saved === "es") setLangState(saved);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("cf-lang", l);
  };
  return <Ctx.Provider value={{ lang, setLang, t: (k) => dict[k][lang] }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
