-- Threat alerts (item 31). The rules run in the database when a reading arrives, so nothing
-- depends on the website being open. One ongoing problem is one alert with a count on it, not a
-- new alert for every reading. Officers and admins can acknowledge and resolve an alert, and the
-- database writes down who and when.
-- The numbers in iot_alert_limits are starting values to tune. None of them have been tested in
-- the field. Change them in that table, not here.
-- Run it after 001 to 016.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/iot.test.js checks it.

-- 016 has to be there first, and 001 to 015 before that.
DO $$
BEGIN
  IF to_regprocedure('public.iot_add_readings(text, text, jsonb)') IS NULL THEN
    RAISE EXCEPTION '017 needs 016_iot_readings.sql to be run first';
  END IF;
END
$$;

-- 1. The limits the rules use, in one row. Running this file again keeps any values already
-- tuned. The soil numbers and the distance come from the testing Bryan did (iot/testing), and the
-- rest are our first guess at what's unusual.
CREATE TABLE IF NOT EXISTS public.iot_alert_limits (
  only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  -- Leaning this far from upright means the node was knocked, or what it's tied to has moved
  tilt_degrees_max numeric NOT NULL DEFAULT 30 CHECK (tilt_degrees_max > 0),
  -- A node sitting still reads about 1 g, so this is a hard knock
  shock_g_max numeric NOT NULL DEFAULT 2.5 CHECK (shock_g_max > 1),
  distance_change_cm_max numeric NOT NULL DEFAULT 10 CHECK (distance_change_cm_max > 0),
  soil_moisture_min numeric NOT NULL DEFAULT 20 CHECK (soil_moisture_min >= 0),
  soil_moisture_max numeric NOT NULL DEFAULT 85 CHECK (soil_moisture_max <= 100),
  temperature_min_c numeric NOT NULL DEFAULT 15,
  temperature_max_c numeric NOT NULL DEFAULT 40,
  battery_min_percent numeric NOT NULL DEFAULT 20 CHECK (battery_min_percent >= 0),
  -- No reading for this long means the node has gone quiet
  quiet_minutes integer NOT NULL DEFAULT 15 CHECK (quiet_minutes > 0),
  -- After someone resolves an alert, the same problem on the same node waits this long before it
  -- makes a new alert, so a soil probe that stays dry doesn't come straight back
  reraise_minutes integer NOT NULL DEFAULT 60 CHECK (reraise_minutes >= 0),
  CHECK (soil_moisture_min < soil_moisture_max),
  CHECK (temperature_min_c < temperature_max_c)
);

INSERT INTO public.iot_alert_limits (only_row) VALUES (true) ON CONFLICT (only_row) DO NOTHING;

ALTER TABLE public.iot_alert_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.iot_alert_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.iot_alert_limits TO authenticated;
GRANT UPDATE (
  tilt_degrees_max, shock_g_max, distance_change_cm_max, soil_moisture_min, soil_moisture_max,
  temperature_min_c, temperature_max_c, battery_min_percent, quiet_minutes, reraise_minutes
) ON TABLE public.iot_alert_limits TO authenticated;

DROP POLICY IF EXISTS "Officers and admins read alert limits" ON public.iot_alert_limits;
CREATE POLICY "Officers and admins read alert limits"
  ON public.iot_alert_limits FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

DROP POLICY IF EXISTS "Admins change alert limits" ON public.iot_alert_limits;
CREATE POLICY "Admins change alert limits"
  ON public.iot_alert_limits FOR UPDATE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']))
  WITH CHECK (public.has_any_role(ARRAY['admin']));

