-- Item 15: let a signed in user read their own row in public.profiles.
-- 001_initial_schema.sql turns on Row Level Security for profiles but has no
-- policy for it, so the web dashboard can't read the user's role and always
-- shows "No access". This only allows reading your own row. Nobody can read
-- other people's profiles, and nobody can change a role from the website.

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Nothing uses the observations view from 001 (records_public and records_staff cover what it
-- was for), so it goes here, in the first file after 001 and 002. 006 drops it too, in case 003
-- was run before this was added.
DROP VIEW IF EXISTS public.observations;
