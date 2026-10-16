-- Item 14: the species table, for the website's forms that add, edit and delete species. Run it
-- after 001 to 006. The SQL editor runs a whole file as one transaction, so if anything in here
-- fails, nothing from it is kept. It's safe to run again. Running 002 or 006 again undoes parts of
-- it, so run 007 again after either of them.
-- supabase/tests/species.test.js checks it.

-- 006 has to be there first, because the views below build on it.
DO $$
BEGIN
  IF to_regprocedure('public.fill_in_review()') IS NULL THEN
    RAISE EXCEPTION '007 needs 006_role_based_access.sql to be run first';
  END IF;
END
$$;

-- 1. Rough area only. An officer can hide the exact spot of a species even if it's LC or NT and
-- isn't protected, for example a plant people dig up to sell. The website's species form sets
-- it.
ALTER TABLE public.species ADD COLUMN IF NOT EXISTS rough_area_only BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Views. What the public sees of a published record. A plant only shows its exact spot if its
-- species is in the species table, is Least Concern (LC) or Near Threatened (NT) on the IUCN Red
-- List, isn't protected in Sarawak and isn't marked rough area only. Every other plant, including
-- DD and NE species and names the species table doesn't have, only shows the middle of its 0.004
-- degree grid square (about 440 m at Niah). It's the same square the website draws
-- (web/src/lib/geo.ts). The notes and the name of whoever recorded the plant stay with the staff.
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
  r.recorded_at,
  r.status,
  CASE
    WHEN r.gps IS NULL THEN NULL
    WHEN s.id IS NOT NULL
      AND NOT s.sarawak_protected
      AND NOT s.rough_area_only
      AND s.iucn_code IN ('LC', 'NT') THEN
      jsonb_build_object(
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
WHERE r.status = 'published';

-- The public plant pages show whether a species only shows a rough area, so it goes on the end
-- of species_public.
CREATE OR REPLACE VIEW public.species_public
WITH (security_invoker = false)
AS
SELECT
  id,
  slug,
  scientific_name,
  authority,
  family,
  common_names,
  iucn_code,
  sarawak_protected,
  newer_name,
  summary,
  about,
  description,
  habitat,
  uses,
  updated_at,
  rough_area_only
FROM public.species;

-- species_staff shows every column of the table, and Postgres only lists the columns when a view
-- is made, so it has to be made again to show the new one. It still reads as whoever is asking
-- (security_invoker), so the Row Level Security on the table applies to it as well.
CREATE OR REPLACE VIEW public.species_staff
WITH (security_invoker = true)
AS
SELECT s.*
FROM public.species AS s
WHERE public.has_any_role(ARRAY['conservation_officer', 'admin']);

-- Every view is only for reading, so the API only gets SELECT on them.
REVOKE ALL ON TABLE public.species_public, public.records_public, public.species_staff
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.species_public, public.records_public TO anon, authenticated;
GRANT SELECT ON TABLE public.species_staff TO authenticated;

-- 3. Sample species facts. The IUCN statuses come from each species' Wikipedia page, which cites
-- the Red List, the protection from the Sarawak Forestry Department's list of protected plants,
-- and the names and where they grow from Kew's Plants of the World Online. SFC should still
-- confirm them, and the statuses on the Red List site. Each update only runs if something is
-- different, so running this again leaves updated_at alone.
UPDATE public.species AS s
SET
  common_names = f.common_names,
  iucn_code = f.iucn_code,
  sarawak_protected = f.sarawak_protected,
  summary = f.summary,
  about = f.about,
  description = f.description,
  updated_at = now()
FROM (
  SELECT
    ARRAY['Tapang', 'Tualang'] AS common_names,
    'NT' AS iucn_code,
    TRUE AS sarawak_protected,
    'One of the tallest trees in the tropics, known for the giant honey bee nests on its high '
      || 'branches.' AS summary,
    'Tapang can grow past 80 m, which puts it among the tallest tropical trees in the world. Its '
      || 'smooth, pale trunk is hard for sun bears to climb, which may be why giant honey bees '
      || 'hang their combs from its high branches. It is protected by law in Sarawak.' AS about,
    'A very tall tree in the bean family (Fabaceae) with a smooth, pale trunk and big buttresses. '
      || 'Giant honey bees (Apis dorsata) often nest on its branches.' AS description
) AS f
WHERE s.id = 'koompassia-excelsa'
  AND (s.common_names, s.iucn_code, s.sarawak_protected, s.summary, s.about, s.description)
    IS DISTINCT FROM (f.common_names, f.iucn_code, f.sarawak_protected, f.summary, f.about,
      f.description);

UPDATE public.species AS s
SET
  iucn_code = f.iucn_code,
  sarawak_protected = f.sarawak_protected,
  newer_name = f.newer_name,
  updated_at = now()
FROM (
  SELECT
    'LC' AS iucn_code,
    TRUE AS sarawak_protected,
    'Rubroshorea macrophylla' AS newer_name
) AS f
WHERE s.id = 'shorea-macrophylla'
  AND (s.iucn_code, s.sarawak_protected, s.newer_name)
    IS DISTINCT FROM (f.iucn_code, f.sarawak_protected, f.newer_name);

UPDATE public.species AS s
SET
  iucn_code = f.iucn_code,
  summary = f.summary,
  about = f.about,
  description = f.description,
  habitat = f.habitat,
  updated_at = now()
FROM (
  SELECT
    'VU' AS iucn_code,
    'A keruing tree of low hills near the coast in Borneo and Peninsular Malaysia.' AS summary,
    'Like other keruing trees, it gives an oily resin (minyak keruing) and heavy timber. It was '
      || 'thought to grow only in Sarawak until trees were found in Jerangau Forest Reserve, in '
      || 'Terengganu, in 2004.' AS about,
    'A keruing timber tree. Like other dipterocarps, its fruit has wings that spin as it '
      || 'falls.' AS description,
    'Leached sandy soils on low hills near the coast.' AS habitat
) AS f
WHERE s.id = 'dipterocarpus-sarawakensis'
  AND (s.iucn_code, s.summary, s.about, s.description, s.habitat)
    IS DISTINCT FROM (f.iucn_code, f.summary, f.about, f.description, f.habitat);

UPDATE public.species AS s
SET
  iucn_code = f.iucn_code,
  summary = f.summary,
  about = f.about,
  description = f.description,
  habitat = f.habitat,
  uses = f.uses,
  updated_at = now()
FROM (
  SELECT
    'EN' AS iucn_code,
    'A slipper orchid with mottled leaves and a purple flower with a pouch shaped lip.'
      AS summary,
    'A slipper orchid from the Malay Peninsula, Thailand and Sumatra. Like other slipper '
      || 'orchids, its lip forms a pouch. Insects that slip into it can only climb out past the '
      || 'pollen, which is how the flower gets pollinated.' AS about,
    'A lady slipper orchid. All Paphiopedilum species are on CITES Appendix I, which bans '
      || 'commercial international trade in plants taken from the wild.' AS description,
    'Found from about 200 to 1,300 m above sea level.' AS habitat,
    'Grown as an ornamental orchid. All orchids are protected plants in Sarawak.' AS uses
) AS f
WHERE s.id = 'paphiopedilum-barbatum'
  AND (s.iucn_code, s.summary, s.about, s.description, s.habitat, s.uses)
    IS DISTINCT FROM (f.iucn_code, f.summary, f.about, f.description, f.habitat, f.uses);

-- 4. Sample photos. The six sample species use stock photos from Unsplash, so they say so. SFC
-- will send real ones (item 18). Only the Unsplash photos of the six sample species change.
UPDATE public.species AS s
SET
  photos = f.photos,
  updated_at = now()
FROM (
  SELECT
    sp.id,
    jsonb_agg(
      CASE
        WHEN e.photo ->> 'url' LIKE 'https://images.unsplash.com/%' THEN
          e.photo || jsonb_build_object(
            'caption', 'Placeholder photo from Unsplash until SFC sends real ones. It may not '
              || 'show this species.',
            'credit', 'Unsplash'
          )
        ELSE e.photo
      END
      ORDER BY e.n
    ) AS photos
  FROM public.species AS sp
  CROSS JOIN LATERAL jsonb_array_elements(sp.photos) WITH ORDINALITY AS e(photo, n)
  WHERE sp.id IN (
    'eusideroxylon-zwageri',
    'nepenthes-ampullaria',
    'koompassia-excelsa',
    'shorea-macrophylla',
    'dipterocarpus-sarawakensis',
    'paphiopedilum-barbatum'
  )
  GROUP BY sp.id
) AS f
WHERE s.id = f.id
  AND s.photos IS DISTINCT FROM f.photos;

-- 5. updated_at. Editing a species sets it to the time of the change by itself, so the website's
-- edit form doesn't send it. Saving a species with nothing different leaves it alone, and so does
-- an update that sets updated_at itself, like the fixes above.
CREATE OR REPLACE FUNCTION public.set_species_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS set_species_updated_at ON public.species;
CREATE TRIGGER set_species_updated_at
  BEFORE UPDATE ON public.species
  FOR EACH ROW EXECUTE FUNCTION public.set_species_updated_at();

-- Only the trigger runs it, so nobody can call it through the API.
REVOKE EXECUTE ON FUNCTION public.set_species_updated_at() FROM PUBLIC, anon, authenticated;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