-- 2. The alerts. Nobody adds or changes one directly through the API. The rules below add them,
-- and the two functions at the end acknowledge and resolve them, so a row can't say someone else
-- did it. The names are kept as well as the IDs, so an alert still says who it was after their
-- account is deleted.
-- urgent could mean someone is at the plant. routine can wait for the next patrol.
CREATE TABLE IF NOT EXISTS public.iot_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  node_id text NOT NULL REFERENCES public.iot_nodes (node_id),
  node_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'disturbance', 'movement', 'soil_dry', 'soil_wet', 'too_hot', 'too_cold', 'battery_low', 'quiet'
  )),
  severity text NOT NULL CHECK (severity IN ('urgent', 'routine')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  -- Which value set it off the last time, what it was, and the limit it went past
  reading_field text,
  reading_value numeric,
  limit_value numeric,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  -- How many readings have shown this problem
  repeat_count integer NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  acknowledged_by_name text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  resolved_by_name text,
  -- True when a node that had gone quiet started sending again, so nobody had to resolve it
  closed_by_itself boolean NOT NULL DEFAULT false,
  CONSTRAINT resolved_has_a_time CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  CONSTRAINT acknowledged_has_a_time CHECK (status <> 'acknowledged' OR acknowledged_at IS NOT NULL)
);

-- This is what stops one problem making hundreds of alerts: one unresolved alert for each problem
-- on each node.
CREATE UNIQUE INDEX IF NOT EXISTS iot_alerts_one_unresolved
  ON public.iot_alerts (node_id, kind)
  WHERE status <> 'resolved';

CREATE INDEX IF NOT EXISTS iot_alerts_status_severity
  ON public.iot_alerts (status, severity);

CREATE INDEX IF NOT EXISTS iot_alerts_node_id_kind_first_seen_at
  ON public.iot_alerts (node_id, kind, first_seen_at DESC);

ALTER TABLE public.iot_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.iot_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.iot_alerts TO authenticated;

DROP POLICY IF EXISTS "Officers and admins read alerts" ON public.iot_alerts;
CREATE POLICY "Officers and admins read alerts"
  ON public.iot_alerts FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

-- 3. Adds an alert, or counts one more reading on the one already there. An old reading from an
-- edge device's buffer can arrive after a newer one, so the times only ever widen.
CREATE OR REPLACE FUNCTION public.iot_raise_alert(
  node text,
  alert_kind text,
  alert_severity text,
  field text,
  field_value numeric,
  field_limit numeric,
  seen_at timestamptz,
  reraise_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.iot_alerts AS a
  SET repeat_count = a.repeat_count + 1,
      first_seen_at = LEAST(a.first_seen_at, seen_at),
      last_seen_at = GREATEST(a.last_seen_at, seen_at),
      reading_field = CASE WHEN seen_at >= a.last_seen_at THEN field ELSE a.reading_field END,
      reading_value = CASE WHEN seen_at >= a.last_seen_at THEN field_value ELSE a.reading_value END,
      limit_value = CASE WHEN seen_at >= a.last_seen_at THEN field_limit ELSE a.limit_value END
  WHERE a.node_id = node
    AND a.kind = alert_kind
    AND a.status <> 'resolved';
  IF FOUND THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.iot_alerts AS a
    WHERE a.node_id = node
      AND a.kind = alert_kind
      AND a.status = 'resolved'
      AND a.resolved_at > seen_at - make_interval(mins => reraise_minutes)
  ) THEN
    RETURN;
  END IF;

  -- ON CONFLICT is for two batches arriving at the same moment. The index only lets one through.
  INSERT INTO public.iot_alerts (
    node_id, node_name, kind, severity, reading_field, reading_value, limit_value, first_seen_at,
    last_seen_at
  )
  SELECT node, n.name, alert_kind, alert_severity, field, field_value, field_limit, seen_at, seen_at
  FROM public.iot_nodes AS n
  WHERE n.node_id = node
  ON CONFLICT (node_id, kind) WHERE status <> 'resolved'
  DO UPDATE SET repeat_count = public.iot_alerts.repeat_count + 1;
END
$$;

-- Only the rules below run it, so nobody can call it through the API.
REVOKE EXECUTE ON FUNCTION public.iot_raise_alert(text, text, text, text, numeric, numeric, timestamptz, integer)
  FROM PUBLIC, anon, authenticated, service_role;

