-- Item 18: photos on the website. Checks what goes in species.photos, lets the public plant pages
-- read the photos and lets officers and admins delete record photos. Run it after 001 to 008.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/photos.test.js checks it.

-- 008 has to be there first, and 006 and 007 before that.
DO $$
BEGIN
  IF to_regprocedure('public.set_record_updated_at()') IS NULL THEN
    RAISE EXCEPTION '009 needs 008_record_edits.sql to be run first';
  END IF;
END
$$;

-- 1. What a photo looks like. species.photos has been a list since 001, but nothing checked it.
-- Each photo is either an outside link (url), like the Unsplash placeholders, or a file in the
-- botanical-photos bucket (path), which is what the website uploads. A path has to be in the
-- folder for that species, so one species can't point at another species' photo. The checks run
-- one at a time on purpose, because Postgres doesn't promise to check the parts of an OR in order.
CREATE OR REPLACE FUNCTION public.species_photos_ok(species_id text, photos jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  photo jsonb;
  key text;
  paths text[] := ARRAY[]::text[];
  primaries integer := 0;
BEGIN
  IF photos IS NULL OR jsonb_typeof(photos) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(photos) > 12 THEN
    RETURN false;
  END IF;

  FOR photo IN SELECT value FROM jsonb_array_elements(photos) LOOP
    IF jsonb_typeof(photo) <> 'object' THEN
      RETURN false;
    END IF;

    FOR key IN SELECT jsonb_object_keys(photo) LOOP
      IF key NOT IN ('url', 'path', 'caption', 'credit', 'isPrimary') THEN
        RETURN false;
      END IF;
    END LOOP;

    -- Exactly one of url and path.
    IF (photo ? 'url') = (photo ? 'path') THEN
      RETURN false;
    END IF;

    IF photo ? 'url' THEN
      IF jsonb_typeof(photo -> 'url') <> 'string' THEN
        RETURN false;
      END IF;
      IF length(photo ->> 'url') > 500 OR photo ->> 'url' !~ '^https://[^\s"<>]+$' THEN
        RETURN false;
      END IF;
    ELSE
      IF jsonb_typeof(photo -> 'path') <> 'string' THEN
        RETURN false;
      END IF;
      IF photo ->> 'path' !~
        '^species/[a-z0-9-]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
      THEN
        RETURN false;
      END IF;
      IF split_part(photo ->> 'path', '/', 2) <> species_id THEN
        RETURN false;
      END IF;
      IF (photo ->> 'path') = ANY (paths) THEN
        RETURN false;
      END IF;
      paths := paths || (photo ->> 'path');
    END IF;

    IF NOT photo ? 'caption' OR jsonb_typeof(photo -> 'caption') <> 'string' THEN
      RETURN false;
    END IF;
    IF btrim(photo ->> 'caption') = '' OR length(photo ->> 'caption') > 300 THEN
      RETURN false;
    END IF;

    IF NOT photo ? 'credit' OR jsonb_typeof(photo -> 'credit') <> 'string' THEN
      RETURN false;
    END IF;
    IF btrim(photo ->> 'credit') = '' OR length(photo ->> 'credit') > 200 THEN
      RETURN false;
    END IF;

    IF photo ? 'isPrimary' THEN
      IF jsonb_typeof(photo -> 'isPrimary') <> 'boolean' THEN
        RETURN false;
      END IF;
      IF (photo ->> 'isPrimary')::boolean THEN
        primaries := primaries + 1;
      END IF;
    END IF;
  END LOOP;

  -- At most one main photo.
  RETURN primaries <= 1;
END
$$;

ALTER TABLE public.species DROP CONSTRAINT IF EXISTS species_photos_check;
ALTER TABLE public.species
  ADD CONSTRAINT species_photos_check CHECK (public.species_photos_ok(id, photos));

-- 2. The public plant pages read species_public, which has no photos. They go in a view of their
-- own rather than on the end of species_public, because running 007 again would then fail
-- (Postgres can't take a column off a view it's replacing). Like species_public it reads as its
-- owner (security_invoker = false), so visitors see the photos without reading the table. Photos
-- are public anyway, since the bucket is.
CREATE OR REPLACE VIEW public.species_photos_public
WITH (security_invoker = false)
AS
SELECT
  id,
  slug,
  photos
FROM public.species;

REVOKE ALL ON TABLE public.species_photos_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.species_photos_public TO anon, authenticated;

-- Who can change species photos isn't changed here. Officers and admins edit species (004 and
-- 006), and 006 lets only them upload to and delete from botanical-photos.

-- 3. Record photos. 005 left the private record-photos bucket with no way to delete a photo, so a
-- deleted record (item 17) kept its photos. Officers and admins can now delete them, and the
-- website deletes a record's photos along with the record. Nobody can replace one yet.
DROP POLICY IF EXISTS "Officers and admins delete record photos" ON storage.objects;
CREATE POLICY "Officers and admins delete record photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'record-photos'
    AND public.has_any_role(ARRAY['conservation_officer', 'admin'])
  );

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
