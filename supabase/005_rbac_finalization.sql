-- Item 4 finalization: close the remaining broad IoT and storage policies.
-- Apply after 004_security_hardening.sql.

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

DROP POLICY IF EXISTS "Allow read access to IoT telemetry" ON public.iot_nodes;
DROP POLICY IF EXISTS "Allow update access to IoT nodes" ON public.iot_nodes;

CREATE POLICY "Staff can read IoT telemetry"
    ON public.iot_nodes FOR SELECT
    TO authenticated
    USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

CREATE POLICY "Officers and admins manage IoT nodes"
    ON public.iot_nodes FOR ALL
    TO authenticated
    USING (public.has_any_role(ARRAY['conservation_officer', 'admin']))
    WITH CHECK (public.has_any_role(ARRAY['conservation_officer', 'admin']));

DROP POLICY IF EXISTS "Authenticated upload botanical photos" ON storage.objects;

CREATE POLICY "Field staff upload botanical photos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'botanical-photos'
      AND public.has_any_role(
        ARRAY['botanist', 'conservation_officer', 'admin']
      )
    );
