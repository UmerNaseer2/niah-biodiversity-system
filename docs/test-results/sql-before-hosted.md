# SQL files before hosted test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `sql-before-hosted` branch.
Everything ran against PGlite through `supabase/tests/harness.js` and the stand-in in
`supabase/tests/stand-in.js`, not the hosted project.

## What changed

The hosted project has 001 and 002 so far, and gets 003 to 009 one file at a time. A review of
those files found places where the database was less strict part way through than at the end, so
these changes make every file safe on its own.

- **003** takes out the `observations` view from 001. Nothing reads it, and `records_public` and
  `records_staff` cover what it was for. 006 still drops it too, in case 003 already ran.
- **004** only gives SELECT on its four views, the same as 006 does. Its `records_public` leaves
  out the notes and who recorded a plant, and only shows the middle of each plant's grid square
  until 006 swaps in the full rule. That's the same square 006 and the website use.
- **006** adds the rough area only switch itself if 007 hasn't yet, and its `records_public`
  checks it. Running 006 again after 007 used to show the exact spot of a plant an officer had
  set to rough area only, until 007 ran again.
- **README** says 002 is only for a new project, and lists what to check in the Table Editor and
  the dashboard before 004 runs on hosted. It also adds the rule that every file has to leave the
  database safe on its own.

001 and 002 weren't changed, because they've already run on hosted (`supabase/README.md`).

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 167 of 167 |
| New tests on the old files | the same, with the old 003, 004 and 006 put back | The 3 new tests fail, so they catch what they're for |

The new tests are in `supabase/tests/roles.test.js`:

| Test | What it checks |
| --- | --- |
| After every file from 003 on, no view is writable by anon or authenticated | Builds a database with 001 up to each file in turn and asks Postgres for any view the API can insert, update, delete or truncate. Also checks anon can only read `records_public`, `species_public` and `species_photos_public` |
| From 004 on, `records_public` has no notes or recorded by column | The same, for the columns of the view |
| A plant marked rough area only stays hidden after 006, before 007 runs again | Marks a test plant, publishes a record of it, runs 006 again and checks the view only gives its grid square |

`supabase/tests/sync.test.js` now checks the exact square 004 gives for a threatened plant, worked
out by hand, instead of only checking it isn't the exact spot.

## Manual tests (stand-in)

| Test | Result |
| --- | --- |
| The stand-in starts with the changed files | Pass |
| The website smoke test (public pages, every staff page, the CSV, and the visitor getting No access and 403) gives the same status and heading as before | Pass |
| The API answers `records_public` for anon and has no `observations` view | Pass |

## Not tested yet

- The hosted project. 003 to 009 still need to be run there, in order, after the checks in
  `supabase/README.md`.
