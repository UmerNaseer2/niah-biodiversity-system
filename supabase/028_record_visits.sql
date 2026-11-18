-- Visits to a plant that already has a record. When the field team scans a tag and looks at the
-- plant again, the phone saves a new record with visit_of set to the plant's first record, instead
-- of changing the old one. So the first record keeps what was seen the first time, and each visit
-- keeps what was seen that day.
-- visit_of always points at the plant's first record, never at another visit, so a plant's history
-- is the first record plus every record whose visit_of is its ID. One level, no chains.
-- A visit is a normal record in every other way: it waits for an officer, it has its own GPS fix
-- and photos, and it gets its own generated tag_code from its own ID like every record (005). That
-- code is never printed, because the tag on the plant is the first record's. Keeping it means
-- tag_code and records_tag_code_key stay exactly as they are, and every record still has a code
-- the website and the phone can find it by.
-- Run it after 027.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/visits.test.js checks it.

-- 027 has to be there first, and 001 to 026 before that.
DO $$
BEGIN
  IF to_regclass('public.iot_daily_summary') IS NULL THEN
    RAISE EXCEPTION '028 needs 027_iot_daily_summary.sql to be run first';
  END IF;
END
$$;

-- 1. The column. Deleting a plant's first record leaves its visits as records on their own
-- (ON DELETE SET NULL) instead of deleting them too. They're real things someone saw on another
-- day, often by someone else, and a delete shouldn't quietly take them with it. The officer can
-- still delete each one. Clearing visit_of on them counts as a change, so it shows in their edit
-- history (013) and moves their updated_at (008).
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS visit_of uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.records'::regclass AND conname = 'records_visit_of_fkey'
  ) THEN
    ALTER TABLE public.records
      ADD CONSTRAINT records_visit_of_fkey
      FOREIGN KEY (visit_of) REFERENCES public.records (id) ON DELETE SET NULL;
  END IF;
  -- A record can't be a visit to itself.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.records'::regclass AND conname = 'records_visit_of_check'
  ) THEN
    ALTER TABLE public.records
      ADD CONSTRAINT records_visit_of_check CHECK (visit_of <> id);
  END IF;
END
$$;

-- Finding a plant's visits is a look up on this column.
CREATE INDEX IF NOT EXISTS records_visit_of ON public.records (visit_of);

COMMENT ON COLUMN public.records.visit_of IS
  'The first record of the same plant when this record is a later visit to it, otherwise null.';

-- 2. Keeps visits one level deep. A check constraint can't look at another row, so a trigger does
-- it. The record it points at can't be a visit itself, and a record that already has visits can't
-- become one. FOR SHARE holds the first record still until this insert is done, so it can't turn
-- into a visit at the same moment.
-- A record that isn't there at all is left to the foreign key, which says 23503. The phone takes
-- that as "try again later", because the first record may still be on its way up.
-- A first record an officer deleted (010) is different: it's never coming back, so the visit goes
-- up as a record on its own, the same as if it had been deleted after the visit went up.
CREATE OR REPLACE FUNCTION public.check_visit_of()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  first_is_visit_of uuid;
BEGIN
  -- Null is a first record, and a record pointing at itself is turned down by the check above.
  IF NEW.visit_of IS NULL OR NEW.visit_of = NEW.id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
    AND EXISTS (SELECT 1 FROM public.deleted_records WHERE id = NEW.visit_of)
    AND NOT EXISTS (SELECT 1 FROM public.records WHERE id = NEW.visit_of) THEN
    NEW.visit_of := NULL;
    RETURN NEW;
  END IF;

  SELECT r.visit_of INTO first_is_visit_of
  FROM public.records AS r
  WHERE r.id = NEW.visit_of
  FOR SHARE;

  IF first_is_visit_of IS NOT NULL THEN
    RAISE EXCEPTION 'A visit has to point at the first record of the plant, not at another visit.'
      USING ERRCODE = 'check_violation',
        CONSTRAINT = 'records_visit_of_check',
        HINT = 'Use the visit_of of the record you scanned instead.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.records WHERE visit_of = NEW.id) THEN
    RAISE EXCEPTION 'This record already has visits, so it can''t be a visit itself.'
      USING ERRCODE = 'check_violation',
        CONSTRAINT = 'records_visit_of_check';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS check_visit_of ON public.records;
CREATE TRIGGER check_visit_of
  BEFORE INSERT OR UPDATE OF visit_of ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.check_visit_of();

-- Only the trigger runs it, so nobody can call it through the API.
REVOKE EXECUTE ON FUNCTION public.check_visit_of() FROM PUBLIC, anon, authenticated;

-- 3. The phone sends visit_of with a new record, so field staff can fill it in (005 lists the rest).
-- There's no UPDATE grant for it, so once a record is up, which plant it's a visit to only changes
-- in the SQL editor. The policies from 005 and 006 already cover who can insert and read.
GRANT INSERT (visit_of) ON TABLE public.records TO authenticated;

-- 4. records_staff reads r.*, which Postgres turns into the list of columns when the view is made
-- (see 008 and 014), so it has to be made again to show visit_of. The rest is the same as 014.
CREATE OR REPLACE VIEW public.records_staff
WITH (security_invoker = true)
AS
SELECT r.*
FROM public.records AS r
WHERE public.has_any_role(ARRAY['conservation_officer', 'admin']);

REVOKE ALL ON TABLE public.records_staff FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.records_staff TO authenticated;

-- 5. The public view, the same as 019 with one more rule for visits. Its columns don't change, so
-- 007 and 019 can still be run again after this (run 028 again after them, the same as 019 after
-- 007). A visit only shows its exact spot when its own name and species show it (019) and the
-- first record's would too. A visit can be named differently from the plant's first record, and
-- it stands right next to the same plant, so this keeps a visit from giving away the spot of a
-- plant whose spot is hidden. If the first record was deleted, only the visit's own rule counts.
-- report_counts (019) reads records_staff, and a visit still counts as a record there. It doesn't
-- change.
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
      AND s.iucn_code IN ('LC', 'NT')
      AND lower(regexp_replace(btrim(r.species_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(s.scientific_name), '\s+', ' ', 'g')),
    false
  )
  AND (
    f.id IS NULL
    OR COALESCE(
      NOT fs.sarawak_protected
        AND NOT fs.rough_area_only
        AND fs.iucn_code IN ('LC', 'NT')
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

-- 6. Which published records are visits to which plant, for the public tag page. It only has a
-- row when both the visit and the first record are published, so it never names a record the
-- public can't see. The date, condition and spot of each visit come from records_public, with
-- its rules.
CREATE OR REPLACE VIEW public.record_visits_public
WITH (security_invoker = false, security_barrier = true)
AS
SELECT r.id, r.visit_of
FROM public.records AS r
JOIN public.records AS f ON f.id = r.visit_of
WHERE r.status = 'published' AND f.status = 'published'
ORDER BY r.id;

REVOKE ALL ON TABLE public.record_visits_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.record_visits_public TO anon, authenticated;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
