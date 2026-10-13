-- Clients may only create bookings for themselves (both owner columns must match)
DROP POLICY "own bookings insert" ON public.bookings;
CREATE POLICY "own bookings insert" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.uid() = coalesce(client_id, user_id));

-- Clients may only cancel their own booking; nothing else can change
DROP POLICY "own bookings update" ON public.bookings;
CREATE POLICY "own bookings cancel" ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

DROP POLICY "owner updates bookings" ON public.bookings;
CREATE POLICY "owner updates bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

DROP POLICY "owner updates services" ON public.services;
CREATE POLICY "owner updates services" ON public.services FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

DROP POLICY "owner updates availability" ON public.availability;
CREATE POLICY "owner updates availability" ON public.availability FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- Block clients from altering any booking field besides status when cancelling
CREATE OR REPLACE FUNCTION public.guard_client_booking_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') AND auth.role() = 'authenticated' THEN
    IF NEW.service_id <> OLD.service_id OR NEW.booking_date <> OLD.booking_date
       OR NEW.start_time <> OLD.start_time OR NEW.user_id <> OLD.user_id
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id THEN
      RAISE EXCEPTION 'Clients can only cancel bookings';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_guard_client BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_booking_update();