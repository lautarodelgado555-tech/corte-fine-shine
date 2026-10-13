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
  IF EXISTS (SELECT 1 FROM bookings b WHERE b.booking_date = NEW.booking_date AND b.status <> 'cancelled'
     AND b.id <> NEW.id AND b.start_time < NEW.end_time AND b.end_time > NEW.start_time) THEN
    RAISE EXCEPTION 'Slot not available';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.validate_booking() FROM PUBLIC, anon, authenticated;