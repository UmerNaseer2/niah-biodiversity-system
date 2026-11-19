-- An AI second opinion on each record that's waiting for review. Once a record and all its photos
-- are on the server, the database asks the ai-check Edge Function (functions/ai-check) to look at
-- it. The function sends the record's species name, its common name and its photos to Google
-- Gemini and asks three things:
--   * do the species name and the common name mean the same plant?
--   * does the photo show a plant?
--   * does the plant in the photo look like that species?
-- and saves the answers here. The review queue shows them on the record's card as "Looks
-- consistent", "Worth a look" or "Couldn't tell". It never approves or rejects anything, and
-- approving doesn't wait for it, so the officer always decides. Only the names and the photos are
-- sent: no GPS point, notes or names of people, and the function takes the photo details (like the
-- camera's GPS) out of each photo first.
--
-- How it starts:
--   * A new waiting record with no photos is checked straight away, on its names.
--   * A new waiting record with photos waits until its last photo is uploaded. The phone uploads
--     records first and photos after, so a photo upload checks whether it was the last one.
--   * Officers and admins can press "Check again" on the review page, which calls
--     request_ai_check() below. That also covers a photo that never uploaded.
-- The database calls the function with pg_net after the upload is saved, so a slow or broken AI
-- never holds up an upload. Each call carries a new one time token kept in the check's row, which
-- only the function (with the service role) can read, so nobody else can post a result.
--
-- Setting it up on a project (docs/ai-photo-check.md has the steps):
--   1. Run this file, after 031.
--   2. Save the function's address in Vault, under the name ai_check_url:
--        select vault.create_secret(
--          'https://<project ref>.supabase.co/functions/v1/ai-check', 'ai_check_url');
--   3. Deploy functions/ai-check with JWT verification turned off, and add the GEMINI_API_KEY
--      secret to Edge Functions.
-- Without step 2 every check is saved as "not set up" and nothing is sent anywhere.
--
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/ai-check.test.js checks it.

-- 031 has to be there first, and 001 to 030 before that.
DO $$
BEGIN
  IF to_regprocedure('public.plant_name_key(text)') IS NULL THEN
    RAISE EXCEPTION '032 needs 031_species_from_record.sql to be run first';
  END IF;
END
$$;

-- 1. pg_net, which lets the database send a web request after a change is saved. Supabase has it
-- but leaves it off. The tests run on PGlite, which doesn't have it, so there the checks are all
-- saved as "not set up".
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    IF to_regnamespace('extensions') IS NOT NULL THEN
      CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    ELSE
      CREATE EXTENSION IF NOT EXISTS pg_net;
    END IF;
  END IF;
END
$$;

-- 2. One row per record that has been sent for a check, or is waiting for its photos first.
--   status        waiting_for_photos, checking (sent to the function), done, failed, or not_set_up
--                 (no function address in Vault)
--   verdict       consistent, worth_a_look or unsure, only when it's done
--   names_match, photo_shows_plant, photo_matches_name
--                 the three answers: yes, no or unsure. Empty when it wasn't asked (no common
--                 name, or no photo to look at)
--   note          a sentence or two from the AI for the officer
--   problem       why a check failed, for the officer
--   checked_species_name, checked_common_name
--                 the names it checked, so the page can say when someone changed them since
--   token         the one time token for the function's answer. Nobody reads it through the API
CREATE TABLE IF NOT EXISTS public.record_ai_checks (
  record_id uuid PRIMARY KEY REFERENCES public.records (id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('waiting_for_photos', 'checking', 'done', 'failed', 'not_set_up')),
  verdict text CHECK (verdict IN ('consistent', 'worth_a_look', 'unsure')),
  names_match text CHECK (names_match IN ('yes', 'no', 'unsure')),
  photo_shows_plant text CHECK (photo_shows_plant IN ('yes', 'no', 'unsure')),
  photo_matches_name text CHECK (photo_matches_name IN ('yes', 'no', 'unsure')),
  note text CHECK (char_length(note) <= 600),
  problem text CHECK (char_length(problem) <= 300),
  photos_checked integer CHECK (photos_checked >= 0),
  checked_species_name text CHECK (char_length(checked_species_name) <= 200),
  checked_common_name text CHECK (char_length(checked_common_name) <= 200),
  model text CHECK (char_length(model) <= 100),
  requested_at timestamptz,
  checked_at timestamptz,
  token uuid,
  CONSTRAINT record_ai_checks_verdict_when_done CHECK ((status = 'done') = (verdict IS NOT NULL))
);

