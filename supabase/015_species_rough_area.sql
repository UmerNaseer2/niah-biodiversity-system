-- Keeps rough_area_only on for every threatened or protected species.
-- The species form has always saved these species as rough area only (007), so they stay hidden
-- if their status changes later, until an officer decides. The sample species and any species
-- added another way still had it off, so the first save on the edit page wrote a history line
-- saying the public map changed. It didn't, because the public rule hides these species anyway.
-- Run it after 001 to 014.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/species-rough.test.js checks it.

-- 014 has to be there first, and 001 to 013 before that.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'photo_folder'
  ) THEN
    RAISE EXCEPTION '015 needs 014_photo_folder.sql to be run first';
  END IF;
END
$$;

-- 1. A threatened or protected species is always rough area only. It's the same rule as lockReason
-- in web/src/lib/species-form.ts. A species that stops being threatened keeps the switch on until
-- someone turns it off, and the trigger lets them. An empty value is left for the NOT NULL check
-- to turn down, the same as before.
CREATE OR REPLACE FUNCTION public.keep_species_rough()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT NEW.rough_area_only AND (NEW.sarawak_protected OR NEW.iucn_code NOT IN ('LC', 'NT')) THEN
    NEW.rough_area_only := true;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS keep_species_rough ON public.species;
CREATE TRIGGER keep_species_rough
  BEFORE INSERT OR UPDATE ON public.species
  FOR EACH ROW EXECUTE FUNCTION public.keep_species_rough();

-- Only the trigger runs it, so nobody can call it through the API.
REVOKE EXECUTE ON FUNCTION public.keep_species_rough() FROM PUBLIC, anon, authenticated;

-- 2. The species that already break the rule. Nobody edited these and the public sees the same as
-- before, so they don't get a history line or a new updated_at. It's all in one block so the two
-- triggers can't stay switched off if the update fails.
DO $$
BEGIN
  ALTER TABLE public.species DISABLE TRIGGER remember_species_change;
  ALTER TABLE public.species DISABLE TRIGGER set_species_updated_at;
  UPDATE public.species
  SET rough_area_only = true
  WHERE NOT rough_area_only AND (sarawak_protected OR iucn_code NOT IN ('LC', 'NT'));
  ALTER TABLE public.species ENABLE TRIGGER remember_species_change;
  ALTER TABLE public.species ENABLE TRIGGER set_species_updated_at;
END
$$;

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
