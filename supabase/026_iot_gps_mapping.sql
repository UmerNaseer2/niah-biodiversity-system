-- IoT Device Tracking, GPS Mapping and Patrol Response (item 32).
-- Adds GPS coordinates to sensor nodes, exposes node locations through iot_node_status,
-- and allows conservation officers and admins to dispatch patrols for urgent alerts.
-- Run it after 001 to 025.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.

-- 025 has to be there first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'iot_commands'
  ) THEN
    RAISE EXCEPTION '026 needs 025_iot_commands.sql to be run first';
  END IF;
END
$$;

-- 1. Add coordinates to sensor nodes for fixed placement and GPS device tracking
ALTER TABLE public.iot_nodes
  ADD COLUMN IF NOT EXISTS latitude numeric(9, 6) CONSTRAINT node_latitude_in_range CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude numeric(9, 6) CONSTRAINT node_longitude_in_range CHECK (longitude BETWEEN -180 AND 180);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'iot_nodes_lat_lng_together'
  ) THEN
    ALTER TABLE public.iot_nodes
      ADD CONSTRAINT iot_nodes_lat_lng_together CHECK ((latitude IS NULL) = (longitude IS NULL));
  END IF;
END
$$;

-- Seed initial GPS coordinates around Niah National Park zones for existing nodes
UPDATE public.iot_nodes
SET latitude = 3.815200, longitude = 113.777500
WHERE node_id = 'NNP-IOT-01' AND latitude IS NULL;

UPDATE public.iot_nodes
SET latitude = 3.817500, longitude = 113.781200
WHERE node_id = 'NNP-IOT-02' AND latitude IS NULL;

UPDATE public.iot_nodes
SET latitude = 3.821500, longitude = 113.776200
WHERE node_id = 'NNP-IOT-03' AND latitude IS NULL;

-- No grant needed for the new columns: 006 grants iot_nodes to authenticated as a whole table, and
-- its policy only lets admins change rows. A column grant here would be lost whenever 006 runs again.

-- 2. Add patrol dispatch response columns to iot_alerts
ALTER TABLE public.iot_alerts
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatched_by_name text,
  ADD COLUMN IF NOT EXISTS patrol_notes text;

-- 3. Sending a patrol to an alert. Only officers and admins can, and it also acknowledges the alert
-- if nobody has yet. The first patrol sent stays on it, like acknowledging, so two officers pressing
-- the button at once don't overwrite each other. Anyone else, a resolved alert or one that already
-- has a patrol gets ok false and a message the website shows as it is.
CREATE OR REPLACE FUNCTION public.iot_dispatch_patrol(alert bigint, notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  who record;
  now_status text;
BEGIN
  SELECT p.id, COALESCE(NULLIF(p.name, ''), p.email) AS name INTO who
  FROM public.profiles AS p
  WHERE p.id = auth.uid() AND p.role IN ('conservation_officer', 'admin');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Only conservation officers and administrators can dispatch a patrol.');
  END IF;

  UPDATE public.iot_alerts AS a
  SET status = 'acknowledged',
      acknowledged_at = COALESCE(a.acknowledged_at, now()),
      acknowledged_by = CASE WHEN a.acknowledged_at IS NULL THEN who.id ELSE a.acknowledged_by END,
      acknowledged_by_name = CASE WHEN a.acknowledged_at IS NULL THEN who.name ELSE a.acknowledged_by_name END,
      dispatched_at = now(),
      dispatched_by = who.id,
      dispatched_by_name = who.name,
      patrol_notes = left(NULLIF(trim(notes), ''), 500)
  WHERE a.id = alert
    AND a.status <> 'resolved'
    AND a.dispatched_at IS NULL;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'message', 'Patrol team dispatched.');
  END IF;

  SELECT a.status INTO now_status FROM public.iot_alerts AS a WHERE a.id = alert;
  IF now_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'That alert is gone. Reload the page to see the ones left.');
  ELSIF now_status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This alert has already been resolved.');
  END IF;
  RETURN jsonb_build_object('ok', false, 'message', 'A patrol has already been sent for this alert.');
END
$$;

REVOKE EXECUTE ON FUNCTION public.iot_dispatch_patrol(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iot_dispatch_patrol(bigint, text) TO authenticated;

-- 4. Update iot_node_status view to expose node coordinates at the end
CREATE OR REPLACE VIEW public.iot_node_status
WITH (security_invoker = true)
AS
SELECT
  n.node_id,
  n.name,
  n.zone,
  n.edge_device_id,
  n.status,
  n.last_heartbeat,
  last.recorded_at AS last_reading_at,
  now() - last.recorded_at AS age,
  last.temp_c,
  CASE WHEN last.temp_c >= n.too_hot_c THEN 'TOO_HOT'
       WHEN last.temp_c IS NOT NULL THEN 'NORMAL' END AS temp_state,
  last.hum_pct,
  last.soil_raw,
  p.soil_pct,
  CASE WHEN p.soil_pct >= n.soil_flood_pct THEN 'SATURATED'
       WHEN p.soil_pct <= n.soil_dry_pct THEN 'DRY'
       WHEN p.soil_pct IS NOT NULL THEN 'NORMAL' END AS soil_state,
  last.rain_raw,
  p.rain_pct,
  CASE WHEN p.rain_pct >= n.rain_heavy_pct THEN 'HEAVY'
       WHEN p.rain_pct >= n.rain_light_pct THEN 'RAIN'
       WHEN p.rain_pct IS NOT NULL THEN 'NONE' END AS rain_state,
  last.dist_cm,
  last.baseline_cm,
  CASE WHEN last.id IS NULL THEN NULL
       WHEN last.dist_cm IS NULL THEN 'NO_ECHO'
       WHEN last.baseline_cm IS NOT NULL
        AND abs(round(last.dist_cm * 10) - round(last.baseline_cm * 10)) > round(n.move_cm * 10) THEN 'MOVED'
       ELSE 'OK' END AS dist_state,
  last.motion,
  n.beep_on,
  n.last_rssi AS rssi,
  COALESCE(last.recorded_at < now() - make_interval(mins => n.quiet_minutes), false) AS quiet,
  COALESCE(a.going_on, 0) AS open_alerts,
  COALESCE(a.urgent, 0) AS urgent_alerts,
  n.latitude,
  n.longitude
FROM public.iot_nodes AS n
LEFT JOIN LATERAL (
  SELECT r.*
  FROM public.iot_readings AS r
  WHERE r.node_id = n.node_id
  ORDER BY r.recorded_at DESC
  LIMIT 1
) AS last ON true
CROSS JOIN LATERAL (
  SELECT public.iot_raw_pct(last.soil_raw, n.soil_dry_raw, n.soil_wet_raw) AS soil_pct,
         public.iot_raw_pct(last.rain_raw, n.rain_dry_raw, n.rain_wet_raw) AS rain_pct
) AS p
LEFT JOIN LATERAL (
  SELECT count(*) AS going_on, count(*) FILTER (WHERE x.severity = 'urgent') AS urgent
  FROM public.iot_alerts AS x
  WHERE x.node_id = n.node_id AND x.cleared_at IS NULL AND x.status <> 'resolved'
) AS a ON true;

REVOKE ALL ON TABLE public.iot_node_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.iot_node_status TO authenticated;

NOTIFY pgrst, 'reload schema';