ALTER TABLE public.record_ai_checks ENABLE ROW LEVEL SECURITY;

-- Officers and admins read every column but the token, the same people who review records.
-- Nobody changes a row through the API: the triggers, request_ai_check() and the function (with
-- the service role) do that.
REVOKE ALL ON TABLE public.record_ai_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT (record_id, status, verdict, names_match, photo_shows_plant, photo_matches_name,
  note, problem, photos_checked, checked_species_name, checked_common_name, model, requested_at,
  checked_at) ON TABLE public.record_ai_checks TO authenticated;
GRANT ALL ON TABLE public.record_ai_checks TO service_role;

DROP POLICY IF EXISTS "Officers and admins read AI checks" ON public.record_ai_checks;
CREATE POLICY "Officers and admins read AI checks"
  ON public.record_ai_checks FOR SELECT
  TO authenticated
  USING (public.has_any_role(ARRAY['conservation_officer', 'admin']));

-- 3. Sends one check to the function. The caller has made the row and locked it. Clears the last
-- answer, makes a new token and gives back the new status. With no address in Vault (or no pg_net
-- or Vault, like on PGlite) nothing is sent and the status is not_set_up.
CREATE OR REPLACE FUNCTION public.send_ai_check(for_record uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  function_url text;
  new_token uuid := gen_random_uuid();
BEGIN
  IF to_regnamespace('net') IS NOT NULL AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
      INTO function_url
      USING 'ai_check_url';
  END IF;

  UPDATE public.record_ai_checks AS c
  SET status = CASE WHEN nullif(btrim(function_url), '') IS NULL THEN 'not_set_up' ELSE 'checking' END,
      token = CASE WHEN nullif(btrim(function_url), '') IS NULL THEN NULL ELSE new_token END,
      requested_at = now(),
      verdict = NULL,
      names_match = NULL,
      photo_shows_plant = NULL,
      photo_matches_name = NULL,
      note = NULL,
      problem = NULL,
      photos_checked = NULL,
      checked_species_name = NULL,
      checked_common_name = NULL,
      model = NULL,
      checked_at = NULL
  WHERE c.record_id = for_record;

  IF nullif(btrim(function_url), '') IS NULL THEN
    RETURN 'not_set_up';
  END IF;

  -- pg_net only sends it once this transaction is saved, so the function sees the record, its
  -- photos and the token. Only the record ID and the token go in the request.
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    USING btrim(function_url),
      jsonb_build_object('record_id', for_record, 'token', new_token),
      '{"Content-Type": "application/json"}'::jsonb,
      10000;
  RETURN 'checking';
END
$$;

-- 4. Sends a record that's waiting for its photos once they're all uploaded. The lock on the row
-- comes before the count, so when two photos of one record upload at the same moment, the second
-- one counts both.
CREATE OR REPLACE FUNCTION public.ai_check_if_photos_are_in(for_record uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  photos_wanted integer;
  photos_here integer;
BEGIN
  PERFORM 1
  FROM public.record_ai_checks AS c
  WHERE c.record_id = for_record
    AND c.status = 'waiting_for_photos'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT r.photo_count INTO photos_wanted
  FROM public.records AS r
  WHERE r.id = for_record
    AND r.status = 'waiting';
  IF photos_wanted IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO photos_here
  FROM storage.objects AS o
  WHERE o.bucket_id = 'record-photos'
    AND split_part(o.name, '/', 2) = for_record::text;

  IF photos_here >= photos_wanted THEN
    PERFORM public.send_ai_check(for_record);
  END IF;
END
$$;

-- 5. A new waiting record gets its row, and goes straight off if it has no photos to wait for.
-- Any error is only a warning, so a check can never stop a record from uploading.
CREATE OR REPLACE FUNCTION public.start_ai_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.record_ai_checks (record_id, status)
    VALUES (NEW.id, 'waiting_for_photos')
    ON CONFLICT ON CONSTRAINT record_ai_checks_pkey DO NOTHING;
    PERFORM public.ai_check_if_photos_are_in(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'The AI check for record % did not start: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS start_ai_check ON public.records;
CREATE TRIGGER start_ai_check
  AFTER INSERT ON public.records
  FOR EACH ROW
  WHEN (NEW.status = 'waiting')
  EXECUTE FUNCTION public.start_ai_check();

-- 6. Each uploaded record photo checks whether it was the record's last one. The phone saves them
-- as <account ID>/<record ID>/<n>.jpg (005). Like above, an error is only a warning, so a check
-- can never stop a photo from uploading.
CREATE OR REPLACE FUNCTION public.ai_check_on_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  record_part text := split_part(NEW.name, '/', 2);
BEGIN
  IF record_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    BEGIN
      PERFORM public.ai_check_if_photos_are_in(record_part::uuid);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'The AI check for record % did not start: %', record_part, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS ai_check_on_photo ON storage.objects;
CREATE TRIGGER ai_check_on_photo
  AFTER INSERT ON storage.objects
  FOR EACH ROW
  WHEN (NEW.bucket_id = 'record-photos')
  EXECUTE FUNCTION public.ai_check_on_photo();

-- 7. "Check again" on the review page, for officers and admins. Checks a waiting record with the
-- photos it has now. Gives back what happened:
--   checking          sent
--   not_set_up        the function's address isn't in Vault
--   already_checking  a check was sent less than 2 minutes ago and hasn't answered yet
--   too_soon          it was checked less than a minute ago (so a double click doesn't use up the
--                     free Gemini requests)
--   not_waiting       the record has been reviewed already
--   not_found         there's no record with that ID
CREATE OR REPLACE FUNCTION public.request_ai_check(for_record uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  record_status text;
  last_status text;
  last_requested timestamptz;
BEGIN
  IF NOT public.has_any_role(ARRAY['conservation_officer', 'admin']) THEN
    RAISE EXCEPTION 'Only conservation officers and admins can ask for an AI check'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.status INTO record_status FROM public.records AS r WHERE r.id = for_record;
  IF record_status IS NULL THEN
    RETURN 'not_found';
  END IF;
  IF record_status <> 'waiting' THEN
    RETURN 'not_waiting';
  END IF;

  INSERT INTO public.record_ai_checks (record_id, status)
  VALUES (for_record, 'waiting_for_photos')
  ON CONFLICT ON CONSTRAINT record_ai_checks_pkey DO NOTHING;

  SELECT c.status, c.requested_at INTO last_status, last_requested
  FROM public.record_ai_checks AS c
  WHERE c.record_id = for_record
  FOR UPDATE;

  IF last_status = 'checking' AND last_requested > now() - interval '2 minutes' THEN
    RETURN 'already_checking';
  END IF;
  IF last_status IN ('done', 'failed') AND last_requested > now() - interval '1 minute' THEN
    RETURN 'too_soon';
  END IF;

  RETURN public.send_ai_check(for_record);
END
$$;

-- Only the triggers run 3 to 6. Signed in users can call 7, which checks the role itself.
REVOKE EXECUTE ON FUNCTION public.send_ai_check(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_check_if_photos_are_in(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_ai_check() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_check_on_photo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_ai_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_ai_check(uuid) TO authenticated;

-- Tells the API to pick up the new table and function straight away.
NOTIFY pgrst, 'reload schema';
