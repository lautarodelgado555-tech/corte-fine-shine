CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, left(coalesce(NEW.raw_user_meta_data->>'full_name',''),100), left(coalesce(NEW.raw_user_meta_data->>'phone',''),30));
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_es text NOT NULL,
  name_en text NOT NULL,
  duration_min int NOT NULL,
  price int NOT NULL,
  sort int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.services TO anon, authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services public read" ON public.services FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.services (name_es, name_en, duration_min, price, sort) VALUES
('Corte de pelo', 'Haircut', 30, 15000, 1),
('Corte y barba', 'Haircut & beard', 60, 22000, 2),
('Arreglo de barba', 'Beard trim', 30, 9000, 3),
('Corte y peinado', 'Cut & blow-dry', 60, 25000, 4),
('Color', 'Hair color', 90, 40000, 5);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  service_id uuid NOT NULL REFERENCES public.services(id),
  booking_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bookings select" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own bookings insert" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own bookings update" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Validate: opening hours Tue-Sat 10-20, future, no overlap
CREATE OR REPLACE FUNCTION public.validate_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dur int; dow int;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  SELECT duration_min INTO dur FROM services WHERE id = NEW.service_id;
  IF dur IS NULL THEN RAISE EXCEPTION 'Invalid service'; END IF;
  NEW.end_time := NEW.start_time + make_interval(mins => dur);
  dow := extract(isodow FROM NEW.booking_date);
  IF dow NOT BETWEEN 2 AND 6 THEN RAISE EXCEPTION 'Closed that day'; END IF;
  IF NEW.start_time < '10:00' OR NEW.end_time > '20:00' OR NEW.end_time <= NEW.start_time THEN RAISE EXCEPTION 'Outside opening hours'; END IF;
  IF (NEW.booking_date + NEW.start_time) < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires') THEN RAISE EXCEPTION 'Time is in the past'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.booking_date::text));
  IF EXISTS (SELECT 1 FROM bookings b WHERE b.booking_date = NEW.booking_date AND b.status <> 'cancelled'
     AND b.id <> NEW.id AND b.start_time < NEW.end_time AND b.end_time > NEW.start_time) THEN
    RAISE EXCEPTION 'Slot not available';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_validate BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.validate_booking();

CREATE OR REPLACE FUNCTION public.get_busy_slots(p_date date)
RETURNS TABLE(start_time time, end_time time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT start_time, end_time FROM bookings WHERE booking_date = p_date AND status <> 'cancelled';
$$;
REVOKE EXECUTE ON FUNCTION public.get_busy_slots(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_busy_slots(date) TO authenticated;