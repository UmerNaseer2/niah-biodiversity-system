-- Makes every way the AI photo check (032) can break show up on the record's card, instead of a
-- check that sits on "Checking" with no reason, or a record with no check at all.
--   * When a trigger can't start a check (say pg_net is down), the upload still goes through, but
--     the check is saved as failed with the database's error, so the officer sees it.
--   * Each check keeps the ID of its pg_net request. pg_net writes down what the function answered
--     (net._http_response, kept for about 6 hours), so fail_lost_ai_checks() can tell when the
--     request didn't get there, timed out, or the function said no, and saves that as the problem.
--   * A check the function took but never answered within 3 minutes is saved as failed too.
-- The review page calls fail_lost_ai_checks() each time it loads.
--
-- The SQL editor runs a whole file as one transaction, so if anything in here fails, nothing from
-- it is kept. It's safe to run again.
-- supabase/tests/ai-check-errors.test.js checks it.

-- 032 has to be there first.
DO $$
BEGIN
  IF to_regprocedure('public.request_ai_check(uuid)') IS NULL THEN
    RAISE EXCEPTION '033 needs 032_ai_photo_check.sql to be run first';
  END IF;
END
$$;

-- 1. The pg_net request each check was sent with. Nobody reads it through the API.
ALTER TABLE public.record_ai_checks ADD COLUMN IF NOT EXISTS request_id bigint;

