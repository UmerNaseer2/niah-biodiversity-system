-- Item 4: what each role can read and change, checked by the database itself, so the rules hold
-- even if someone skips the website and the app and calls the API directly. Run it after 001 to
-- 005. The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing
-- from it is kept. It's safe to run again: every policy, view and trigger is dropped and made
-- again, so a second run ends up the same as the first.
-- supabase/tests/roles.test.js checks every rule in here as each kind of user.

-- 1. Roles. Researchers get a role of their own. For now they see what the public sees, until
-- SFC decides what else they can see.
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('visitor', 'researcher', 'botanist', 'conservation_officer', 'admin'));

-- 2. Profiles. Signed in users read their own profile (003), and admins read everyone's. Only
-- admins change roles, and never their own, so the last admin can't lock everyone out by
-- mistake. Nothing else in a profile can be changed through the API.
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (role) ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS "Admins read every profile" ON public.profiles;
CREATE POLICY "Admins read every profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Admins change the roles of other users" ON public.profiles;
CREATE POLICY "Admins change the roles of other users"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']) AND id <> auth.uid())
  WITH CHECK (public.has_any_role(ARRAY['admin']) AND id <> auth.uid());

-- 3. Species. Officers and admins add, edit and delete species (the policy from 004). An edit or
-- a delete through the API has to find the row first, so they need to read the table too. The
-- policy from 004 still only shows rows to officers and admins. Everyone else reads
-- species_public.
GRANT SELECT ON TABLE public.species TO authenticated;

-- 4. Records. Officers and admins read, review and delete every record. Field staff read the
-- records they uploaded, and a botanist can fix their own record while it waits for review.
-- Nobody else reads the records table. The public reads records_public (below).
REVOKE UPDATE ON TABLE public.records FROM authenticated;
GRANT SELECT, DELETE ON TABLE public.records TO authenticated;
GRANT UPDATE (species_name, common_name, species_slug, height_m, condition, notes, gps,
  photo_count, recorded_at, status, review_notes) ON TABLE public.records TO authenticated;

DROP POLICY IF EXISTS "Officers and admins read every record" ON public.records;
CREATE POLICY "Officers and admins read every record"
  ON public.records FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

DROP POLICY IF EXISTS "Field staff read the records they uploaded" ON public.records;
CREATE POLICY "Field staff read the records they uploaded"
  ON public.records FOR SELECT
  TO authenticated
  USING (
    submitted_by = auth.uid()
    AND public.has_any_role(ARRAY['botanist', 'conservation_officer', 'admin'])
  );

DROP POLICY IF EXISTS "Botanists edit their own records while they wait" ON public.records;
CREATE POLICY "Botanists edit their own records while they wait"
  ON public.records FOR UPDATE
  TO authenticated
  USING (
    submitted_by = auth.uid()
    AND status = 'waiting'
    AND public.has_any_role(ARRAY['botanist'])
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'waiting'
    AND public.has_any_role(ARRAY['botanist'])
  );

DROP POLICY IF EXISTS "Officers and admins delete records" ON public.records;
CREATE POLICY "Officers and admins delete records"
  ON public.records FOR DELETE
  TO authenticated
  USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

-- 5. Reviews. Changing a record's status or review notes is a review, so only officers and
-- admins can do it, and the server fills in who reviewed it and when. Row Level Security can't
-- compare the new row with the old one, so a trigger does this. A change with nobody signed in
-- (the SQL editor, or the service role key on a server) skips the check.
CREATE OR REPLACE FUNCTION public.fill_in_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
    OR NEW.review_notes IS DISTINCT FROM OLD.review_notes THEN
    IF NOT public.has_any_role(ARRAY['conservation_officer', 'admin']) THEN
      RAISE EXCEPTION 'only officers and admins can review a record' USING ERRCODE = '42501';
    END IF;
    NEW.reviewed_by := (SELECT name FROM public.profiles WHERE id = auth.uid());
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS fill_in_review ON public.records;
CREATE TRIGGER fill_in_review
  BEFORE UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.fill_in_review();

-- Only the trigger runs it, so nobody can call it through the API.
REVOKE EXECUTE ON FUNCTION public.fill_in_review() FROM PUBLIC, anon, authenticated;

-- 6. Views. Nothing uses the observations view from 001. records_public and records_staff cover
-- what it was for.
DROP VIEW IF EXISTS public.observations;

-- What the public sees of a published record. A plant only shows its exact spot if its species
-- is in the species table, is Least Concern (LC) or Near Threatened (NT) on the IUCN Red List,
-- isn't protected in Sarawak and isn't marked rough area only. Every other plant, including DD
-- and NE species and names the species table doesn't have, only shows the middle of its 0.004
-- degree grid square (about 440 m at Niah). It's the same square the website draws
-- (web/src/lib/geo.ts). The notes and the name of whoever recorded the plant stay with the staff.
-- 007 adds the rough area only switch too, but it's added here as well, so running 006 again
-- after 007 never shows the exact spot of a plant an officer has hidden.
ALTER TABLE public.species ADD COLUMN IF NOT EXISTS rough_area_only BOOLEAN NOT NULL DEFAULT FALSE;

