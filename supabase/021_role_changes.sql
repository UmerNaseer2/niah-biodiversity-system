-- Keeps a list of every role change, with who made it and when, and makes sure administrators
-- can't remove each other at the same moment and leave nobody. Only admins can read the list, and
-- nobody can change it. It keeps a copy of the person's email and name, so a line still makes
-- sense after their account is deleted.
-- Run it after 001 to 017, 019 and 020.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again, and the list stays as it is.
-- supabase/tests/role-changes.test.js checks it.

-- 020 has to be there first. It adds no new table, so this looks for what it changed in the policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Uploaders and officers see record photos'
      AND qual LIKE '%botanist%'
  ) THEN
    RAISE EXCEPTION '021 needs 020_record_photo_access.sql to be run first';
  END IF;
END
$$;

-- 1. The list. There's no link to the account on purpose, so a line outlives it.
CREATE TABLE IF NOT EXISTS public.role_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  changed_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  user_name text NOT NULL,
  old_role text NOT NULL,
  -- Empty when the account was deleted
  new_role text,
  -- Empty when someone changed it in the SQL editor, or Supabase Auth deleted the account
  changed_by uuid,
  changed_by_name text
);

ALTER TABLE public.role_changes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.role_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.role_changes TO authenticated;

DROP POLICY IF EXISTS "Admins read role changes" ON public.role_changes;
CREATE POLICY "Admins read role changes"
  ON public.role_changes FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']));

-- 2. Stops the last administrator going. Only one of these runs at a time, because of the lock, so
-- the second of two admins acting together waits for the first, then finds out it's no longer an
-- admin. Row Level Security can't catch that, since it looked before the first one finished. Each
-- line here reads the database afresh. With nobody signed in, this is the SQL editor or Supabase
-- Auth, which stay open so there's always a way back in.
CREATE OR REPLACE FUNCTION public.keep_one_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  who uuid := auth.uid();
BEGIN
  IF who IS NOT NULL
    AND OLD.role = 'admin'
    AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'admin') THEN
    PERFORM pg_advisory_xact_lock(hashtext('public.keep_one_admin'));
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles AS p WHERE p.id = who AND p.role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Only an administrator can take away an administrator''s role'
        USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles AS p WHERE p.id <> OLD.id AND p.role = 'admin'
    ) THEN
      RAISE EXCEPTION 'This would leave nobody as an administrator';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS keep_one_admin ON public.profiles;
CREATE TRIGGER keep_one_admin
  BEFORE UPDATE OF role OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.keep_one_admin();

-- 3. Writes the line. It takes the email and name from the profile, because when an account is
-- deleted the row in auth.users has already gone by the time this runs.
CREATE OR REPLACE FUNCTION public.remember_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  who uuid;
  who_name text;
  now_role text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
      RETURN NULL;
    END IF;
    now_role := NEW.role;
  END IF;
  SELECT p.id, COALESCE(NULLIF(p.name, ''), p.email) INTO who, who_name
  FROM public.profiles AS p
  WHERE p.id = auth.uid();
  INSERT INTO public.role_changes (
    user_id, user_email, user_name, old_role, new_role, changed_by, changed_by_name
  )
  VALUES (OLD.id, OLD.email, OLD.name, OLD.role, now_role, who, who_name);
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS remember_role_change ON public.profiles;
CREATE TRIGGER remember_role_change
  AFTER UPDATE OF role OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.remember_role_change();

REVOKE EXECUTE ON FUNCTION public.keep_one_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remember_role_change() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
