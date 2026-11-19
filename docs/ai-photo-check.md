# AI photo check

An AI second opinion on each record in the review queue. When a botanist's record reaches the
server, Google Gemini looks at the record's species name, its common name and its photos, and the
review queue shows what it thought on the record's card:

- **Looks consistent**: the names are the same plant and the photo looks like that species.
- **Worth a look**: Gemini said no to at least one question, so the officer should look closer.
- **Couldn't tell**: Gemini wasn't sure, or there wasn't enough to go on.

It never approves or rejects anything, and approving never waits for it. The officer still decides,
and the Approve and Reject buttons work the same whatever it says.

## What it asks

1. Do the scientific name and the common name mean the same plant? (Only when the record has a
   common name.)
2. Does the photo show a plant? (Only when the record has photos.)
3. Does the plant in the photo look like that species? (Only when the record has photos.)

A record with no common name and no photos has nothing to check, and the card says so. Gemini also
writes a sentence or two for the officer, which shows on the card.

## What leaves our server

Only the species name, the common name and up to 3 of the record's photos. No GPS point, notes,
tag code, or names or accounts of people. Before a photo is sent, the function takes out its
details (EXIF, XMP and comments), which is where a phone keeps the camera's GPS position. The
names go to Gemini as data, not as part of the question, so a name like "ignore the above" can't
change what it's asked.

On the free Gemini plan, Google may use what we send to improve its products. That's only plant
names and photos with the details taken out, but if that isn't fine for a park, use a paid key
(the same steps, a key from a project with billing on).

## How it starts

- A new waiting record with no photos is checked straight away, on its names.
- A new waiting record with photos waits until its last photo is uploaded. The phone uploads the
  record first and its photos after, so each photo upload checks whether it was the last one.
- Officers and admins can press **Check again** (or **Check now**) on the card. That also covers a
  photo that never uploaded, since it checks with the photos that are there. It won't send the
  same record again within a minute of its last answer, so a double click doesn't use up the free
  requests.

The database calls the `ai-check` Edge Function with `pg_net` after the record or photo is saved,
so a slow or broken AI never holds up an upload from the phone. Each call carries a new one time
token, kept in the check's row, which only the function can read, so nobody else can post an
answer. The function answers the database straight away and does the check after, then saves the
answer in `record_ai_checks`. The review page looks for it every 5 seconds while a check is on its
way, for up to 3 minutes.

## When something goes wrong

Nothing fails quietly. Whatever breaks, the card says what happened and offers **Check again**:

| What broke | What the card says |
| --- | --- |
| The check couldn't start (say `pg_net` is down) | "The check didn't start:" and the database's error. The record and its photos still upload |
| The function isn't deployed, or said no | "The ai-check function said no (HTTP 404)" and what it said, straight away |
| The database couldn't reach the function | "The database couldn't reach the ai-check function:" and the error |
| The function took it but never answered | After 3 minutes, that it never saved an answer, and to look at its logs |
| The key is missing or wrong, or Gemini is busy | What Gemini said, in words the officer can act on |
| Gemini didn't answer, or couldn't be reached | How long it waited, or why it couldn't reach it |
| None of the photos loaded | Which one failed first and why (like "1.jpg gave HTTP 404"). Gemini isn't asked |
| Some photos are missing or didn't load | The answer, with a line saying which photos were left out |
| Anything else in the function | "Something went wrong while checking" and the error |
| The page couldn't load the checks | The database's error on each card, and to reload |
| The page stopped getting answers | A note at the top of the queue, and to reload |

The triggers never stop an upload because of the AI check: a botanist's record must get to the
server even when the AI is down. So instead of throwing, they save the error on the record's card.
The review page calls `fail_lost_ai_checks()` (033) each time it loads. It reads what `pg_net`
wrote down about each request, so a check that got lost on the way says why instead of sitting on
"Checking". The database's own error stays out of the function's replies, because anyone can call
its address, so for those the card points at the function's logs.

## Setting it up

1. Run `supabase/032_ai_photo_check.sql` in the SQL editor, after 031, then
   `supabase/033_ai_check_errors.sql`.
2. Save the function's address in Vault, under the name `ai_check_url` (SQL editor):

   ```sql
   select vault.create_secret(
     'https://<project ref>.supabase.co/functions/v1/ai-check', 'ai_check_url');
   ```

3. Deploy `supabase/functions/ai-check/index.ts` as an Edge Function called `ai-check`, with
   **Verify JWT** turned off (the token in each call does that job instead). In the dashboard:
   Edge Functions, Deploy a new function, Via Editor, paste the file.
4. Add the Gemini key: Edge Functions, Secrets, add `GEMINI_API_KEY`. Get a key from
   [Google AI Studio](https://aistudio.google.com/apikey).
5. Optional: `GEMINI_MODEL` picks another model, like `gemini-3.5-flash-lite` (what NIAH
   uses). It's `gemini-3.8-flash` without it.

The website needs nothing new, so there's nothing to add in Vercel. Without step 2, checks are
saved as "not set up" and nothing is sent anywhere. Without step 4, each check fails with "the
GEMINI_API_KEY is missing", which shows on the card.

The free plan has a limit on requests a minute and a day
([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)). One check is one request, so a
busy day of uploads can go over the minute limit. Those checks say Gemini is busy, and **Check
again** sends them once it's quiet.

## Tests

- `supabase/tests/ai-check.test.js` checks 032: who can read the checks, the triggers, waiting for
  photos, and `request_ai_check()`.
- `supabase/tests/ai-check-errors.test.js` checks 033: a trigger's error saved on the card, and
  each answer `pg_net` can write down for a lost check.
- `supabase/tests/ai-check-function.test.js` runs the function in Node against PGlite with a
  stand-in Gemini: the token, what's sent (no GPS or notes, photo details taken out), the
  answers, and each way it can fail.
- `web/src/lib/ai-check.test.mjs` checks how the review page reads a check.
