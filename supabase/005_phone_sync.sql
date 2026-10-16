-- Item 3: lets the phone upload its plant records, and sets up Storage for record photos.
-- Run it once, after 001 to 004. The SQL editor runs a whole file as one transaction, so if
-- anything in here fails, nothing from it is kept. Running it a second time stops on the first
-- line with "column tag_code of relation records already exists" and changes nothing.
-- docs/sync-design.md explains how the phone uses all of this.

-- The tag code printed on the plant, worked out from the record ID the same way as tagCodeFor()
-- in mobile/src/lib/id.ts. The phone makes the ID, so the server always agrees on the tag.
-- DEFERRABLE makes Postgres check the tag code at the end of the insert, after the ID. So a record
-- that's already on the server always gets the records_pkey error, which tells the phone it went
-- up on an earlier try.
ALTER TABLE public.records
  ADD COLUMN tag_code text
  GENERATED ALWAYS AS ('NNP-' || upper(left(replace(id::text, '-', ''), 6))) STORED;
ALTER TABLE public.records ADD CONSTRAINT records_tag_code_key UNIQUE (tag_code) DEFERRABLE;

-- The phone sends the species name that was picked or typed in, plus the slug when the name is
-- on its species list. The old records get theirs from the species table. The limits are about
-- double what the form on the phone allows.
ALTER TABLE public.records
  ADD COLUMN species_name text,
  ADD COLUMN common_name text;

UPDATE public.records AS r
SET species_name = s.scientific_name,
    common_name = s.common_names[1]
FROM public.species AS s
WHERE s.id = r.species_slug;

ALTER TABLE public.records
  ALTER COLUMN species_name SET NOT NULL,
  ADD CONSTRAINT records_species_name_check
    CHECK (btrim(species_name) <> '' AND char_length(species_name) <= 200),
  ADD CONSTRAINT records_common_name_check CHECK (char_length(common_name) <= 200),
  ADD CONSTRAINT records_notes_check CHECK (char_length(notes) <= 2000);

-- A record no longer needs a slug, so a species the server doesn't have yet can still upload.
-- Deleting a species now keeps its records and only clears the slug, instead of deleting them.
ALTER TABLE public.records ALTER COLUMN species_slug DROP NOT NULL;
ALTER TABLE public.records DROP CONSTRAINT records_species_slug_fkey;
ALTER TABLE public.records
  ADD CONSTRAINT records_species_slug_fkey FOREIGN KEY (species_slug)
    REFERENCES public.species (id) ON DELETE SET NULL;

-- Height is optional on the phone. 001 saved a missing height as 0, which isn't a real height,
-- so any 0 becomes empty.
ALTER TABLE public.records
  ALTER COLUMN height_m DROP DEFAULT,
  ALTER COLUMN height_m DROP NOT NULL;
UPDATE public.records SET height_m = NULL WHERE height_m <= 0;
ALTER TABLE public.records ADD CONSTRAINT records_height_m_check CHECK (height_m > 0);

-- 001 left out "diseased", which the phone has.
ALTER TABLE public.records DROP CONSTRAINT records_condition_check;
ALTER TABLE public.records
  ADD CONSTRAINT records_condition_check
    CHECK (condition IN ('healthy', 'damaged', 'diseased', 'dead')),
  ADD CONSTRAINT records_photo_count_check CHECK (photo_count >= 0),
  ALTER COLUMN recorded_at SET NOT NULL;

-- The location is lat, lng and accuracyM (in metres) as numbers, plus capturedAt, the time of the
-- GPS reading. The seed records don't have capturedAt, so it's optional. gps can still be empty,
-- like in 001, because the table on the phone allows a record without a location (the form needs
-- one since item 8). Each step is its own WHEN because Postgres only promises to check a CASE in
-- order, and the later steps would throw an error instead of failing the check if gps wasn't an
-- object with numbers in it.
ALTER TABLE public.records ADD CONSTRAINT records_gps_check CHECK (
  CASE
    WHEN gps IS NULL THEN true
    WHEN jsonb_typeof(gps) <> 'object' THEN false
    WHEN gps - ARRAY['lat', 'lng', 'accuracyM', 'capturedAt'] <> '{}'::jsonb
      OR jsonb_typeof(gps -> 'lat') IS DISTINCT FROM 'number'
      OR jsonb_typeof(gps -> 'lng') IS DISTINCT FROM 'number'
      OR jsonb_typeof(gps -> 'accuracyM') IS DISTINCT FROM 'number'
      THEN false
    WHEN gps -> 'capturedAt' IS NOT NULL
      AND (jsonb_typeof(gps -> 'capturedAt') <> 'string'
        OR char_length(gps ->> 'capturedAt') > 40)
      THEN false
    ELSE (gps ->> 'lat')::numeric BETWEEN -90 AND 90
      AND (gps ->> 'lng')::numeric BETWEEN -180 AND 180
      AND (gps ->> 'accuracyM')::numeric >= 0
  END
);

-- Who uploaded the record and when it got to the server. The server fills in both.
ALTER TABLE public.records
  ADD COLUMN submitted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN uploaded_at timestamptz NOT NULL DEFAULT now();

-- Runs before each new record is saved. A record that comes in through the API (so someone is
-- signed in) goes in the uploader's name from their profile, whatever the phone sent. A slug the
-- species table doesn't have (the phone's list can be newer) is cleared so the upload doesn't
-- fail, and the species name stays. A record with no species name gets it from the species
-- table, so 002 still runs if someone runs it again.
CREATE FUNCTION public.fill_in_new_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.submitted_by := auth.uid();
    NEW.recorded_by := (SELECT name FROM public.profiles WHERE id = auth.uid());
  END IF;
  IF NEW.species_slug IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.species WHERE id = NEW.species_slug) THEN
    NEW.species_slug := NULL;
  END IF;
  IF NEW.species_name IS NULL THEN
    NEW.species_name := (SELECT scientific_name FROM public.species WHERE id = NEW.species_slug);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER fill_in_new_record
  BEFORE INSERT ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.fill_in_new_record();

-- Only the trigger runs it, so nobody can call it through the API.
REVOKE EXECUTE ON FUNCTION public.fill_in_new_record() FROM PUBLIC, anon, authenticated;

-- Signed in users can only fill in these columns. The status, who recorded it, the review and
-- the upload details are left to their defaults and the trigger.
REVOKE INSERT ON TABLE public.records FROM authenticated;
GRANT INSERT (id, species_name, common_name, species_slug, height_m, condition, notes, gps,
  photo_count, recorded_at) ON TABLE public.records TO authenticated;

-- Replaces the policy from 004. Field staff upload records in their own name, and a new record
-- always waits for an officer to review it.
DROP POLICY "Botanists can submit records" ON public.records;
CREATE POLICY "Field staff upload their own records"
  ON public.records FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(ARRAY['botanist', 'conservation_officer', 'admin'])
    AND submitted_by = auth.uid()
    AND status = 'waiting'
    AND review_notes IS NULL
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

-- Storage for record photos (item 11 takes them). The bucket is private, because a photo can show
-- where a plant is. Each user uploads into a folder named after their user ID, like
-- "<user id>/<record id>/1.jpg", and only they and the officers can see the photos. Nobody can
-- replace or delete a photo yet.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'record-photos',
  'record-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Field staff upload record photos to their own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'record-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.has_any_role(ARRAY['botanist', 'conservation_officer', 'admin'])
  );

CREATE POLICY "Uploaders and officers see record photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'record-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_any_role(ARRAY['conservation_officer', 'admin'])
    )
  );

-- Tells the API to pick up the new columns straight away.
NOTIFY pgrst, 'reload schema';
