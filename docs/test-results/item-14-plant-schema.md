# Item 14 test results: plant schema and CRUD

Two rounds so far. Item 14 is the plant database: the tables and sample data (`001` and `002`),
and the species pages on the dashboard where conservation officers and admins add, edit and delete
species. Round 2 added `supabase/007_species_fixes.sql`, the edit and delete pages, and SQL tests
for all of it.

The hosted project still needs 003 to 007 run, in that order (see
[Not tested yet](#not-tested-yet)).

## Round 1: 15 Oct 2026, schema and seed data

Run on the `item-14-16-integration` branch.

### Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web; npm.cmd run lint` | Pass |
| Website build | `cd web; npm.cmd run build` | Pass. Only the existing Atkinson Hyperlegible font fallback warnings were printed |
| Diff whitespace | `git diff --check` | Pass |

### Database checks

- The schema and seed data have 6 species and 6 records.
- This round's notes said `004_security_hardening.sql` had been run on the hosted project. When we
  checked on 16 Oct 2026 the hosted project only had 001 and 002, so 003 to 007 still need
  running (see [supabase/README.md](../../supabase/README.md)).
- The rules below come from 004, 006 and 007. The SQL tests check them on a copy of the database
  (round 2 below, and [item 4's results](item-4-access-control.md)):
  - The public reads species through `species_public`, which has no locations, and records
    through `records_public`.
  - `records_public` only shows a plant's exact spot if its species is Least Concern or Near
    Threatened, isn't protected in Sarawak and isn't set to rough area only. Every other plant
    shows the middle of its 440 m grid square.
  - People who aren't signed in can't read the species or records tables themselves.
  - Only officers and admins add, edit and delete species.
  - Botanists, officers and admins upload records. Officers and admins review them, and a
    botanist can fix their own record while it waits for review.
  - A new account is always a visitor, whatever the sign up form sends.

### Notes

The public pages read from `species_public` and `records_public`, and never from the tables. The
staff views, `species_staff` and `records_staff`, only answer officers and admins, and the
dashboard's species pages use them (round 2).

## Round 2: 16 Oct 2026, species forms and SQL tests

Run on Umer's Mac on `main` with Node 22. The SQL ran on PGlite on the Mac, not on the hosted
project. The website was checked without the Supabase keys, like CI does, so the signed in pages
weren't clicked through in a browser (see [Not tested yet](#not-tested-yet)).

### What we built

- **`supabase/007_species_fixes.sql`**, in 5 parts. It stops on its first line if 006 hasn't been
  run, and it's safe to run more than once. Running 002 or 006 a second time undoes parts of it,
  so run 007 after either of them.
  1. Rough area only. A new `rough_area_only` column on species, off unless an officer turns it
     on. It hides a species' exact spot even if it's LC or NT and isn't protected, for example a
     plant people dig up to sell.
  2. Views. `records_public` uses the new column, on top of the rules 006 gave it.
     `species_public` has `rough_area_only` on the end, so the plant pages can say a species only
     shows a rough area. `species_staff` is made with the new column. The API can only read the
     views.
  3. Sample species facts, checked on 16 Oct 2026. The IUCN statuses come from each species'
     Wikipedia page, which cites the Red List, the protection from the Sarawak Forestry
     Department's list of protected plants, and the names and where they grow from Kew's Plants
     of the World Online. Tapang is NT and protected in Sarawak, and is also called Tualang.
     Shorea macrophylla is LC and protected, and its newer name is Rubroshorea macrophylla.
     Dipterocarpus sarawakensis is VU and grows in Peninsular Malaysia too. Paphiopedilum
     barbatum is EN, and Kew doesn't list it in Borneo, so its text doesn't place it at Niah. SFC
     should still confirm all of these, and someone should check the statuses on the Red List
     site itself.
  4. Sample photos. The six sample species use stock photos from Unsplash, so their captions and
     credits say so until SFC sends real ones (item 18).
  5. `updated_at`. A trigger sets it to the time of the change when a species is edited, so the
     website doesn't send it. Saving with nothing different leaves it alone.
- **The species table** on the dashboard (`/dashboard/species`) reads `species_staff` and
  `records_staff`. It shows each species' IUCN status, whether it's protected, whether the public
  map shows its exact spot or a rough area, how many public and waiting records it has and when it
  last changed, with Edit and Delete for each one.
- **Add a species and edit a species** share one form (`species-form.tsx`). The scientific name
  can't change once a species is added, because its public page link and its records use it. A
  threatened or protected species is always saved as rough area only, so its exact spot stays
  hidden if its status changes later, until an officer decides. The form checks are in
  `web/src/lib/species-form.ts`, so the page runs them before it sends the form and the server
  action runs them again before it saves.
- **Delete a species** says how many records the species has and what happens to them first. Its
  records stay, with the species name saved on them, and the public site then only shows their
  grid square. The species list then says what was deleted.
- **Server actions** (`actions.ts`). Each one checks who is signed in itself, because anyone can
  send a request straight to a server action, and Row Level Security on the species table checks
  again. After a change they refresh the dashboard species pages and the public plant list and
  plant pages.
- **Every dashboard species page** checks the session itself (`requireStaff` in
  `web/src/lib/auth.ts`), because Next renders a page and its layout at the same time.
- **IUCN codes.** The website takes the same codes as the species table: LC, NT, VU, EN, CR, DD
  (Data Deficient) and NE (Not Evaluated), each with its own colour. `showsExactSpot` in
  `web/src/lib/iucn.ts` is the same rule as `records_public`.
- **The phone's species list** (`mobile/src/data/species-list.ts`) has Tapang's names from 007.
- **Tests.** `supabase/tests/species.test.js` (29 tests) adds, edits and deletes species the same
  way the website does, as each kind of user. `supabase/tests/harness.js` runs 007 after 001 to
  006, and a test can run fewer files to check what 007 does without 006.

### Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL tests, from `supabase/tests/` | `npm test` | Pass, 93 tests in 19 groups (item 4 had 64 in 12) |
| Lint, from `web/` | `npm run lint` | Pass |
| Typecheck, from `web/` | `npx next typegen`, then `npx tsc --noEmit` | Pass. The website has no typecheck script, and `next build` checks types too |
| Build, from `web/` | `npm run build` | Pass, 19 static pages. The edit and delete pages are dynamic. The 2 font warnings were already there |
| Diff whitespace | `git diff --check` | Pass |

New tests in `supabase/tests/species.test.js` (29 tests):

- The sample species (4 tests). They have the IUCN codes, protection, names and text 007 gives
  them, everyone reads the same facts through `species_public`, and their photos say they're
  placeholders from Unsplash.
- Running 007 a second time (4 tests). It changes nothing, not even `updated_at`. It leaves other
  photos alone. It puts the fixes back after 002 runs, and it stops and changes nothing if 006
  hasn't been run.
- Rough area only (5 tests). A plant of an LC species shows its exact spot until its species is
  marked, and only its grid square after. An NT species marked when it's added only shows the
  square. A species isn't marked unless someone marks it. Everyone reads the setting through
  `species_public`, and only officers and admins change it.
- Adding a species from the website (4 tests). Officers and admins add one, and its slug is its
  ID. Everyone else is turned down. Adding one that's already there gives `23505`, which the form
  shows as "already in the database". The database turns down an IUCN code or a missing family
  the form never sends.
- Editing a species from the website (6 tests). Officers and admins save changes, and
  `updated_at` changes by itself. Saving with nothing different leaves `updated_at` alone.
  Everyone else changes nothing. A species that isn't there gives back no rows. Nobody can run
  the trigger function through the API, and the database turns down values the form never sends.
- Deleting a species from the website (4 tests). Officers and admins delete one, and it leaves the
  public site. Its records stay with their saved names, but only show the grid square. Everyone
  else deletes nothing, and a species that isn't there gives back no rows.
- The views after 007 (2 tests). They have the same options 004 and 006 gave them, and
  `species_staff` shows officers every column of the species table.

`roles.test.js` checks that 006 then 007 run a second time end up the same as the first time.

To check the tests catch real bugs, we broke 007 on purpose 60 ways, one change at a time, and
undid each change once its run was over. 58 of the 60 made at least one test fail. The other 2
don't change what anyone can do, so no test can catch them:

- 25 takes the role filter off `species_staff`. The view reads the species table as whoever
  asks, and the table's Row Level Security (from 004) already only shows rows to officers and
  admins.
- 32 takes out the revoke on the views. 007 replaces views that 006 made, and replacing a view
  keeps what 006 granted on it, which is only reading. 007 stops if 006 hasn't been run.

The new column:

1. Let `rough_area_only` be empty.
2. Turned `rough_area_only` on for every new species.

The 006 check:

3. Took out the check that 006 has been run.
4. Made the check look for something 004 adds, so it passed without 006.

`records_public`:

5. Let rough area only species show their exact spot.
6. Let species protected in Sarawak show their exact spot.
7. Let Vulnerable species show their exact spot.
8. Made Near Threatened species only show a square.
9. Let plants the species table doesn't have show their exact spot.
10. Took the phone's accuracy off an exact spot.
11. Made the square 0.001 degrees instead of 0.004.
12. Gave a square the exact longitude.
13. Gave a square 100 m accuracy instead of 440 m.
14. Gave a record with no location a `gps` with empty values instead of `null`.
15. Added the notes to `records_public`.
16. Let records waiting for review show in `records_public`.
17. Made `records_public` read as whoever asks.
18. Took `security_barrier` off `records_public`.

`species_public`:

19. Left `rough_area_only` out of `species_public`.
20. Added the species' exact location (`coordinates_exact`) to `species_public`.
21. Made `species_public` read as whoever asks.
22. Left the options off `species_public`.

`species_staff`:

23. Didn't make `species_staff` with the new column.
24. Made `species_staff` read as its owner.
25. Took the role filter off `species_staff` (no test failed, see above).
26. Made `species_staff` only show to admins.

What the API can do with the views:

27. Let the API add, change and delete rows through the public views.
28. Let the API add, change and delete rows through `species_staff`.
29. Stopped people who aren't signed in reading the public views.
30. Stopped everyone reading `species_staff`.
31. Let people who aren't signed in read `species_staff`.
32. Took out the revoke on the views (no test failed, see above).

Sample species facts:

33. Made Tapang LC.
34. Made Tapang not protected.
35. Changed Tapang's common names.
36. Made Shorea macrophylla NT.
37. Made Shorea macrophylla not protected.
38. Gave Shorea macrophylla its own name as its newer name.
39. Made Dipterocarpus sarawakensis EN.
40. Changed the Dipterocarpus sarawakensis summary to say it only grows in Sarawak.
41. Made Paphiopedilum barbatum VU.
42. Changed the Paphiopedilum barbatum text to place it at Niah.
43. Let the Tapang fix run even when nothing was different, so a second run of 007 changed
    `updated_at`.
44. The same for Shorea macrophylla.
45. The same for Dipterocarpus sarawakensis.
46. The same for Paphiopedilum barbatum.

Sample photos:

47. Let the photo fix run even when nothing was different.
48. Credited the photos to SFC instead of Unsplash.
49. Gave every photo the placeholder caption, not only the Unsplash ones.
50. Changed the Unsplash photos of every species, not only the six sample ones.
51. Changed the order of the photos.
52. Swapped each Unsplash photo for only its caption and credit, so it lost its link.

`updated_at`:

53. Took out the trigger, so editing a species didn't change `updated_at`.
54. Made saving with nothing different change `updated_at`.
55. Made the trigger set `updated_at` to the time of the change even when the update sets it
    itself.
56. Made the trigger only change `updated_at` when nothing was different.
57. Made the trigger run after the update, so it couldn't change `updated_at`.
58. Made the trigger run once for each statement instead of once for each row.
59. Made the trigger skip every edit.
60. Let the API run the trigger function.

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| The hosted project | When we checked on 16 Oct 2026 it had 001 and 002 run, but not the rest | Run 003, 004, 005, 006 and 007 in the SQL editor, one file at a time, in that order, without stopping part way (see [supabase/README.md](../../supabase/README.md)). Then check Table Editor, species has a `rough_area_only` column |
| Through the Supabase API and a real browser | The tests run SQL as the same roles the API uses, but not through the API itself, and the website was checked without keys | Once 007 is on the hosted project, sign in as an officer, add a made up species (like Testus plantus), edit it, then delete it, and check the public plant list follows each change. Then do the same as an admin, and check a botanist account gets the no access page |
| Supabase's own Postgres | PGlite runs Postgres 18.3 and Supabase projects run 15 or 17. 007 doesn't use anything newer than 15, but the tests haven't run there | Run the tests against a local Supabase (`supabase start`, which needs Docker), or repeat the main checks on the hosted project |
| Linking records to a species again | Deleting a species keeps its records with the saved name, but adding the species again doesn't link them to it | Item 17 (editing records on the website) can let an officer pick the species for a record |
| The phone's species list | The phone still has its own copy of the species list, so a species added on the website doesn't show in the app yet | Item 10 (Sprint #2) downloads the species list from Supabase when the phone syncs |

### Security check

`npm audit` on 16 Oct 2026.

**SQL tests:** 0 vulnerabilities. No new packages.

**Website:** no new packages. Nothing found with `--omit=dev`, and the dev tools have the same 5
high that the item 13 and 15 results describe. Don't run `npm audit fix --force`.

**Mobile:** only the species list text changed, no new packages.

**Keys.** The URL and the anon key are only in `web/.env.local` and `mobile/.env`, which git
ignores. No real key is in the repo, and the tests and CI don't need one. The website never uses
the service role key, so every species change goes through Row Level Security as the signed in
user.

**Locations.** No sample record or species has a real plant location. The sample records use
made up points around park HQ. Every sample species is threatened or protected, so none of their
plants show an exact spot on the public site.
