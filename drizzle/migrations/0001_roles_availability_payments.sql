-- Roles (kept in their own table so clients can't promote themselves)
CREATE TYPE public.app_role AS ENUM ('client', 'owner');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own roles select" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'));

INSERT INTO public.user_roles (user_id, role) SELECT id, 'client' FROM public.profiles ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, left(coalesce(NEW.raw_user_meta_data->>'full_name',''),100), left(coalesce(NEW.raw_user_meta_data->>'phone',''),30));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  RETURN NEW;
END $$;

CREATE POLICY "owner reads profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- Services
ALTER TABLE public.services ADD COLUMN duration_minutes integer;
UPDATE public.services SET duration_minutes = duration_min;
ALTER TABLE public.services ALTER COLUMN duration_minutes SET DEFAULT 30;
ALTER TABLE public.services ADD COLUMN deposit integer NOT NULL DEFAULT 0;
GRANT INSERT, UPDATE, DELETE ON public.services TO authenticated;
CREATE POLICY "owner inserts services" ON public.services FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner updates services" ON public.services FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner deletes services" ON public.services FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Availability
CREATE TABLE public.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  CHECK (end_time > start_time)
);
GRANT SELECT ON public.availability TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "availability public read" ON public.availability FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "owner inserts availability" ON public.availability FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner updates availability" ON public.availability FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner deletes availability" ON public.availability FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Bookings
ALTER TABLE public.bookings ADD COLUMN client_id uuid DEFAULT auth.uid();
ALTER TABLE public.bookings ADD COLUMN starts_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN stripe_session_id text;
UPDATE public.bookings SET client_id = user_id,
  starts_at = (booking_date + start_time) AT TIME ZONE 'America/Argentina/Buenos_Aires';
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending_payment', 'confirmed', 'cancelled'));

CREATE OR REPLACE FUNCTION public.sync_booking_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.client_id := coalesce(NEW.client_id, NEW.user_id);
  NEW.starts_at := (NEW.booking_date + NEW.start_time) AT TIME ZONE 'America/Argentina/Buenos_Aires';
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_sync BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_booking_fields();

CREATE POLICY "owner reads bookings" ON public.bookings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner updates bookings" ON public.bookings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));