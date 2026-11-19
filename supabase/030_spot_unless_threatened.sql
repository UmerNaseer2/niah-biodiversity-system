-- Shows the exact spot of every plant whose species is on our list and isn't threatened. Before
-- this, only Least Concern and Near Threatened species showed their spot, so a Data Deficient or
-- Not Evaluated species stayed a rough area even though nobody had said it was at risk. Now only
-- these still hide the spot:
--   * a species that's Vulnerable, Endangered or Critically Endangered
--   * a species that's protected in Sarawak
--   * a species an officer set to rough area only
--   * a plant that isn't matched to a species, or whose name isn't its species' name
-- The website (showsExactSpot in web/src/lib/iucn.ts) and the phone (codeOnlyReason in
-- mobile/src/lib/tag-rule.ts) follow the same rule.
-- Run it after 029. If 007, 015 or 019 is run again, run this one again after it.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/spot-unless-threatened.test.js checks it.

-- 029 has to be there first, and 001 to 028 before that.
DO $$
BEGIN
  IF to_regprocedure('public.find_plant_by_tag(text)') IS NULL THEN
    RAISE EXCEPTION '030 needs 029_find_plant_by_tag.sql to be run first';
  END IF;
END
$$;

-- 1. The public view, the same as 028 except for the IUCN check. NOT IN on a NULL code is NULL,
-- and COALESCE turns that into hidden, so a plant with no species still only shows a rough area.
CREATE OR REPLACE VIEW public.records_public
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  r.id,
  r.tag_code,
  r.species_slug,
  r.species_name,
  r.common_name,
  r.height_m,
  r.condition,
  r.photo_count,
  CASE
    WHEN shown.exact THEN r.recorded_at
    ELSE (date_trunc('day', (r.recorded_at AT TIME ZONE 'UTC') + INTERVAL '8 hours')
      - INTERVAL '8 hours') AT TIME ZONE 'UTC'
  END AS recorded_at,
  r.status,
  CASE
    WHEN r.gps IS NULL THEN NULL
    WHEN shown.exact THEN jsonb_build_object(
      'lat', r.gps -> 'lat',
      'lng', r.gps -> 'lng',
      'accuracyM', r.gps -> 'accuracyM'
    )
    ELSE jsonb_build_object(
      'lat', round((floor((r.gps ->> 'lat')::numeric / 0.004) + 0.5) * 0.004, 3),
      'lng', round((floor((r.gps ->> 'lng')::numeric / 0.004) + 0.5) * 0.004, 3),
      'accuracyM', 440
    )
  END AS gps
