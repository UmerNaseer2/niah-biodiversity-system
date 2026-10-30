-- Keeps a row for every reports CSV downloaded with the exact spots of threatened and protected
-- plants: who downloaded it, when, which records the file covered and how many exact spots it
-- had. The website adds the row before it sends the file, and doesn't send the file if it can't.
-- Run it after 001 to 010.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/downloads.test.js checks it.

-- 010 has to be there first, and 001 to 009 before that.
DO $$
BEGIN
  IF to_regclass('public.deleted_records') IS NULL THEN
    RAISE EXCEPTION '011 needs 010_deleted_records.sql to be run first';
  END IF;
END
$$;

-- 1. The downloads. The name is kept as well as the ID, so the list still says who it was after
-- their account is deleted. No coordinates or record IDs are kept, only the filters and counts.
CREATE TABLE IF NOT EXISTS public.exact_location_downloads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  downloaded_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  downloaded_by_name text NOT NULL CHECK (downloaded_by_name <> ''),
  -- The filters on the reports page: published only or waiting too, and the days it covered
  scope text NOT NULL CHECK (scope IN ('published', 'all')),
  from_day date,
  to_day date,
  -- Rows in the file, and how many of them had an exact spot only because it was asked for
  row_count integer NOT NULL CHECK (row_count >= 0),
  exact_count integer NOT NULL CHECK (exact_count >= 0 AND exact_count <= row_count),
  CHECK (from_day IS NULL OR to_day IS NULL OR from_day <= to_day)
);

CREATE INDEX IF NOT EXISTS exact_location_downloads_downloaded_at
  ON public.exact_location_downloads (downloaded_at DESC);

ALTER TABLE public.exact_location_downloads ENABLE ROW LEVEL SECURITY;

-- Officers and admins add a row for their own download, and only admins read the list. Nobody
-- changes or removes a row through the API. Only the filters and counts can be sent, because the
-- trigger below fills in who and when.
REVOKE ALL ON TABLE public.exact_location_downloads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.exact_location_downloads TO authenticated;
GRANT INSERT (scope, from_day, to_day, row_count, exact_count)
  ON TABLE public.exact_location_downloads TO authenticated;

DROP POLICY IF EXISTS "Officers and admins record their downloads"
  ON public.exact_location_downloads;
CREATE POLICY "Officers and admins record their downloads"
  ON public.exact_location_downloads FOR INSERT
  TO authenticated
  WITH CHECK (
    downloaded_by = (SELECT auth.uid())
    AND public.has_any_role(ARRAY['conservation_officer', 'admin'])
  );

DROP POLICY IF EXISTS "Admins read downloads" ON public.exact_location_downloads;
CREATE POLICY "Admins read downloads"
  ON public.exact_location_downloads FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']));

-- 2. Fills in who and when, so a row can't say someone else downloaded the file, or that it was
-- at another time. It runs as the owner so it can read the name from profiles. Someone in the SQL
-- editor isn't signed in, so a row added there has no name and is turned down.
CREATE OR REPLACE FUNCTION public.fill_exact_location_download()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.downloaded_at := now();
  NEW.downloaded_by := auth.uid();
  NEW.downloaded_by_name := (
    SELECT COALESCE(NULLIF(p.name, ''), p.email)
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS fill_exact_location_download ON public.exact_location_downloads;
CREATE TRIGGER fill_exact_location_download
  BEFORE INSERT ON public.exact_location_downloads
  FOR EACH ROW EXECUTE FUNCTION public.fill_exact_location_download();

-- Only the trigger runs it, so nobody can call it through the API.
REVOKE EXECUTE ON FUNCTION public.fill_exact_location_download()
  FROM PUBLIC, anon, authenticated;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
