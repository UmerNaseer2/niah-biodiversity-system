-- Puts a plant on the species list when an officer approves its record. Before this, a record whose
-- name wasn't on the list stayed unmatched after it was approved, so it never showed on the species
-- list and its plant only showed a rough area until an officer added the species by hand and then
-- saved every record again.
-- Now, when a record becomes published with no species:
--   * if a species on the list has the same name (capitals and extra spaces don't matter), the
--     record is linked to it
--   * if not, a new species is added with that name as Not Evaluated, not protected and not rough
--     area only, so under 030 the plant shows its exact spot. Its family is left blank and the
--     common name comes from the record, so an officer can fill in the rest on the Species page.
-- Every other record with no species and the same name is linked as well, and its name is written
-- the way the species list spells it. Adding a species on the Species page links those records too.
-- Deleting a species doesn't add it back: its records stay unmatched until one is edited or approved
-- again.
-- At the end it does the same for records that were already approved before this file was run.
-- Run it after 030.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/species-from-record.test.js checks it.

-- 030 has to be there first, and 001 to 029 before that.
DO $$
BEGIN
  IF to_regprocedure('public.find_plant_by_tag(text)') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc AS p
      WHERE p.oid = to_regprocedure('public.keep_species_rough()')
        AND p.prosrc LIKE '%IN (''VU'', ''EN'', ''CR'')%'
    ) THEN
    RAISE EXCEPTION '031 needs 030_spot_unless_threatened.sql to be run first';
  END IF;
END
$$;

-- 1. A plant name the way the matching sees it: no spaces at the ends, one space between words and
-- no capitals. It's the same comparison 030 uses to decide if a record has its species' name.
CREATE OR REPLACE FUNCTION public.plant_name_key(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
$$;

-- 2. Links every record that has no species and this species' name. Used when a species is added,
-- either on the Species page or by the trigger below.
CREATE OR REPLACE FUNCTION public.link_records_to_species(species_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  listed text;
BEGIN
  SELECT s.scientific_name INTO listed FROM public.species AS s WHERE s.id = species_id;
  IF listed IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.records AS r
  SET species_slug = species_id,
      species_name = btrim(regexp_replace(listed, '\s+', ' ', 'g'))
  WHERE r.species_slug IS NULL
    AND public.plant_name_key(r.species_name) = public.plant_name_key(listed);
END
$$;

-- 3. The species for a plant name: one already on the list, or a new one. A lock on the name stops
-- two approvals at the same moment from both adding it.
CREATE OR REPLACE FUNCTION public.species_for_plant_name(plant_name text, common_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  name_key text := public.plant_name_key(plant_name);
  tidy_name text := btrim(regexp_replace(plant_name, '\s+', ' ', 'g'));
  tidy_common text := btrim(regexp_replace(COALESCE(common_name, ''), '\s+', ' ', 'g'));
  base text;
  new_id text;
  tries integer := 1;
  found_id text;
BEGIN
  IF name_key IS NULL OR name_key = '' THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('species_for_plant_name ' || name_key));

  -- The oldest match, if the list has the same name twice
  SELECT s.id INTO found_id
  FROM public.species AS s
  WHERE public.plant_name_key(s.scientific_name) = name_key
  ORDER BY s.created_at, s.id
  LIMIT 1;
  IF found_id IS NOT NULL THEN
    RETURN found_id;
  END IF;

  -- The ID goes in web addresses, so it only has small letters, numbers and hyphens. The website
  -- checks for that in web/src/lib/species-db.ts.
  base := left(btrim(regexp_replace(name_key, '[^a-z0-9]+', '-', 'g'), '-'), 80);
  base := btrim(base, '-');
  IF base = '' THEN
    base := 'plant';
  END IF;
  new_id := base;
  WHILE EXISTS (SELECT 1 FROM public.species AS s WHERE s.id = new_id OR s.slug = new_id) LOOP
    tries := tries + 1;
    new_id := base || '-' || tries;
  END LOOP;

  INSERT INTO public.species (id, scientific_name, family, common_names, iucn_code,
    sarawak_protected, rough_area_only)
  VALUES (
    new_id,
    tidy_name,
    '',
    CASE WHEN tidy_common = '' THEN ARRAY[]::text[] ELSE ARRAY[tidy_common] END,
    'NE',
    false,
    false
  );
  RETURN new_id;
END
$$;

-- 4. When a record becomes published with no species, finds or adds the species and links it. It
-- runs after the update, so the record is in the table and gets linked with the others. It only
-- runs when the status has just changed to published, or the name of a published record has
-- changed, so a deleted species (which leaves its records with no species) isn't added back.
CREATE OR REPLACE FUNCTION public.add_species_when_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  species_id text;
BEGIN
  IF NEW.status = 'published'
    AND NEW.species_slug IS NULL
    AND (
      OLD.status IS DISTINCT FROM 'published'
      OR OLD.species_name IS DISTINCT FROM NEW.species_name
    ) THEN
    species_id := public.species_for_plant_name(NEW.species_name, NEW.common_name);
    IF species_id IS NOT NULL THEN
      PERFORM public.link_records_to_species(species_id);
    END IF;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS add_species_when_published ON public.records;
CREATE TRIGGER add_species_when_published
  AFTER UPDATE OF status, species_name, species_slug ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.add_species_when_published();

-- 5. When a species is added, links the records that already have its name.
CREATE OR REPLACE FUNCTION public.link_records_to_new_species()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.link_records_to_species(NEW.id);
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS link_records_to_new_species ON public.species;
CREATE TRIGGER link_records_to_new_species
  AFTER INSERT ON public.species
  FOR EACH ROW EXECUTE FUNCTION public.link_records_to_new_species();

-- Only the triggers use these, so nobody can call them through the API.
REVOKE EXECUTE ON FUNCTION public.plant_name_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_records_to_species(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.species_for_plant_name(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_species_when_published() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_records_to_new_species() FROM PUBLIC, anon, authenticated;

-- 6. The records that were approved before this file, oldest first so the common name comes from
-- the first one.
DO $$
DECLARE
  plant record;
  species_id text;
BEGIN
  FOR plant IN
    SELECT DISTINCT ON (public.plant_name_key(r.species_name)) r.species_name, r.common_name
    FROM public.records AS r
    WHERE r.status = 'published'
      AND r.species_slug IS NULL
      AND btrim(r.species_name) <> ''
    ORDER BY public.plant_name_key(r.species_name), r.recorded_at, r.id
  LOOP
    species_id := public.species_for_plant_name(plant.species_name, plant.common_name);
    IF species_id IS NOT NULL THEN
      PERFORM public.link_records_to_species(species_id);
    END IF;
  END LOOP;
END
$$;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
