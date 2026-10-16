-- The parts of a Supabase project our SQL files lean on, so they can run on PGlite.
-- Only the roles, tables, columns and functions we use are here. They copy what Supabase sets up
-- in every new project.

-- The roles the API switches to. anon is the anon key with nobody signed in, authenticated is a
-- signed in user and service_role is the server only key, which skips Row Level Security.
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;

-- Supabase gives the API roles every privilege on new tables, views, functions and sequences in
-- public, and leaves the limiting to Row Level Security and to REVOKE. Our SQL files rely on
-- that, so the tests need it too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Sign ups land here. The real table has many more columns.
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Same as Supabase's auth.uid(): the user ID from the JWT the API puts in the session.
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One row per file. name is the path inside the bucket, like "<user id>/<record id>/1.jpg".
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id, name)
);

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;

-- Same as Supabase's storage.foldername(): the folders in a path, without the file name.
CREATE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END
$$;
