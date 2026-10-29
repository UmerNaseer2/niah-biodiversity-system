-- Item 17: the website's edit and delete of records. Adds updated_at to records. Run it after 001
-- to 007.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again. Running 006 again undoes parts of it, so run 008 again
-- after it.
-- supabase/tests/roles.test.js checks it, in "officers and admins edit records".

-- 007 has to be there first, and 006 before that, because the view below builds on it.
DO $$
BEGIN
  IF to_regprocedure('public.set_species_updated_at()') IS NULL THEN
    RAISE EXCEPTION '008 needs 007_species_fixes.sql to be run first';
  END IF;
END
$$;

-- 1. updated_at. A record only had the time it was uploaded. Editing one sets updated_at to the
-- time of the change by itself, so the website's edit form doesn't send it. Records that were
-- never edited show the time they were added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.records ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    UPDATE public.records SET updated_at = uploaded_at;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_record_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- tag_code is a generated column, which Postgres fills in after this trigger runs, so it's left
  -- out of the comparison. Otherwise every save would look like a change.
  IF (to_jsonb(NEW) - 'tag_code') IS DISTINCT FROM (to_jsonb(OLD) - 'tag_code')
    AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS set_record_updated_at ON public.records;
CREATE TRIGGER set_record_updated_at
  BEFORE UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

-- Only the trigger runs it, so nobody can call it through the API.
REVOKE EXECUTE ON FUNCTION public.set_record_updated_at() FROM PUBLIC, anon, authenticated;

-- Who can edit isn't changed here. Officers and admins already change any record (the policy from
-- 004), limited to the columns 006 allows, so the tag, who uploaded it and when stay as they were.
-- A botanist only fixes their own record while it waits (006).

-- 2. records_staff reads r.*, which Postgres turns into the list of columns when the view is
-- made, so it has to be made again to show updated_at.
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
