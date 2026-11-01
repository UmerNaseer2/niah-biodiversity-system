-- Sensor readings (items 28 and 29). Each edge device has its own token, and the only thing that
-- token does is add readings for the nodes linked to that device. Only a hash of it is kept.
-- Officers and admins read the readings, and only admins manage the devices.
-- 017 adds the threat rules that run when a reading arrives.
-- Run it after 001 to 015.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/iot.test.js checks it.

-- 015 has to be there first, and 001 to 014 before that.
DO $$
BEGIN
  IF to_regprocedure('public.keep_species_rough()') IS NULL THEN
    RAISE EXCEPTION '016 needs 015_species_rough_area.sql to be run first';
  END IF;
END
$$;

-- 1. The edge devices, one for each forest region. Admins add them and can turn them off. The
-- token columns here only say when a token was made and by who. The website and the API can never
-- set those, because only iot_make_device_token below does.
CREATE TABLE IF NOT EXISTS public.iot_devices (
  device_id text PRIMARY KEY CHECK (device_id ~ '^[A-Za-z0-9-]{3,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  zone text CHECK (char_length(zone) <= 80),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  token_made_at timestamptz,
  token_made_by_name text,
  last_heard_at timestamptz
);

ALTER TABLE public.iot_devices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.iot_devices FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.iot_devices TO authenticated;
GRANT INSERT (device_id, name, zone) ON TABLE public.iot_devices TO authenticated;
GRANT UPDATE (name, zone, enabled) ON TABLE public.iot_devices TO authenticated;

DROP POLICY IF EXISTS "Admins manage edge devices" ON public.iot_devices;
CREATE POLICY "Admins manage edge devices"
  ON public.iot_devices FOR ALL
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']))
  WITH CHECK (public.has_any_role(ARRAY['admin']));

-- 2. The token hashes, on their own so nobody can read them through the API, admins included. It
-- has Row Level Security on and no policies, and no role the API uses has any grant on it. Only
-- the functions below use it. A plain SHA-256 is enough here because a token is long and random,
-- so there's nothing to guess from a list of common passwords.
CREATE TABLE IF NOT EXISTS public.iot_device_tokens (
  device_id text PRIMARY KEY REFERENCES public.iot_devices (device_id) ON DELETE CASCADE,
  token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32)
);

ALTER TABLE public.iot_device_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.iot_device_tokens FROM PUBLIC, anon, authenticated, service_role;

-- 3. Which edge device each node sends through. Admins set it, using the policy from 006. A node
-- with no device can't get readings from anyone. The telemetry columns from 001 are left alone
-- and nothing reads them any more, because 002 filled them with made up numbers. Everything real
-- is in iot_readings.
ALTER TABLE public.iot_nodes
  ADD COLUMN IF NOT EXISTS edge_device_id text
    REFERENCES public.iot_devices (device_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS iot_nodes_edge_device_id ON public.iot_nodes (edge_device_id);

-- 4. The readings. Only iot_add_readings below adds them, and nobody changes or removes one
-- through the API. A device can't be removed while it has readings, and neither can a node, so
-- the history stays whole. Turn a device off instead.
-- The ranges are what the parts can really measure, not what's normal for the forest. A value
-- outside them means a broken sensor or a bad message. What counts as a threat is in 017.
-- reading_id comes from the node and only has to be unique on its own device, so one device can't
-- block another device's readings by using the same ID.
-- The latitude and longitude come from a GPS on the node, and only staff can read them, because
-- nodes sit beside protected plants. No public view reads this table.
CREATE TABLE IF NOT EXISTS public.iot_readings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id text NOT NULL REFERENCES public.iot_devices (device_id),
  node_id text NOT NULL REFERENCES public.iot_nodes (node_id),
  reading_id text NOT NULL CONSTRAINT reading_id_format CHECK (reading_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  -- The DHT11 is rated for 0 to 50 C, and this leaves room for a better part later
  temperature_c numeric(5, 2) CONSTRAINT temperature_c_in_range CHECK (temperature_c BETWEEN -20 AND 70),
  humidity_percent numeric(5, 2) CONSTRAINT humidity_percent_in_range CHECK (humidity_percent BETWEEN 0 AND 100),
  soil_moisture_percent numeric(5, 2) CONSTRAINT soil_moisture_percent_in_range CHECK (soil_moisture_percent BETWEEN 0 AND 100),
  rain_percent numeric(5, 2) CONSTRAINT rain_percent_in_range CHECK (rain_percent BETWEEN 0 AND 100),
  battery_percent numeric(5, 2) CONSTRAINT battery_percent_in_range CHECK (battery_percent BETWEEN 0 AND 100),
  -- From the MPU 6050: how far the node leans from upright, and the hardest knock since the last
  -- reading. The part measures up to 16 g on each axis, so all three together stay under 32 g.
  tilt_degrees numeric(5, 2) CONSTRAINT tilt_degrees_in_range CHECK (tilt_degrees BETWEEN 0 AND 180),
  shock_g numeric(5, 2) CONSTRAINT shock_g_in_range CHECK (shock_g BETWEEN 0 AND 32),
  -- From the HC-SR04: how far the distance has changed since the node started. It reaches 4 m.
  distance_change_cm numeric(6, 2) CONSTRAINT distance_change_cm_in_range CHECK (distance_change_cm BETWEEN 0 AND 500),
  -- From the PIR
  motion_detected boolean,
  latitude numeric(9, 6) CONSTRAINT latitude_in_range CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9, 6) CONSTRAINT longitude_in_range CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT latitude_and_longitude_together CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT iot_readings_device_id_reading_id_key UNIQUE (device_id, reading_id)
);