-- 4. The rules, run once for each reading that's really added. A sensor a node doesn't have sends
-- nothing, and a comparison with nothing is never true, so that rule just doesn't run.
CREATE OR REPLACE FUNCTION public.iot_check_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  limits public.iot_alert_limits;
BEGIN
  SELECT * INTO limits FROM public.iot_alert_limits;

  -- ELSIF, because one reading is seen once even if it breaks all three limits
  IF NEW.tilt_degrees > limits.tilt_degrees_max THEN
    PERFORM public.iot_raise_alert(NEW.node_id, 'disturbance', 'urgent', 'tilt_degrees',
      NEW.tilt_degrees, limits.tilt_degrees_max, NEW.recorded_at, limits.reraise_minutes);
  ELSIF NEW.shock_g > limits.shock_g_max THEN
    PERFORM public.iot_raise_alert(NEW.node_id, 'disturbance', 'urgent', 'shock_g',
      NEW.shock_g, limits.shock_g_max, NEW.recorded_at, limits.reraise_minutes);
  ELSIF NEW.distance_change_cm > limits.distance_change_cm_max THEN
    PERFORM public.iot_raise_alert(NEW.node_id, 'disturbance', 'urgent', 'distance_change_cm',
      NEW.distance_change_cm, limits.distance_change_cm_max, NEW.recorded_at, limits.reraise_minutes);
  END IF;
  -- A PIR also goes off for animals, so on its own this can wait for the next patrol
  IF NEW.motion_detected THEN
    PERFORM public.iot_raise_alert(NEW.node_id, 'movement', 'routine', 'motion_detected',
      NULL, NULL, NEW.recorded_at, limits.reraise_minutes);
  END IF;
  IF NEW.soil_moisture_percent < limits.soil_moisture_min THEN
    PERFORM public.iot_raise_alert(NEW.node_id, 'soil_dry', 'routine', 'soil_moisture_percent',
      NEW.soil_moisture_percent, limits.soil_moisture_min, NEW.recorded_at, limits.reraise_minutes);
  END IF;
  IF NEW.soil_moisture_percent > limits.soil_moisture_max THEN
    PERFORM public.iot_raise_alert(NEW.node_id, 'soil_wet', 'routine', 'soil_moisture_percent',
      NEW.soil_moisture_percent, limits.soil_moisture_max, NEW.recorded_at, limits.reraise_minutes);
  END IF;
  IF NEW.temperature_c > limits.temperature_max_c THEN
    PERFORM public.iot_raise_alert(NEW.node_id, 'too_hot', 'routine', 'temperature_c',
      NEW.temperature_c, limits.temperature_max_c, NEW.recorded_at, limits.reraise_minutes);
  END IF;
  IF NEW.temperature_c < limits.temperature_min_c THEN
    PERFORM public.iot_raise_alert(NEW.node_id, 'too_cold', 'routine', 'temperature_c',
      NEW.temperature_c, limits.temperature_min_c, NEW.recorded_at, limits.reraise_minutes);
  END IF;
  IF NEW.battery_percent < limits.battery_min_percent THEN
    PERFORM public.iot_raise_alert(NEW.node_id, 'battery_low', 'routine', 'battery_percent',
      NEW.battery_percent, limits.battery_min_percent, NEW.recorded_at, limits.reraise_minutes);
  END IF;

  -- A new reading means a quiet node is back. An old one from a buffer doesn't, because the node
  -- could still be quiet now.
  IF NEW.recorded_at >= now() - make_interval(mins => limits.quiet_minutes) THEN
    UPDATE public.iot_alerts AS a
    SET status = 'resolved',
        resolved_at = now(),
        closed_by_itself = true
    WHERE a.node_id = NEW.node_id
      AND a.kind = 'quiet'
      AND a.status <> 'resolved';
  END IF;

  RETURN NULL;
