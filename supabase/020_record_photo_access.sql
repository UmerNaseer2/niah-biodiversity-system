-- Closes two small gaps in who can reach what. Someone who loses their field staff role also loses
-- their own record photos, the same way they already lose their records. And people who aren't
-- signed in can't call the helper functions any more, because nothing they do needs them.
-- Run it after 001 to 017 and 019.
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/record-photo-access.test.js checks it.

-- 019 has to be there first. It adds no new table, so this looks for what it changed in the view.
DO $$
BEGIN
  IF to_regclass('public.records_public') IS NULL
    OR pg_get_viewdef('public.records_public'::regclass) !~ 'shown\.exact' THEN
    RAISE EXCEPTION '020 needs 019_public_record_details.sql to be run first';
  END IF;
END
$$;

-- 1. A botanist sees the photos in their own folder for as long as they're a botanist. Officers and
-- admins still see all of them, and their own folder is covered by that.
DROP POLICY IF EXISTS "Uploaders and officers see record photos" ON storage.objects;

CREATE POLICY "Uploaders and officers see record photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'record-photos'
    AND (
      (
        (storage.foldername(name))[1] = auth.uid()::text
        AND public.has_any_role(ARRAY['botanist'])
      )
      OR public.has_any_role(ARRAY['conservation_officer', 'admin'])
    )
  );

-- 2. These two only run as triggers, and triggers don't need this permission to fire.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_species_slug() FROM PUBLIC, anon, authenticated;

-- 3. The policies and the check on species.photos run these as the signed in user, so that user
-- has to keep them. No policy that uses them applies to people who aren't signed in.
REVOKE EXECUTE ON FUNCTION public.has_any_role(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_role(text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.species_photos_ok(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.species_photos_ok(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
