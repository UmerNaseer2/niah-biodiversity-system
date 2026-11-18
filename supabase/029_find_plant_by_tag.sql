-- Lets field staff find a plant by its tag when it was recorded on another phone, so they can add
-- a visit to it. A botanist can only read the records they uploaded (006), so without this a phone
-- only knows its own records and the published ones in the visitor copy. A plant someone else
-- recorded that's still waiting for review couldn't be found at all.
-- It gives back only what the phone needs to add a visit: the plant's first record, its name, its
-- condition, when it was recorded, its review status and a count of its visits. Never the spot,
-- the notes, the photos, the review notes or who recorded it.
-- Uploading the visit needs nothing new. The foreign key and the check from 028 look at the first
-- record whoever uploads the visit, and the insert policy from 005 doesn't depend on reading it.
-- Run it after 028.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/find-plant.test.js checks it.

-- 028 has to be there first, and 001 to 027 before that.
DO $$
BEGIN
  IF to_regclass('public.record_visits_public') IS NULL THEN
    RAISE EXCEPTION '029 needs 028_record_visits.sql to be run first';
  END IF;
END
$$;

-- The tag code can be typed in any case and with spaces around it, the same as on the phone. A
-- code that isn't a tag code at all finds nothing. A visit's own code is never printed, but if
-- someone types it, they get the plant it's a visit to, so a visit always points at the first
-- record. A plant an officer deleted isn't found.
CREATE OR REPLACE FUNCTION public.find_plant_by_tag(code text)
RETURNS TABLE (
  id uuid,
  tag_code text,
  species_name text,
  common_name text,
  species_slug text,
  condition text,
  recorded_at timestamptz,
  status text,
  visit_count integer,
  last_visit_at timestamptz,
  last_visit_condition text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  wanted text := upper(btrim(code));
BEGIN
  IF NOT public.has_any_role(ARRAY['botanist', 'conservation_officer', 'admin']) THEN
    RAISE EXCEPTION 'Only field staff can look up a plant by its tag' USING ERRCODE = '42501';
  END IF;

  IF wanted IS NULL OR wanted !~ '^NNP-[0-9A-F]{6}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.tag_code,
    f.species_name,
    f.common_name,
    f.species_slug,
    f.condition,
    f.recorded_at,
    f.status,
    v.visit_count,
    v.last_visit_at,
    v.last_visit_condition
  FROM public.records AS hit
  JOIN public.records AS f ON f.id = COALESCE(hit.visit_of, hit.id)
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*)::integer FROM public.records AS x WHERE x.visit_of = f.id) AS visit_count,
      newest.recorded_at AS last_visit_at,
      newest.condition AS last_visit_condition
    FROM (SELECT 1) AS one
    LEFT JOIN LATERAL (
      SELECT y.recorded_at, y.condition
      FROM public.records AS y
      WHERE y.visit_of = f.id
      ORDER BY y.recorded_at DESC, y.id
      LIMIT 1
    ) AS newest ON true
  ) AS v
  WHERE hit.tag_code = wanted;
END
$$;

REVOKE EXECUTE ON FUNCTION public.find_plant_by_tag(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_plant_by_tag(text) TO authenticated;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