FROM public.records AS r
LEFT JOIN public.species AS s ON s.id = r.species_slug
LEFT JOIN public.records AS f ON f.id = r.visit_of
LEFT JOIN public.species AS fs ON fs.id = f.species_slug
CROSS JOIN LATERAL (
  SELECT COALESCE(
    NOT s.sarawak_protected
      AND NOT s.rough_area_only
      AND s.iucn_code NOT IN ('VU', 'EN', 'CR')
      AND lower(regexp_replace(btrim(r.species_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(s.scientific_name), '\s+', ' ', 'g')),
    false
  )
  AND (
    f.id IS NULL
    OR COALESCE(
      NOT fs.sarawak_protected
        AND NOT fs.rough_area_only
        AND fs.iucn_code NOT IN ('VU', 'EN', 'CR')
        AND lower(regexp_replace(btrim(f.species_name), '\s+', ' ', 'g'))
          = lower(regexp_replace(btrim(fs.scientific_name), '\s+', ' ', 'g')),
      false
    )
  ) AS exact
) AS shown
WHERE r.status = 'published'
ORDER BY r.id;

-- The same grants as 007.
REVOKE ALL ON TABLE public.records_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.records_public TO anon, authenticated;

-- 2. The counts on the Reports page, the same as 019 except that hides_spot follows the rule above.
CREATE OR REPLACE FUNCTION public.report_counts(
  scope text DEFAULT 'published',
  from_day date DEFAULT NULL,
  to_day date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH parked AS (
    SELECT
      r.status,
      r.condition,
      r.gps IS NOT NULL AS has_gps,
      -- Park time is UTC+8 all year, the same as PARK_OFFSET_MS in web/src/lib/format.ts
      (r.recorded_at AT TIME ZONE 'UTC') + INTERVAL '8 hours' AS recorded_at,
      s.id AS species_id,
      s.iucn_code,
      COALESCE(s.iucn_code IN ('CR', 'EN', 'VU') OR s.sarawak_protected, false) AS threatened,
      -- The rule from records_public above. A plant with no species stays hidden too.
      NOT COALESCE(
        s.iucn_code NOT IN ('VU', 'EN', 'CR')
          AND NOT s.sarawak_protected
          AND NOT s.rough_area_only
          AND lower(regexp_replace(btrim(r.species_name), '\s+', ' ', 'g'))
            = lower(regexp_replace(btrim(s.scientific_name), '\s+', ' ', 'g')),
        false
      ) AS hides_spot
    FROM public.records_staff AS r
    LEFT JOIN public.species_staff AS s ON s.id = r.species_slug
    WHERE r.status = 'published'
      OR (r.status = 'waiting' AND report_counts.scope = 'all')
  ),
  covered AS (
    SELECT *
    FROM parked AS p
    WHERE (report_counts.from_day IS NULL OR p.recorded_at::date >= report_counts.from_day)
      AND (report_counts.to_day IS NULL OR p.recorded_at::date <= report_counts.to_day)
  )
  SELECT jsonb_build_object(
    'total', count(*),
    'waiting', count(*) FILTER (WHERE c.status = 'waiting'),
    'species_count', count(DISTINCT c.species_id),
    'not_matched', count(*) FILTER (WHERE c.species_id IS NULL),
    'threatened', count(*) FILTER (WHERE c.threatened),
    'needs_care', count(*) FILTER (WHERE c.condition <> 'healthy'),
    -- Rows of the CSV that say Hidden unless the exact spots are included
    'hidden_spots', count(*) FILTER (WHERE c.has_gps AND c.hides_spot),
    -- In park time to the minute, like 2026-10-12T16:05, or null with no records
    'first', to_char(min(c.recorded_at), 'YYYY-MM-DD"T"HH24:MI'),
    'last', to_char(max(c.recorded_at), 'YYYY-MM-DD"T"HH24:MI'),
    -- {"VU": 2, "none": 1}, where none is plants not matched to a species yet
    'by_iucn', (
      SELECT COALESCE(jsonb_object_agg(g.iucn, g.n), '{}'::jsonb)
      FROM (
        SELECT COALESCE(x.iucn_code, 'none') AS iucn, count(*) AS n
        FROM covered AS x
        GROUP BY 1
      ) AS g
    ),
    -- {"healthy": 7, "dead": 1}. Conditions with no records are left out.
    'by_condition', (
      SELECT COALESCE(jsonb_object_agg(g.condition, g.n), '{}'::jsonb)
      FROM (
        SELECT x.condition, count(*) AS n
        FROM covered AS x
        GROUP BY 1
      ) AS g
    ),
    -- {"eusideroxylon-zwageri": 2, "none": 1}, by species ID
    'by_species', (
      SELECT COALESCE(jsonb_object_agg(g.species, g.n), '{}'::jsonb)
      FROM (
        SELECT COALESCE(x.species_id, 'none') AS species, count(*) AS n
        FROM covered AS x
        GROUP BY 1
      ) AS g
    ),
    -- {"2026-10": {"healthy": 4, "dead": 1}}, by month in park time
    'by_month', (
      SELECT COALESCE(jsonb_object_agg(m.month, m.conditions), '{}'::jsonb)
      FROM (
        SELECT g.month, jsonb_object_agg(g.condition, g.n) AS conditions
        FROM (
          SELECT to_char(x.recorded_at, 'YYYY-MM') AS month, x.condition, count(*) AS n
          FROM covered AS x
          GROUP BY 1, 2
        ) AS g
        GROUP BY g.month
      ) AS m
    )
  )
  FROM covered AS c;
$$;

-- The same grants as 019.
REVOKE EXECUTE ON FUNCTION public.report_counts(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_counts(text, date, date) TO authenticated;

-- 3. The species trigger from 015 only forces rough area only for threatened or protected species
-- now, the same as lockReason in web/src/lib/species-form.ts. An officer can still turn it on for
-- any species.
CREATE OR REPLACE FUNCTION public.keep_species_rough()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT NEW.rough_area_only
    AND (NEW.sarawak_protected OR NEW.iucn_code IN ('VU', 'EN', 'CR')) THEN
    NEW.rough_area_only := true;
  END IF;
  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.keep_species_rough() FROM PUBLIC, anon, authenticated;

-- 4. Data Deficient and Not Evaluated species that aren't protected. The old trigger and the old
-- species form both forced these to rough area only, so nobody could have chosen it, and they go
-- back to showing the exact spot. The public map does change, so this leaves the history line
-- (013) and moves updated_at (007) like any other change. Running it again finds nothing to do.
UPDATE public.species
SET rough_area_only = false
WHERE rough_area_only
  AND NOT sarawak_protected
  AND iucn_code IN ('DD', 'NE');

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