DROP VIEW IF EXISTS public.records_public;
CREATE VIEW public.records_public
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  r.id,
  r.tag_code,
  r.species_slug,
  r.species_name,
  r.common_name,
  r.height_m,
  r.condition,
  r.photo_count,
  r.recorded_at,
  r.status,
  CASE
    WHEN r.gps IS NULL THEN NULL
    WHEN s.id IS NOT NULL
      AND NOT s.sarawak_protected
      AND NOT s.rough_area_only
      AND s.iucn_code IN ('LC', 'NT') THEN
      jsonb_build_object(
        'lat', r.gps -> 'lat',
        'lng', r.gps -> 'lng',
        'accuracyM', r.gps -> 'accuracyM'
      )
    ELSE jsonb_build_object(
      'lat', round((floor((r.gps ->> 'lat')::numeric / 0.004) + 0.5) * 0.004, 3),
      'lng', round((floor((r.gps ->> 'lng')::numeric / 0.004) + 0.5) * 0.004, 3),
      'accuracyM', 440
    )
  END AS gps
FROM public.records AS r
LEFT JOIN public.species AS s ON s.id = r.species_slug
WHERE r.status = 'published';

-- The staff views read as whoever is asking (security_invoker), so the Row Level Security on
-- the tables applies to them as well.
DROP VIEW IF EXISTS public.species_staff;
CREATE VIEW public.species_staff
WITH (security_invoker = true)
AS
SELECT s.*
FROM public.species AS s
WHERE public.has_any_role(ARRAY['conservation_officer', 'admin']);

DROP VIEW IF EXISTS public.records_staff;
CREATE VIEW public.records_staff
WITH (security_invoker = true)
AS
SELECT r.*
FROM public.records AS r
WHERE public.has_any_role(ARRAY['conservation_officer', 'admin']);

-- Every view is only for reading, so the API only gets SELECT on them.
REVOKE ALL ON TABLE public.species_public, public.records_public, public.species_staff,
  public.records_staff FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.species_public, public.records_public TO anon, authenticated;
GRANT SELECT ON TABLE public.species_staff, public.records_staff TO authenticated;

-- 7. Sensor nodes. Officers and admins see the readings, and only admins add, change or remove
-- a node for now. In Sprint #2 each ESP32 gets its own login that can only add readings
-- (item 28).
DROP POLICY IF EXISTS "Allow read access to IoT telemetry" ON public.iot_nodes;
DROP POLICY IF EXISTS "Allow update access to IoT nodes" ON public.iot_nodes;
REVOKE ALL ON TABLE public.iot_nodes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.iot_nodes TO authenticated;

DROP POLICY IF EXISTS "Officers and admins read sensor nodes" ON public.iot_nodes;
CREATE POLICY "Officers and admins read sensor nodes"
  ON public.iot_nodes FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

DROP POLICY IF EXISTS "Admins manage sensor nodes" ON public.iot_nodes;
CREATE POLICY "Admins manage sensor nodes"
  ON public.iot_nodes FOR ALL
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']))
  WITH CHECK (public.has_any_role(ARRAY['admin']));

-- 8. Species photos. The botanical-photos bucket from 001 stays public, because the plant pages
-- show these photos. Only officers and admins, who look after the species, can add, replace or
-- delete one, and it takes the same images up to 10 MB as record-photos. Record photos never go
-- in here.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
WHERE id = 'botanical-photos';

DROP POLICY IF EXISTS "Authenticated upload botanical photos" ON storage.objects;

DROP POLICY IF EXISTS "Officers and admins upload species photos" ON storage.objects;
CREATE POLICY "Officers and admins upload species photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'botanical-photos'
    AND public.has_any_role(ARRAY['conservation_officer', 'admin'])
  );

DROP POLICY IF EXISTS "Officers and admins replace species photos" ON storage.objects;
CREATE POLICY "Officers and admins replace species photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'botanical-photos'
    AND public.has_any_role(ARRAY['conservation_officer', 'admin'])
  )
  WITH CHECK (
    bucket_id = 'botanical-photos'
    AND public.has_any_role(ARRAY['conservation_officer', 'admin'])
  );

DROP POLICY IF EXISTS "Officers and admins delete species photos" ON storage.objects;
CREATE POLICY "Officers and admins delete species photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'botanical-photos'
    AND public.has_any_role(ARRAY['conservation_officer', 'admin'])
  );

-- Tells the API to pick up the changes straight away.
NOTIFY pgrst, 'reload schema';
