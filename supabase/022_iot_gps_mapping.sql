-- IoT Device Tracking, GPS Mapping and Patrol Response (item 32).
-- Adds GPS coordinates to sensor nodes, exposes node locations through iot_node_status,
-- and allows conservation officers and admins to dispatch patrols for urgent alerts.
-- Run it after 001 to 021.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.

-- 021 has to be there first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'role_changes'
  ) THEN
    RAISE EXCEPTION '022 needs 021_role_changes.sql to be run first';
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

-- Allow authenticated admins to update latitude and longitude on nodes
GRANT UPDATE (name, zone, edge_device_id, latitude, longitude) ON TABLE public.iot_nodes TO authenticated;

-- 2. Add patrol dispatch response columns to iot_alerts
ALTER TABLE public.iot_alerts
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatched_by_name text,
  ADD COLUMN IF NOT EXISTS patrol_notes text;

-- 3. Function to dispatch a field patrol team to investigate an alert
CREATE OR REPLACE FUNCTION public.iot_dispatch_patrol(alert bigint, notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  who record;
  hit record;
BEGIN
  SELECT id, name, role INTO who
  FROM public.profiles
  WHERE id = auth.uid() AND role IN ('conservation_officer', 'admin');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Only conservation officers and administrators can dispatch a patrol.');
  END IF;

  SELECT id, node_id, status, severity INTO hit
  FROM public.iot_alerts
  WHERE id = alert;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Alert not found.');
  END IF;

  IF hit.status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This alert has already been resolved.');
  END IF;

  UPDATE public.iot_alerts
  SET
    status = 'acknowledged',
    acknowledged_at = COALESCE(acknowledged_at, now()),
    acknowledged_by = COALESCE(acknowledged_by, who.id),
    dispatched_at = now(),
    dispatched_by = who.id,
    dispatched_by_name = who.name,
    patrol_notes = NULLIF(trim(notes), '')
  WHERE id = alert;

  RETURN jsonb_build_object('ok', true, 'message', 'Patrol team dispatched.');
END;
$$;

REVOKE ALL ON FUNCTION public.iot_dispatch_patrol(bigint, text) FROM PUBLIC, anon;
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
  COALESCE(last.recorded_at < now() - make_interval(mins => limits.quiet_minutes), false) AS quiet,
  COALESCE(last.latitude, n.latitude) AS latitude,
  COALESCE(last.longitude, n.longitude) AS longitude
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
