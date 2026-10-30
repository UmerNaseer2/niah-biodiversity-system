-- Keeps a history of every change to a record or a species: who saved it, when, and what each
-- changed column was before and after. The record and species edit pages on the website show it.
-- Run it after 001 to 012.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/history.test.js checks it.

-- 012 has to be there first, and 001 to 011 before that.
DO $$
BEGIN
  IF to_regprocedure('public.report_counts(text, date, date)') IS NULL THEN
    RAISE EXCEPTION '013 needs 012_report_counts.sql to be run first';
  END IF;
END
$$;

-- 1. The history. A row goes when its record or species is deleted, so nothing about a deleted
-- plant stays behind (the same as 010). The name is kept as well as the ID, so the history still
-- says who it was after their account is deleted. A row with no name was saved by someone who
-- wasn't signed in, which means the Table Editor or the SQL editor.
-- changes has a key for each column that changed, like {"condition": {"from": "healthy", "to":
-- "dead"}}. Where a plant is (records.gps, species.coordinates_*) is never copied in here. Its key
-- only says whether there was a spot before and after, like {"gps": {"had": true, "has": true}}.
CREATE TABLE IF NOT EXISTS public.record_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES public.records (id) ON DELETE CASCADE ON UPDATE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  changed_by_name text CHECK (changed_by_name <> ''),
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object' AND changes <> '{}')
);

CREATE TABLE IF NOT EXISTS public.species_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  species_id text NOT NULL REFERENCES public.species (id) ON DELETE CASCADE ON UPDATE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  changed_by_name text CHECK (changed_by_name <> ''),
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object' AND changes <> '{}')
);

CREATE INDEX IF NOT EXISTS record_history_record_id
  ON public.record_history (record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS species_history_species_id
  ON public.species_history (species_id, changed_at DESC);

ALTER TABLE public.record_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.species_history ENABLE ROW LEVEL SECURITY;

-- Officers and admins read it, the same people who can edit. Nobody adds, changes or removes a
-- row through the API, only the triggers below add to it.
REVOKE ALL ON TABLE public.record_history, public.species_history
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.record_history, public.species_history TO authenticated;

DROP POLICY IF EXISTS "Officers and admins read record history" ON public.record_history;
CREATE POLICY "Officers and admins read record history"
  ON public.record_history FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

DROP POLICY IF EXISTS "Officers and admins read species history" ON public.species_history;
CREATE POLICY "Officers and admins read species history"
  ON public.species_history FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

-- 2. What changed between two versions of a row. skipped columns are left out, and hidden ones
-- only say whether they had a value, never what it was. A JSON null and a missing key are the
-- same here, so a column that's empty in both doesn't count as a change.
CREATE OR REPLACE FUNCTION public.changed_columns(
  old_row jsonb,
  new_row jsonb,
  skipped text[],
  hidden text[]
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      n.key,
      CASE
        WHEN n.key = ANY (hidden) THEN jsonb_build_object(
          'had', COALESCE(old_row -> n.key, 'null'::jsonb) <> 'null'::jsonb,
          'has', n.value <> 'null'::jsonb
        )
        ELSE jsonb_build_object('from', COALESCE(old_row -> n.key, 'null'::jsonb), 'to', n.value)
      END
    ),
    '{}'::jsonb
  )
  FROM jsonb_each(new_row) AS n
  WHERE NOT (n.key = ANY (skipped))
    AND COALESCE(old_row -> n.key, 'null'::jsonb) IS DISTINCT FROM n.value;
$$;

-- 3. The triggers. They run after the save, once 006 and 008 have filled in the review and
-- updated_at, and as the owner, because whoever saved the change can't add to the history
-- themselves. A save that didn't change anything doesn't add a row. The name comes from profiles,
-- like 011, and is empty when nobody is signed in.
-- Records leave out updated_at, the tag (worked out from the ID) and reviewed_by and reviewed_at,
-- which 006 fills in from the same person and time as the row.
CREATE OR REPLACE FUNCTION public.remember_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changes jsonb := public.changed_columns(
    to_jsonb(OLD),
    to_jsonb(NEW),
    ARRAY['updated_at', 'tag_code', 'reviewed_by', 'reviewed_at'],
    ARRAY['gps']
  );
  who uuid;
  who_name text;
BEGIN
  IF changes <> '{}'::jsonb THEN
    SELECT p.id, COALESCE(NULLIF(p.name, ''), p.email) INTO who, who_name
    FROM public.profiles AS p
    WHERE p.id = auth.uid();
    INSERT INTO public.record_history (record_id, changed_by, changed_by_name, changes)
    VALUES (NEW.id, who, who_name, changes);
  END IF;
  RETURN NULL;
END
$$;

-- Species leave out updated_at, which 007 fills in. The photos are kept in full, because they're
-- on the public site anyway, so the history can say which photo was added or removed.
CREATE OR REPLACE FUNCTION public.remember_species_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changes jsonb := public.changed_columns(
    to_jsonb(OLD),
    to_jsonb(NEW),
    ARRAY['updated_at'],
    ARRAY['coordinates_rough', 'coordinates_exact']
  );
  who uuid;
  who_name text;
BEGIN
  IF changes <> '{}'::jsonb THEN
    SELECT p.id, COALESCE(NULLIF(p.name, ''), p.email) INTO who, who_name
    FROM public.profiles AS p
    WHERE p.id = auth.uid();
    INSERT INTO public.species_history (species_id, changed_by, changed_by_name, changes)
    VALUES (NEW.id, who, who_name, changes);
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS remember_record_change ON public.records;
CREATE TRIGGER remember_record_change
  AFTER UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.remember_record_change();

DROP TRIGGER IF EXISTS remember_species_change ON public.species;
CREATE TRIGGER remember_species_change
  AFTER UPDATE ON public.species
  FOR EACH ROW EXECUTE FUNCTION public.remember_species_change();

-- Only the triggers use these, so nobody can call them through the API.
REVOKE EXECUTE ON FUNCTION public.changed_columns(jsonb, jsonb, text[], text[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remember_record_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remember_species_change() FROM PUBLIC, anon, authenticated;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