END
$$;

REVOKE EXECUTE ON FUNCTION public.iot_check_reading()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS iot_check_reading ON public.iot_readings;
CREATE TRIGGER iot_check_reading
  AFTER INSERT ON public.iot_readings
  FOR EACH ROW EXECUTE FUNCTION public.iot_check_reading();

-- 5. Nodes that have gone quiet. No reading arrives to set this off, so something has to ask.
-- It runs each time any device sends (the trigger below) and each time a staff page loads
-- (iot_check_alerts). A scheduler such as pg_cron could also run it. It makes one alert for each
-- silence: if there's already an alert newer than the node's last reading, it's been raised, even
-- if someone has resolved it since. A node that has never sent anything isn't quiet, it just
-- hasn't started, so the sample nodes from 002 never alert.
-- If the battery was already low when the node stopped, that's the likely reason, so it can wait.
-- Otherwise someone should find out why.
CREATE OR REPLACE FUNCTION public.iot_raise_quiet_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  limits public.iot_alert_limits;
  raised integer;
BEGIN
  SELECT * INTO limits FROM public.iot_alert_limits;

  WITH added AS (
    INSERT INTO public.iot_alerts (
      node_id, node_name, kind, severity, reading_field, reading_value, limit_value,
      first_seen_at, last_seen_at
    )
    SELECT
      n.node_id,
      n.name,
      'quiet',
      CASE WHEN last.battery_percent < limits.battery_min_percent THEN 'routine' ELSE 'urgent' END,
      'quiet_minutes',
      floor(extract(epoch FROM now() - last.recorded_at) / 60),
      limits.quiet_minutes,
      now(),
      now()
    FROM public.iot_nodes AS n
    CROSS JOIN LATERAL (
      SELECT r.recorded_at, r.battery_percent
      FROM public.iot_readings AS r
      WHERE r.node_id = n.node_id
      ORDER BY r.recorded_at DESC
      LIMIT 1
    ) AS last
    WHERE last.recorded_at < now() - make_interval(mins => limits.quiet_minutes)
      AND NOT EXISTS (
        SELECT 1
        FROM public.iot_alerts AS a
        WHERE a.node_id = n.node_id
          AND a.kind = 'quiet'
          AND a.first_seen_at >= last.recorded_at
      )
    ON CONFLICT (node_id, kind) WHERE status <> 'resolved' DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO raised FROM added;

  RETURN raised;
END
$$;

-- No grants. iot_check_alerts is how staff get to it, and a scheduler runs as the owner.
REVOKE EXECUTE ON FUNCTION public.iot_raise_quiet_alerts()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iot_device_heard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.iot_raise_quiet_alerts();
  RETURN NULL;
END
$$;

REVOKE EXECUTE ON FUNCTION public.iot_device_heard()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS iot_device_heard ON public.iot_devices;
CREATE TRIGGER iot_device_heard
  AFTER UPDATE OF last_heard_at ON public.iot_devices
  FOR EACH ROW EXECUTE FUNCTION public.iot_device_heard();

-- 6. What the staff pages call. It looks for quiet nodes, then says how many alerts need someone,
-- which is what the red number in the staff menu shows. An acknowledged alert has someone on it,
-- so it doesn't count. It only answers officers and admins.
CREATE OR REPLACE FUNCTION public.iot_check_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_any_role(ARRAY['conservation_officer', 'admin']) THEN
    RAISE EXCEPTION 'Only officers and administrators can check alerts' USING ERRCODE = '42501';
  END IF;

  PERFORM public.iot_raise_quiet_alerts();

  RETURN (
    SELECT jsonb_build_object(
      'urgent', count(*) FILTER (WHERE a.severity = 'urgent'),
      'open', count(*)
    )
    FROM public.iot_alerts AS a
    WHERE a.status = 'open'
  );
END
$$;

REVOKE EXECUTE ON FUNCTION public.iot_check_alerts()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iot_check_alerts() TO authenticated;

-- 7. Acknowledge means "I've seen this and someone is on it". Resolve means "it's dealt with".
-- Both give back the alert's status. Doing either one again changes nothing, so the first person
-- stays on it if two officers press the button at once. Anyone else gets turned down.
CREATE OR REPLACE FUNCTION public.iot_acknowledge_alert(alert bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  now_status text;
BEGIN
  IF NOT public.has_any_role(ARRAY['conservation_officer', 'admin']) THEN
    RAISE EXCEPTION 'Only officers and administrators can acknowledge alerts' USING ERRCODE = '42501';
  END IF;

  UPDATE public.iot_alerts AS a
  SET status = 'acknowledged',
      acknowledged_at = now(),
      acknowledged_by = auth.uid(),
      acknowledged_by_name = (
        SELECT COALESCE(NULLIF(p.name, ''), p.email)
        FROM public.profiles AS p
        WHERE p.id = auth.uid()
      )
  WHERE a.id = alert
    AND a.status = 'open';

  SELECT a.status INTO now_status FROM public.iot_alerts AS a WHERE a.id = alert;
  IF now_status IS NULL THEN
    RAISE EXCEPTION 'There''s no alert %', alert;
  END IF;
  RETURN jsonb_build_object('id', alert, 'status', now_status);
END
$$;

REVOKE EXECUTE ON FUNCTION public.iot_acknowledge_alert(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iot_acknowledge_alert(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.iot_resolve_alert(alert bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  now_status text;
BEGIN
  IF NOT public.has_any_role(ARRAY['conservation_officer', 'admin']) THEN
    RAISE EXCEPTION 'Only officers and administrators can resolve alerts' USING ERRCODE = '42501';
  END IF;

  UPDATE public.iot_alerts AS a
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = auth.uid(),
      resolved_by_name = (
        SELECT COALESCE(NULLIF(p.name, ''), p.email)
        FROM public.profiles AS p
        WHERE p.id = auth.uid()
      )
  WHERE a.id = alert
    AND a.status <> 'resolved';

  SELECT a.status INTO now_status FROM public.iot_alerts AS a WHERE a.id = alert;
  IF now_status IS NULL THEN
    RAISE EXCEPTION 'There''s no alert %', alert;
  END IF;
  RETURN jsonb_build_object('id', alert, 'status', now_status);
END
$$;

REVOKE EXECUTE ON FUNCTION public.iot_resolve_alert(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iot_resolve_alert(bigint) TO authenticated;

-- 8. Each node with its latest reading, for the Sensors page. It reads as whoever is asking, so
-- the Row Level Security on the tables decides who gets rows. It never shows the telemetry columns
-- on iot_nodes, which only have made up numbers from 002, and it leaves out the GPS. A node with
-- no readings yet has empty columns here and isn't quiet.
CREATE OR REPLACE VIEW public.iot_node_status
WITH (security_invoker = true)
AS
SELECT
  n.node_id,
  n.name,
  n.zone,
  n.edge_device_id,
  last.recorded_at AS last_reading_at,
  last.temperature_c,
  last.humidity_percent,
  last.soil_moisture_percent,
  last.rain_percent,
  last.battery_percent,
  last.tilt_degrees,
  last.shock_g,
  last.distance_change_cm,
  last.motion_detected,
  COALESCE(last.recorded_at < now() - make_interval(mins => limits.quiet_minutes), false) AS quiet
FROM public.iot_nodes AS n
CROSS JOIN public.iot_alert_limits AS limits
LEFT JOIN LATERAL (
  SELECT r.*
  FROM public.iot_readings AS r
  WHERE r.node_id = n.node_id
  ORDER BY r.recorded_at DESC
  LIMIT 1
) AS last ON true;

REVOKE ALL ON TABLE public.iot_node_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.iot_node_status TO authenticated;

NOTIFY pgrst, 'reload schema';