CREATE INDEX IF NOT EXISTS iot_readings_node_id_recorded_at
  ON public.iot_readings (node_id, recorded_at DESC);

ALTER TABLE public.iot_readings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.iot_readings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.iot_readings TO authenticated;

-- In a sub-select so Postgres checks the role once, not again for every reading
DROP POLICY IF EXISTS "Officers and admins read sensor readings" ON public.iot_readings;
CREATE POLICY "Officers and admins read sensor readings"
  ON public.iot_readings FOR SELECT
  TO authenticated
  USING ((SELECT public.has_any_role(ARRAY['conservation_officer', 'admin'])));

-- 5. What an edge device calls to add readings. It's the one thing the publishable key can do with
-- sensor data, so anyone can call it, and it decides by the token. Being signed in doesn't help,
-- so it isn't granted to authenticated. It gives back nothing that's stored, only counts.
--
-- A wrong token, an unknown device and a device that's turned off all get the same answer, so
-- nobody can find out which device IDs exist. A token is about 240 random bits, so it can't be
-- guessed by trying, even though nothing here limits how often someone can ask.
--
-- One bad reading doesn't stop the rest. Each reading goes in on its own, and the answer lists any
-- that were turned down and why, so the device can drop those and never send them again. Sending
-- a reading again is fine: the first one stays, it counts as a duplicate, and it can't raise an
-- alert twice, because triggers only run for rows that were really added.
CREATE OR REPLACE FUNCTION public.iot_add_readings(device text, token text, readings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- The most readings in one request. The edge device sends fewer than this at a time.
  max_readings CONSTANT integer := 100;
  -- How far ahead of the server a device's clock can be, and how old a saved reading can be
  furthest_ahead CONSTANT interval := INTERVAL '5 minutes';
  oldest CONSTANT interval := INTERVAL '7 days';
  reading jsonb;
  place integer := -1;
  recorded timestamptz;
  why text;
  added integer;
  accepted integer := 0;
  duplicates integer := 0;
  refused jsonb := '[]'::jsonb;
BEGIN
  IF device IS NULL OR token IS NULL OR char_length(token) > 200 OR NOT EXISTS (
    SELECT 1
    FROM public.iot_devices AS d
    JOIN public.iot_device_tokens AS t ON t.device_id = d.device_id
    WHERE d.device_id = device
      AND d.enabled
      AND t.token_hash = sha256(convert_to(token, 'UTF8'))
  ) THEN
    RAISE EXCEPTION 'This device can''t add readings' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(readings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'readings has to be a list';
  END IF;
  IF jsonb_array_length(readings) > max_readings THEN
    RAISE EXCEPTION 'At most % readings at a time', max_readings;
  END IF;

  FOR reading IN SELECT value FROM jsonb_array_elements(readings) LOOP
    place := place + 1;
    why := NULL;
    BEGIN
      recorded := COALESCE((reading ->> 'recorded_at')::timestamptz, now());
      why := CASE
        WHEN jsonb_typeof(reading) <> 'object' THEN 'not_a_reading'
        WHEN reading ->> 'reading_id' IS NULL THEN 'reading_id_format'
        -- Says the same for a node that doesn't exist, so a device can't look for other nodes
        WHEN NOT EXISTS (
          SELECT 1
          FROM public.iot_nodes AS n
          WHERE n.node_id = reading ->> 'node_id'
            AND n.edge_device_id = device
        ) THEN 'node_not_on_this_device'
        WHEN recorded > now() + furthest_ahead THEN 'recorded_at_ahead'
        WHEN recorded < now() - oldest THEN 'recorded_at_too_old'
      END;

      IF why IS NULL THEN
        INSERT INTO public.iot_readings (
          device_id, node_id, reading_id, recorded_at, temperature_c, humidity_percent,
          soil_moisture_percent, rain_percent, battery_percent, tilt_degrees, shock_g,
          distance_change_cm, motion_detected, latitude, longitude
        ) VALUES (
          device,
          reading ->> 'node_id',
          reading ->> 'reading_id',
          recorded,
          (reading ->> 'temperature_c')::numeric,
          (reading ->> 'humidity_percent')::numeric,
          (reading ->> 'soil_moisture_percent')::numeric,
          (reading ->> 'rain_percent')::numeric,
          (reading ->> 'battery_percent')::numeric,
          (reading ->> 'tilt_degrees')::numeric,
          (reading ->> 'shock_g')::numeric,
          (reading ->> 'distance_change_cm')::numeric,
          (reading ->> 'motion_detected')::boolean,
          (reading ->> 'latitude')::numeric,
          (reading ->> 'longitude')::numeric
        )
        ON CONFLICT (device_id, reading_id) DO NOTHING;

        GET DIAGNOSTICS added = ROW_COUNT;
        accepted := accepted + added;
        duplicates := duplicates + 1 - added;
      END IF;
    EXCEPTION
      -- The constraint's name says which value was out of range
      WHEN check_violation THEN
        GET STACKED DIAGNOSTICS why = CONSTRAINT_NAME;
      -- Not a number or a date, or too big for the column
      WHEN data_exception THEN
        why := 'bad_value';
    END;

    IF why IS NOT NULL THEN
      refused := refused || jsonb_build_object(
        'index', place,
        'reading_id', left(reading ->> 'reading_id', 64),
        'why', why
      );
    END IF;
  END LOOP;

  -- 017 looks for nodes that have gone quiet each time this changes
  UPDATE public.iot_devices SET last_heard_at = now() WHERE device_id = device;

  RETURN jsonb_build_object('accepted', accepted, 'duplicates', duplicates, 'refused', refused);
END
$$;

REVOKE EXECUTE ON FUNCTION public.iot_add_readings(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iot_add_readings(text, text, jsonb) TO anon;

-- 6. Makes a device's token, or replaces it. The old token stops working straight away. This is
-- the only time the plain token exists: it goes back to the admin who asked, and only its hash is
-- saved, so a lost token can't be looked up, only replaced. The random part comes from two
-- gen_random_uuid() calls, which use the server's secure random source and need no extension.
CREATE OR REPLACE FUNCTION public.iot_make_device_token(device text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  plain text;
  made_at timestamptz := now();
BEGIN
  IF NOT public.has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Only administrators can make device tokens' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.iot_devices AS d WHERE d.device_id = device) THEN
    RAISE EXCEPTION 'There''s no device called %', device;
  END IF;

  plain := 'niah_device_'
    || replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.iot_device_tokens (device_id, token_hash)
  VALUES (device, sha256(convert_to(plain, 'UTF8')))
  ON CONFLICT (device_id) DO UPDATE SET token_hash = EXCLUDED.token_hash;

  UPDATE public.iot_devices
  SET token_made_at = made_at,
      token_made_by_name = (
        SELECT COALESCE(NULLIF(p.name, ''), p.email)
        FROM public.profiles AS p
        WHERE p.id = auth.uid()
      )
  WHERE device_id = device;

  RETURN jsonb_build_object('device_id', device, 'token', plain, 'token_made_at', made_at);
END
$$;

REVOKE EXECUTE ON FUNCTION public.iot_make_device_token(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iot_make_device_token(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
