-- Keeps the name of each record's photo folder, so the website can still find a record's photos
-- after the account that sent it is deleted.
-- The phone uploads a record's photos to record-photos/<account ID>/<record ID>/ (005). The
-- website found that folder from submitted_by, but submitted_by is emptied when the account is
-- deleted, so the photos couldn't be shown or deleted with the record any more.
-- Run it after 001 to 013.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/photo-folder.test.js checks it.

-- 013 has to be there first, and 001 to 012 before that.
DO $$
BEGIN
  IF to_regclass('public.record_history') IS NULL THEN
    RAISE EXCEPTION '014 needs 013_edit_history.sql to be run first';
  END IF;
END
$$;

-- 1. The folder. It isn't linked to profiles, so it stays when the account is deleted. Signed in
-- users can't fill it in or change it, because the grants from 005 and 006 only name other
-- columns. Records added in the Table Editor with nobody in submitted_by have no folder, the same
-- as before.
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS photo_folder uuid;

-- 2. A new record's folder is the account that sent it. The trigger runs after fill_in_new_record
-- from 005 (triggers run in name order), so submitted_by is already the person signed in.
CREATE OR REPLACE FUNCTION public.keep_photo_folder()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.photo_folder := NEW.submitted_by;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS keep_photo_folder ON public.records;
CREATE TRIGGER keep_photo_folder
  BEFORE INSERT ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.keep_photo_folder();

-- Only the trigger runs it, so nobody can call it through the API.
REVOKE EXECUTE ON FUNCTION public.keep_photo_folder() FROM PUBLIC, anon, authenticated;

-- 3. Records from before this file get the folder from submitted_by. The triggers from 008 and
-- 013 are off while it's filled in, so the records don't look edited (an edit page that's open
-- would say someone saved it first) and the history doesn't get a row for every record. They're
-- turned back on straight after. A record whose account was deleted before this file was run has
-- nothing left to say where its photos are, so it stays empty.
ALTER TABLE public.records
  DISABLE TRIGGER set_record_updated_at,
  DISABLE TRIGGER remember_record_change;

UPDATE public.records
SET photo_folder = submitted_by
WHERE photo_folder IS NULL
  AND submitted_by IS NOT NULL;

ALTER TABLE public.records
  ENABLE TRIGGER set_record_updated_at,
  ENABLE TRIGGER remember_record_change;

-- 4. records_staff reads r.*, which Postgres turns into the list of columns when the view is made
-- (see 008), so it has to be made again to show the folder. records_public names its columns, so
-- the public never sees it.
CREATE OR REPLACE VIEW public.records_staff
WITH (security_invoker = true)
AS
SELECT r.*
FROM public.records AS r
WHERE public.has_any_role(ARRAY['conservation_officer', 'admin']);

REVOKE ALL ON TABLE public.records_staff FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.records_staff TO authenticated;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
