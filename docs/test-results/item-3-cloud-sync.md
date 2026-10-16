# Item 3 test results: cloud setup and the sync rules

One round so far, on 16 Oct 2026. Item 3 sets up the Supabase side of syncing: the hosted project
and where its keys go, the SQL that lets the phone upload its records, a private Storage bucket
for record photos, and the rules the phone follows when it uploads a record and reads the answer.
[docs/sync-design.md](../sync-design.md) explains the whole plan and why it works that way.

This is the Sprint #1 part of item 3. Nothing on the phone talks to Supabase yet. Item 10
(Sprint #2) adds the "Sync now" button and the Supabase client that use these rules, and item 11
takes the photos. The hosted project also still needs 003, 004 and 005 run (see
[Not tested yet](#not-tested-yet)).

## Round 1: 16 Oct 2026, SQL tests and unit tests

Run on Umer's Mac on `main` with Node 22. Nothing in this item shows on a screen yet, so there's no
simulator or browser round. The SQL ran on PGlite on the Mac, not on the hosted project.

### What we built

- **The Supabase project.** The team has a hosted Supabase project. The website and the app each
  keep its URL and anon key in a file git ignores, `web/.env.local` and `mobile/.env`. To set one
  up, copy the `.env.example` next to it and ask Umer for the values. The anon key (Supabase calls
  it the publishable key now) is fine in an app, because Row Level Security decides what it can
  do. The service role key skips Row Level Security, so it never goes in the app, the website's
  browser code or git.
- **`supabase/005_phone_sync.sql`.** It changes the records table so the phone can upload into it:
  - `tag_code` is worked out from the ID the same way the phone does it, and two records can't
    have the same one
  - `species_name` and `common_name` go up with every record, so a record can name a species the
    species table doesn't have yet. The old records got theirs from the species table.
    `species_slug` is optional now, and deleting a species keeps its records
  - height is optional (the old 0s became empty), `diseased` is a condition now, and a location
    has to be `lat`, `lng` and `accuracyM` as numbers, plus `capturedAt` if there is one
  - the server fills in `submitted_by`, `recorded_by` and `uploaded_at` itself
  - a signed in user can only fill in 10 of the columns, and only botanists, officers and admins
    can upload. A new record always starts as `waiting`
  - a private `record-photos` bucket, where field staff upload into their own folder, and only the
    uploader, officers and admins can see a photo
- **The phone side.** `mobile/src/sync/upload-row.ts` turns a record into the row the server takes
  (`toUploadRow`) and works out what the server's answer means (`classifyUpload`): synced, try
  again later, or a problem someone has to sort out, with the message to show for it
  (`uploadProblemMessage`). Item 10 calls these.
- **Tests for our SQL.** `supabase/tests/` runs 001 to 005 in order on PGlite, which is Postgres
  built for WebAssembly, so it runs in Node with no Supabase project and no keys.
  `supabase-stub.sql` stands in for the parts of Supabase our SQL uses: the API roles,
  `auth.uid()` and the Storage tables. The tests then act as a botanist, a visitor, an officer, an
  admin and someone who isn't signed in, the same way the Supabase API does.
- **Examples both sides share.** `supabase/tests/fixtures/phone-upload.json` has three records the
  way the phone keeps them, and the row the phone should send for each one. The phone tests check
  `toUploadRow` builds those rows, and the SQL tests upload the same rows. So if the phone and the
  server stop agreeing on a column, one of the two test runs fails.
- **CI.** GitHub runs the SQL tests on every pull request and every push to `main`, as a third job
  called Database, next to the mobile and web ones.
- **IDs.** The comment on `newId()` in `mobile/src/lib/id.ts` now says why the phone makes the ID:
  the server turns away a second upload of the same record, so a record is never saved twice.

How the code is split:

- `supabase/005_phone_sync.sql` is everything the server does with an upload, plus the photos
  bucket and its policies.
- `supabase/tests/harness.js` builds the test database and acts as each kind of user, and
  `supabase/tests/sync.test.js` has the tests.
- `mobile/src/sync/upload-row.ts` is the phone side. It doesn't talk to the server, so it's easy
  to test.

### Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL tests, from `supabase/tests/` | `npm test` | Pass, 20 tests in 3 groups |
| Unit and screen tests, from `mobile/` | `npm test` | Pass, 267 tests in 15 files (item 9 had 246 in 14) |
| Typecheck, from `mobile/` | `npm run typecheck` | Pass |
| Lint, from `mobile/` | `npm run lint` | Pass |

New tests:

- `supabase/tests/sync.test.js` (20 tests):
  - Uploading records (13 tests). Each example row goes in as a botanist and waits for review,
    with the tag code, the uploader and the upload time filled in by the server. Officers and
    admins upload in their own names. Sending a record twice keeps one row and gives the
    `records_pkey` error, even with the primary key rebuilt so it's newer than the tag code rule.
    Two records with the same tag code give the `records_tag_code_key` error. Sending one of the 8
    columns the server looks after gets "permission denied", and sending `tag_code` gets an error
    too. Visitors and people who aren't signed in can't upload. 23 kinds of bad value get turned
    down, each with the right error. A location without a capture time is fine. A new record
    stays off the public view until it's published, and deleting a species keeps its records.
  - The records already on Supabase (3 tests). The seed records get their species names, and tag
    codes that match the QR codes in the species table. 002 can still run again, and running 005
    a second time stops on its first line without changing anything.
  - Record photos in Storage (4 tests). The bucket is private and only takes images up to 10 MB.
    Field staff can only upload into their own folder. Visitors and people who aren't signed in
    can't upload. Only the uploader, officers and admins can see a photo.
- `mobile/src/sync/__tests__/upload-row.test.ts` (21 tests) checks `toUploadRow` builds the
  example rows, sends `null` for every empty field and never sends the tag code or a column the
  server fills in. Then it checks what the phone does with 14 different answers from the server,
  and the message for each problem.

To check the tests catch real bugs, we broke the code on purpose 15 times. The tests failed every
time, then we put the code back:

1. Stopped the server filling in `recorded_by`.
2. Let signed in users fill in `status`.
3. Made the photos bucket public.
4. Let field staff upload photos into someone else's folder.
5. Stopped officers seeing record photos.
6. Stopped the server clearing a species slug it doesn't have.
7. Took out the check that the accuracy is a number.
8. Let any signed in user upload a record, not just field staff.
9. Made the server's tag codes 8 characters long.
10. Made deleting a species delete its records again.
11. Took `DEFERRABLE` off the tag code rule.
12. Made the phone count every `23505` error as synced.
13. Made the phone try again after a `42501` error.
14. Made the phone leave out empty notes instead of sending `null`.
15. Made the phone send the tag code.

The website wasn't changed in this item. 005 makes a record's height and species slug optional,
so items 15 and 16 check the website copes with an empty one.

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| The hosted project | When we checked on 16 Oct 2026 it had 001 and 002 run, but not the rest | Run 003, 004 and 005 in the SQL editor, in that order (see [supabase/README.md](../../supabase/README.md)). Then check the Table Editor shows `tag_code`, `species_name` and `submitted_by` on records, and Storage shows the `record-photos` bucket as private |
| Supabase's own Postgres | PGlite runs Postgres 18.3 and Supabase projects run 15 or 17. Our SQL doesn't use anything newer than 15, but the tests haven't run there | Run the tests against a local Supabase (`supabase start`, which needs Docker), or repeat the checks on the hosted project once item 10 can upload |
| The Storage API | The size and file type limits are checked by Supabase's Storage server, not by Postgres, so the tests only check the bucket settings and the policies | When item 11 uploads photos, try a real photo, an 11 MB file and a PDF, and check only the photo goes in |
| Errors through the Supabase API | The tests check the codes Postgres sends. The phone gets them through the Supabase API, which passes the code and message on | When item 10 is in, upload the same record twice and then upload as a visitor, and check the phone gets `23505` naming `records_pkey`, then `42501` |

### Security check

`npm audit` on 16 Oct 2026.

**SQL tests:** 0 vulnerabilities. The one package, `@electric-sql/pglite` (`0.5.8`), only runs in
the tests and in CI, never in the app or the website.

**Mobile:** no new packages. 65 in total (16 moderate, 49 high), the same as item 9, and 61 with
`--omit=dev` (16 moderate, 45 high).

**Website:** not changed in this item.

**Keys.** The URL and the anon key are only in `web/.env.local` and `mobile/.env`, which git
ignores. No real key is in the repo, and the CI job doesn't need one.

**Who can do what.** Three layers stop a botanist getting around the rules:

- Column grants, so an upload can't fill in `status`, `recorded_by`, `submitted_by`,
  `uploaded_at` or the review columns.
- The `fill_in_new_record` trigger, which puts the record in the name of whoever is signed in,
  not anything the phone sends. Only the trigger can run it, so nobody can call it through the
  API.
- Row Level Security, which only lets field staff upload, in their own name, as `waiting`.

**Photos.** The `record-photos` bucket is private, because a photo can show where a protected plant
is. Don't put record photos in the older `botanical-photos` bucket from 001, because that one is
public.

**Locations.** The example records in the fixture have made up locations near the park HQ. A new
record stays off `records_public` until an officer publishes it.