-- 2. Saves a check as failed with a reason, for a record that exists. A check that already has an
-- answer, or is out with the function, is left alone, because the problem is about a newer try
-- that never started.
CREATE OR REPLACE FUNCTION public.save_ai_check_problem(for_record uuid, what text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.record_ai_checks (record_id, status, problem, requested_at, checked_at)
  SELECT r.id, 'failed', left(what, 300), now(), now()
  FROM public.records AS r
  WHERE r.id = for_record
  ON CONFLICT ON CONSTRAINT record_ai_checks_pkey DO UPDATE
  SET status = 'failed',
      problem = EXCLUDED.problem,
      token = NULL,
      request_id = NULL,
      requested_at = EXCLUDED.requested_at,
      checked_at = EXCLUDED.checked_at
  WHERE public.record_ai_checks.status IN ('waiting_for_photos', 'not_set_up');
END
$$;

-- 3. The same as 032, and it also keeps the pg_net request's ID.
CREATE OR REPLACE FUNCTION public.send_ai_check(for_record uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  function_url text;
  new_token uuid := gen_random_uuid();
  sent_id bigint;
BEGIN
  IF to_regnamespace('net') IS NOT NULL AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
      INTO function_url
      USING 'ai_check_url';
  END IF;

  UPDATE public.record_ai_checks AS c
  SET status = CASE WHEN nullif(btrim(function_url), '') IS NULL THEN 'not_set_up' ELSE 'checking' END,
      token = CASE WHEN nullif(btrim(function_url), '') IS NULL THEN NULL ELSE new_token END,
      request_id = NULL,
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
    INTO sent_id
    USING btrim(function_url),
      jsonb_build_object('record_id', for_record, 'token', new_token),
      '{"Content-Type": "application/json"}'::jsonb,
      10000;

  UPDATE public.record_ai_checks AS c SET request_id = sent_id WHERE c.record_id = for_record;
  RETURN 'checking';
END
$$;

-- 4. A new waiting record. Like 032, an error never stops the record from uploading, but now the
-- check is saved as failed with the error, so the card says what went wrong.
CREATE OR REPLACE FUNCTION public.start_ai_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text;
BEGIN
  BEGIN
    INSERT INTO public.record_ai_checks (record_id, status)
    VALUES (NEW.id, 'waiting_for_photos')
    ON CONFLICT ON CONSTRAINT record_ai_checks_pkey DO NOTHING;
    PERFORM public.ai_check_if_photos_are_in(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    why := SQLERRM;
    RAISE WARNING 'The AI check for record % did not start: %', NEW.id, why;
    BEGIN
      PERFORM public.save_ai_check_problem(NEW.id, 'The check didn''t start: ' || why);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Saving why the AI check for record % did not start failed too: %', NEW.id, SQLERRM;
    END;
  END;
  RETURN NULL;
END
$$;

-- 5. Each uploaded record photo, the same way.
CREATE OR REPLACE FUNCTION public.ai_check_on_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  record_part text := split_part(NEW.name, '/', 2);
  why text;
BEGIN
  IF record_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    BEGIN
      PERFORM public.ai_check_if_photos_are_in(record_part::uuid);
    EXCEPTION WHEN OTHERS THEN
      why := SQLERRM;
      RAISE WARNING 'The AI check for record % did not start: %', record_part, why;
      BEGIN
        PERFORM public.save_ai_check_problem(record_part::uuid, 'The check didn''t start: ' || why);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Saving why the AI check for record % did not start failed too: %', record_part, SQLERRM;
      END;
    END;
  END IF;
  RETURN NULL;
END
$$;

-- 6. Finds checks that got lost on the way and saves why, for officers and admins. Gives back how
-- many it marked as failed. For each check that's still "checking":
--   * pg_net couldn't send it: failed straight away, with pg_net's error
--   * pg_net gave up waiting for the function after 10 seconds: failed once it's 3 minutes old,
--     since the function may still have got it
--   * the function answered with an error (like 404 when it isn't deployed, or 401): failed
--     straight away, with what it said
--   * the function took it (202) but no answer was saved within 3 minutes: failed. The function
--     stops after 150 seconds on the free plan, so by then it isn't coming
--   * pg_net has no answer written down (still sending, or more than 6 hours ago, or sent before
--     033): failed once it's 3 minutes old
-- PGlite has no pg_net, so there only the 3 minute rule runs.
CREATE OR REPLACE FUNCTION public.fail_lost_ai_checks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lost record;
  answered boolean;
  code integer;
  body text;
  timed_out boolean;
  error_msg text;
  said text;
  why text;
  marked integer := 0;
  can_read_answers boolean := to_regclass('net._http_response') IS NOT NULL;
BEGIN
  IF NOT public.has_any_role(ARRAY['conservation_officer', 'admin']) THEN
    RAISE EXCEPTION 'Only conservation officers and admins can look for lost AI checks'
      USING ERRCODE = '42501';
  END IF;

  FOR lost IN
    SELECT c.record_id, c.request_id, c.requested_at
    FROM public.record_ai_checks AS c
    WHERE c.status = 'checking'
    FOR UPDATE SKIP LOCKED
  LOOP
    answered := NULL;
    why := NULL;
    IF can_read_answers AND lost.request_id IS NOT NULL THEN
      EXECUTE 'SELECT true, r.status_code, r.content, r.timed_out, r.error_msg
               FROM net._http_response AS r WHERE r.id = $1'
        INTO answered, code, body, timed_out, error_msg
        USING lost.request_id;
    END IF;

    IF answered AND timed_out THEN
      -- The function may still have it, so this waits the 3 minutes too
      IF lost.requested_at IS NULL OR lost.requested_at < now() - interval '3 minutes' THEN
        why := 'The ai-check function didn''t answer the database within 10 seconds, and no '
          || 'answer was saved after. Check that the function is deployed, then check again.';
      END IF;
    ELSIF answered AND error_msg IS NOT NULL THEN
      why := 'The database couldn''t reach the ai-check function: ' || error_msg;
    ELSIF answered AND (code IS NULL OR code NOT BETWEEN 200 AND 299) THEN
      said := btrim(coalesce(body, ''));
      BEGIN
        said := coalesce(said::jsonb ->> 'error', said::jsonb ->> 'message', said);
      EXCEPTION WHEN OTHERS THEN
        NULL; -- not JSON, so it's shown as it came
      END;
      why := format('The ai-check function said no (HTTP %s)', coalesce(code::text, 'no code'))
        || CASE WHEN said <> '' THEN ': ' || left(said, 150) ELSE '' END
        || CASE WHEN code = 404 THEN '. Check that it''s deployed under the name ai-check.' ELSE '' END;
    ELSIF lost.requested_at IS NULL OR lost.requested_at < now() - interval '3 minutes' THEN
      IF answered THEN
        why := 'The ai-check function took the check but never saved an answer. Its logs in '
          || 'Supabase (Edge Functions, ai-check, Logs) say why.';
      ELSE
        why := 'No answer came back from the ai-check function within 3 minutes.';
      END IF;
    END IF;

    IF why IS NOT NULL THEN
      UPDATE public.record_ai_checks AS c
      SET status = 'failed',
          problem = left(why, 300),
          token = NULL,
          checked_at = now()
      WHERE c.record_id = lost.record_id;
      marked := marked + 1;
    END IF;
  END LOOP;
  RETURN marked;
END
$$;

-- The triggers run 2 to 5. Signed in users can call 6, which checks the role itself.
REVOKE EXECUTE ON FUNCTION public.save_ai_check_problem(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_ai_check(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_ai_check() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_check_on_photo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_lost_ai_checks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fail_lost_ai_checks() TO authenticated;

-- Tells the API to pick up the new function straight away.
NOTIFY pgrst, 'reload schema';
