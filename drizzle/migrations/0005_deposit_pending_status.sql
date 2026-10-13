-- New bookings: clients can't choose their own status. Deposit > 0 => pending_payment.
CREATE OR REPLACE FUNCTION public.set_initial_booking_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dep int;
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'owner') THEN RETURN NEW; END IF;
  SELECT deposit INTO dep FROM services WHERE id = NEW.service_id;
  NEW.status := CASE WHEN coalesce(dep, 0) > 0 THEN 'pending_payment' ELSE 'confirmed' END;
  NEW.stripe_session_id := NULL;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_initial_booking_status() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bookings_initial_status BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_initial_booking_status();

-- Unpaid holds expire after 30 minutes so they stop blocking the slot.
CREATE OR REPLACE FUNCTION public.booking_holds_slot(_status text, _created timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT _status = 'confirmed' OR (_status = 'pending_payment' AND _created > now() - interval '30 minutes')
$$;

CREATE OR REPLACE FUNCTION public.get_busy_slots(p_date date)
RETURNS TABLE(start_time time, end_time time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT start_time, end_time FROM bookings
  WHERE booking_date = p_date AND public.booking_holds_slot(status, created_at);
$$;

CREATE OR REPLACE FUNCTION public.validate_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dur int; has_avail boolean;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  SELECT coalesce(duration_minutes, duration_min) INTO dur FROM services WHERE id = NEW.service_id;
  IF dur IS NULL THEN RAISE EXCEPTION 'Invalid service'; END IF;
  NEW.end_time := NEW.start_time + make_interval(mins => dur);
  IF NEW.end_time <= NEW.start_time THEN RAISE EXCEPTION 'Outside opening hours'; END IF;
  SELECT EXISTS (SELECT 1 FROM availability) INTO has_avail;
  IF has_avail THEN
    IF NOT EXISTS (SELECT 1 FROM availability a WHERE a.weekday = extract(dow FROM NEW.booking_date)
        AND a.start_time <= NEW.start_time AND a.end_time >= NEW.end_time) THEN
      RAISE EXCEPTION 'Outside opening hours';
    END IF;
  ELSE
    IF extract(isodow FROM NEW.booking_date) NOT BETWEEN 2 AND 6
       OR NEW.start_time < '10:00' OR NEW.end_time > '20:00' THEN
      RAISE EXCEPTION 'Outside opening hours';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.booking_date + NEW.start_time) < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires') THEN
    RAISE EXCEPTION 'Time is in the past';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.booking_date::text));
  IF EXISTS (SELECT 1 FROM bookings b WHERE b.booking_date = NEW.booking_date
     AND public.booking_holds_slot(b.status, b.created_at)
     AND b.id <> NEW.id AND b.start_time < NEW.end_time AND b.end_time > NEW.start_time) THEN
    RAISE EXCEPTION 'Slot not available';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.validate_booking() FROM PUBLIC, anon, authenticated;