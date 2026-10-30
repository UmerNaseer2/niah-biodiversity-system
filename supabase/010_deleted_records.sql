-- Stops a phone uploading a record again after an officer deleted it. Keeps the ID of every
-- deleted record, with who deleted it and when, and turns down an upload with one of those IDs.
-- Run it after 001 to 009.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/sync.test.js checks it, in "a record an officer deleted".

-- 009 has to be there first, and 001 to 008 before that.
DO $$
BEGIN
  IF to_regclass('public.species_photos_public') IS NULL THEN
    RAISE EXCEPTION '010 needs 009_species_photos.sql to be run first';
  END IF;
END
$$;

-- 1. The deleted records. Only the ID is kept, not the species, the notes or where it was, so
-- nothing about the plant stays behind after a delete.
CREATE TABLE IF NOT EXISTS public.deleted_records (
  id uuid PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;

-- Officers and admins can see what was deleted. Nobody changes it through the API, only the
-- trigger below adds to it.
REVOKE ALL ON TABLE public.deleted_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.deleted_records TO authenticated;

DROP POLICY IF EXISTS "Officers and admins read deleted records" ON public.deleted_records;
CREATE POLICY "Officers and admins read deleted records"
  ON public.deleted_records FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

-- 2. Deleting a record adds its ID. It runs as the owner, because the officer deleting the record
-- can't add to deleted_records themselves.
CREATE OR REPLACE FUNCTION public.remember_deleted_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.deleted_records (id, deleted_by)
  VALUES (OLD.id, auth.uid())
  ON CONFLICT (id) DO NOTHING;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS remember_deleted_record ON public.records;
CREATE TRIGGER remember_deleted_record
  AFTER DELETE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.remember_deleted_record();

-- 3. An upload with a deleted record's ID is turned down. The error looks like the one Postgres
-- gives for an ID that's taken, because that's what it is, but it names deleted_records_pkey
-- instead of records_pkey. That's how the phone tells "an officer deleted this" apart from "this
-- went up before" (docs/sync-design.md).
-- Someone in the SQL editor (nobody signed in) can still put a deleted record back on purpose, and
-- then it comes off the list, so the phone that recorded it is told it's synced again.
CREATE OR REPLACE FUNCTION public.check_deleted_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    DELETE FROM public.deleted_records WHERE id = NEW.id;
  ELSIF EXISTS (SELECT 1 FROM public.deleted_records WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'duplicate key value violates unique constraint "deleted_records_pkey"'
      USING ERRCODE = 'unique_violation',
        CONSTRAINT = 'deleted_records_pkey',
        DETAIL = 'An officer deleted this record, so it can''t be uploaded again.';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS check_deleted_record ON public.records;
CREATE TRIGGER check_deleted_record
  BEFORE INSERT ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.check_deleted_record();

-- Only the triggers run these, so nobody can call them through the API.
REVOKE EXECUTE ON FUNCTION public.remember_deleted_record() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_deleted_record() FROM PUBLIC, anon, authenticated;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
