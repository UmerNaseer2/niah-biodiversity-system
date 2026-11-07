-- Limits how many readings one edge device can add in an hour, so a device token can't be used to
-- fill the database. A device with three sensor nodes sends about 180 readings an hour, and close
-- to 2,200 if all three report a problem every 5 seconds for the whole hour, so 3,600 leaves room.
-- A call that would go over is refused with HTTP 429 and none of its readings are kept. The edge
-- device keeps the batch and tries again later, waiting longer each time. Readings it has already
-- sent don't count again.
-- Run it after 001 to 017 and 019 to 021.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again. To change the limit, change the number in part 2 and run it
-- again.
-- supabase/tests/iot-limit.test.js checks it.

-- 021 has to be there first.
DO $$
BEGIN
  IF to_regclass('public.role_changes') IS NULL THEN
    RAISE EXCEPTION '022 needs 021_role_changes.sql to be run first';
  END IF;
END
$$;

-- 1. Lets the count in part 2 find one device's readings from the last hour without reading the
-- rest of the table.
CREATE INDEX IF NOT EXISTS iot_readings_device_id_received_at
  ON public.iot_readings (device_id, received_at);

-- 2. Runs after each reading is added and counts the device's readings from the last hour, the new
-- one too. Only one call from a device counts at a time, because of the lock, so two calls sent
-- together can't both get under the limit. iot_add_readings only catches errors about bad values,
-- so raising this one undoes the whole call. The REST API turns the PT429 code into HTTP 429.
-- Readings it skips as already sent never get here, since nothing new was added.
CREATE OR REPLACE FUNCTION public.iot_limit_readings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  most_an_hour constant integer := 3600;
  lately integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.iot_limit_readings ' || NEW.device_id));
  SELECT count(*) INTO lately
  FROM (
    SELECT 1
    FROM public.iot_readings AS r
    WHERE r.device_id = NEW.device_id
      AND r.received_at > now() - interval '1 hour'
    LIMIT most_an_hour + 1
  ) AS recent;
  IF lately > most_an_hour THEN
    RAISE EXCEPTION 'This device has sent too many readings in the last hour'
      USING ERRCODE = 'PT429',
        DETAIL = format('One device can send %s readings an hour.', most_an_hour),
        HINT = 'Send them again later.';
  END IF;
  RETURN NULL;
END
$$;

REVOKE EXECUTE ON FUNCTION public.iot_limit_readings()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS iot_limit_readings ON public.iot_readings;
CREATE TRIGGER iot_limit_readings
  AFTER INSERT ON public.iot_readings
  FOR EACH ROW EXECUTE FUNCTION public.iot_limit_readings();

NOTIFY pgrst, 'reload schema';
