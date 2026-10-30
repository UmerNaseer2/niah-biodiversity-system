-- Item 4/14/15/16 security hardening.
-- Public API reads use coordinate-free views. Exact coordinates remain available
-- only through explicitly authorized staff views and never through the anon API.

CREATE OR REPLACE FUNCTION public.has_any_role(required_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY(required_roles)
  );
$$;

REVOKE ALL ON TABLE public.species, public.records FROM anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.species TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.records TO authenticated;

DROP POLICY IF EXISTS "Public read access for species" ON public.species;
DROP POLICY IF EXISTS "Staff can manage species" ON public.species;
DROP POLICY IF EXISTS "Public read published records" ON public.records;
DROP POLICY IF EXISTS "Authenticated users view all records" ON public.records;
DROP POLICY IF EXISTS "Botanists can insert records" ON public.records;
DROP POLICY IF EXISTS "Officers can review records" ON public.records;

CREATE POLICY "Officers and admins manage species"
    ON public.species FOR ALL
    TO authenticated
    USING (public.has_any_role(ARRAY['conservation_officer', 'admin']))
    WITH CHECK (public.has_any_role(ARRAY['conservation_officer', 'admin']));

CREATE POLICY "Botanists can submit records"
    ON public.records FOR INSERT
    TO authenticated
    WITH CHECK (
      public.has_any_role(ARRAY['botanist', 'conservation_officer', 'admin'])
    );

CREATE POLICY "Officers and admins review records"
    ON public.records FOR UPDATE
    TO authenticated
    USING (public.has_any_role(ARRAY['conservation_officer', 'admin']))
    WITH CHECK (public.has_any_role(ARRAY['conservation_officer', 'admin']));

CREATE OR REPLACE VIEW public.species_public
WITH (security_invoker = false)
AS
SELECT
  id,
  slug,
  scientific_name,
  authority,
  family,
  common_names,
  iucn_code,
  sarawak_protected,
  newer_name,
  summary,
  about,
  description,
  habitat,
  uses,
  updated_at
FROM public.species;

-- Until 006 runs, every published plant only shows the middle of its 0.004 degree grid square,
-- the same square 006 and the website use. The notes and the name of whoever recorded the plant
-- stay with the staff.
CREATE OR REPLACE VIEW public.records_public
WITH (security_invoker = false)
AS
SELECT
  r.id,
  r.species_slug,
  r.height_m,
  r.condition,
  r.photo_count,
  r.recorded_at,
  r.status,
  CASE
    WHEN r.gps IS NULL THEN NULL
    ELSE jsonb_build_object(
      'lat', round((floor((r.gps ->> 'lat')::numeric / 0.004) + 0.5) * 0.004, 3),
      'lng', round((floor((r.gps ->> 'lng')::numeric / 0.004) + 0.5) * 0.004, 3),
      'accuracyM', 440
    )
  END AS gps
FROM public.records AS r
WHERE r.status = 'published';

CREATE OR REPLACE VIEW public.species_staff
WITH (security_invoker = false)
AS
SELECT s.*
FROM public.species AS s
WHERE public.has_any_role(ARRAY['conservation_officer', 'admin']);

CREATE OR REPLACE VIEW public.records_staff
WITH (security_invoker = false)
AS
SELECT r.*
FROM public.records AS r
WHERE public.has_any_role(ARRAY['conservation_officer', 'admin']);

-- Every view is only for reading, so the API only gets SELECT on them, like in 006.
REVOKE ALL ON TABLE public.species_public, public.records_public, public.species_staff,
  public.records_staff FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.species_public, public.records_public
  TO anon, authenticated;
GRANT SELECT ON public.species_staff, public.records_staff
  TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, role, agency)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        'visitor',
        COALESCE(NEW.raw_user_meta_data->>'agency', 'Sarawak Forestry Corporation')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);
