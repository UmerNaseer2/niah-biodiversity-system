-- Counts the records for the Reports page in the database, so the website doesn't have to load
-- every record just to count them. It gives back the totals, the counts by IUCN status, condition,
-- species and month, and how many rows of the CSV would say Hidden.
-- Run it after 001 to 011.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/report-counts.test.js checks it.

-- 011 has to be there first, and 001 to 010 before that.
DO $$
BEGIN
  IF to_regclass('public.exact_location_downloads') IS NULL THEN
    RAISE EXCEPTION '012 needs 011_exact_location_downloads.sql to be run first';
  END IF;
END
$$;

-- It reads records_staff and species_staff as whoever is asking (SECURITY INVOKER), so the views
-- decide what they see: officers and admins get every count, and anyone else gets zeros.
-- The filters are the same as the Reports page and its CSV (web/src/lib/reports.ts):
--   scope     'all' counts records waiting for review as well. Anything else counts published
--             records only. Rejected records never count.
--   from_day  the first day, in park time, or null for no limit
--   to_day    the last day, in park time, kept in the counts
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
      -- The rule from records_public (007). A plant with no species stays hidden too.
      NOT COALESCE(
        s.iucn_code IN ('LC', 'NT') AND NOT s.sarawak_protected AND NOT s.rough_area_only,
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

-- Only people who are signed in can call it. Supabase gives anon EXECUTE on new functions by
-- default, so it's taken away here.
REVOKE EXECUTE ON FUNCTION public.report_counts(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_counts(text, date, date) TO authenticated;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
