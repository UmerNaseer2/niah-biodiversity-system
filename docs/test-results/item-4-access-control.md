# Item 4 test results: role based access control

One round so far, on 16 Oct 2026. Item 4 gets the database itself to check what each kind of user
can read and change, with Row Level Security policies, column grants and one trigger. So the rules
still hold if someone skips the website and the app and calls the Supabase API directly, with the
anon key and their own login. It's all in `supabase/006_role_based_access.sql`.

The hosted project still needs 003 to 007 run, in that order (see
[Not tested yet](#not-tested-yet)).

## Round 1: 16 Oct 2026, SQL tests

Run on Umer's Mac on `main` with Node 22. The SQL ran on PGlite on the Mac, not on the hosted
project. On the website only the Users and roles page changed, and it's behind staff sign in, so
the website got lint, typecheck and build but no browser round.

### Who can do what

| What they can do | Not signed in | Visitor | Researcher | Botanist | Officer | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Read `species_public` and `records_public` | Yes | Yes | Yes | Yes | Yes | Yes |
| See species photos | Yes | Yes | Yes | Yes | Yes | Yes |
| Read their own profile | No | Yes | Yes | Yes | Yes | Yes |
| Upload a record (item 3) | No | No | No | Yes | Yes | Yes |
| Read the records they uploaded, with the exact spots | No | No | No | Yes | Yes | Yes |
| Fix their own record while it waits for review | No | No | No | Yes | Yes | Yes |
| Read and edit every record, and read `records_staff` | No | No | No | No | Yes | Yes |
| Review a record (change its status or review notes) | No | No | No | No | Yes | Yes |
| Delete a record | No | No | No | No | Yes | Yes |
| Add, edit and delete species, and read `species_staff` | No | No | No | No | Yes | Yes |
| Add, replace and delete species photos | No | No | No | No | Yes | Yes |
| See the sensor nodes | No | No | No | No | Yes | Yes |
| Add, change and remove sensor nodes | No | No | No | No | No | Yes |
| Read every profile, and change other users' roles | No | No | No | No | No | Yes |

Researchers see the same as the public for now, until SFC decides what else they can see. Admins
can do everything officers can, because our proposal has them looking after the accounts and the
stored ecological data. Nobody can change their own role, so the last admin can't lock everyone
out by mistake. A new account is always a visitor until an admin changes its role.

### What we built

- **`supabase/006_role_based_access.sql`**, in 8 parts:
  1. Roles. `researcher` is a role now, next to visitor, botanist, conservation officer and admin.
  2. Profiles. Everyone signed in reads their own profile (003), and admins read everyone's.
     Admins change other users' roles, never their own. Nothing else in a profile can be changed
     through the API.
  3. Species. Officers and admins can read the species table as well as change it, because an edit
     or a delete through the API has to find the row first. The website's species edit and delete
     (item 14) need this.
  4. Records. Officers and admins read, edit and delete every record. Field staff read the records
     they uploaded, and a botanist can fix their own record while it waits for review. A botanist
     who becomes a visitor stops seeing and editing their records. Through the API a signed in user
     can only change 11 of a record's columns. The ID, the tag code, who recorded and uploaded it,
     and who reviewed it and when aren't among them.
  5. Reviews. Changing a record's status or review notes is a review, so only officers and admins
     can do it, and the `fill_in_review` trigger fills in `reviewed_by` and `reviewed_at`. Row Level
     Security can't compare the new row with the old one, so a trigger does it. A change from the
     SQL editor skips the check.
  6. Views. `records_public` only shows a published record's exact spot if its species is in the
     species table, is Least Concern (LC) or Near Threatened (NT), and isn't protected in Sarawak.
     Every other plant, including DD and NE species and names the species table doesn't have, only
     shows the middle of its 0.004 degree grid square (about 440 m at Niah). That's the same square
     the website draws (`web/src/lib/geo.ts`). The notes and the name of whoever recorded the plant
     stay with the staff. `species_staff` and `records_staff` read as whoever asks, so the rules on
     the tables apply to them too. The API can only read the views. Nothing used the
     `observations` view, so 006 drops it.
  7. Sensor nodes. Officers and admins see them, and only admins add, change or remove a node until
     item 28 (Sprint #2) gives each ESP32 its own login that can only add readings.
  8. Species photos. The `botanical-photos` bucket stays public, because the plant pages show these
     photos. Only officers and admins add, replace or delete one, and it takes the same images up
     to 10 MB as `record-photos`. Record photos never go in here.
- **Running it again.** Every policy, view and trigger is dropped and made again, so a second run
  ends up the same as the first. A test checks this against the Postgres catalogs.
- **Tests.** `supabase/tests/roles.test.js` (44 tests) acts as a visitor, a researcher, two
  botanists, an officer, an admin and someone who isn't signed in, the same way the Supabase API
  does. `supabase/tests/harness.js` runs 006 after 001 to 005.
- **The website.** The Users and roles page lists the same rules the database checks, and says why
  admins can do everything officers can. The `/screens` page says the same. `DbRole` in
  `web/src/lib/auth.ts` has `researcher` now. Who can open the dashboard didn't change: officers
  and admins.

### Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL tests, from `supabase/tests/` | `npm test` | Pass, 64 tests in 12 groups (item 3 had 20 in 3) |
| Lint, from `web/` | `npm run lint` | Pass |
| Typecheck, from `web/` | `npx tsc --noEmit` | Pass. The website has no typecheck script, and `next build` checks types too |
| Build, from `web/` | `npm run build` | Pass, 19 static pages. The 2 font warnings were already there |

The website checks ran without the Supabase keys, like CI does, so the build used the mock data.
The mobile app didn't change in this item.

New tests in `supabase/tests/roles.test.js` (44 tests):

- Roles and profiles (6 tests). Researcher is a role, and made up roles are turned down. A new
  account is always a visitor. Everyone reads their own profile, and only admins read everyone
  else's. Admins change other users' roles but not their own, and nobody else changes one. Nothing
  else in a profile can be changed through the API, even by an admin.
- Species (4 tests). Officers and admins add, edit and delete species, and nobody else can. Only
  officers and admins read the species table and `species_staff`. Everyone reads `species_public`,
  which has no locations.
- Records (11 tests). Officers and admins read every record, and field staff read their own. A
  botanist fixes their own record while it waits, but not someone else's, and not their own once
  it's reviewed. A botanist who becomes a visitor stops seeing and editing their records. Only
  officers and admins review a record, and the server fills in who reviewed it and when. The SQL
  editor can still change a status. Nobody changes the review or upload details themselves.
  Visitors, researchers and people who aren't signed in can't change records, and only officers
  and admins delete them or read `records_staff`.
- What the public sees in `records_public` (6 tests). No notes and no recorder's name. Every seed
  record only shows its grid square. Only plants that are unprotected and LC or NT show their
  exact spot. A species the species table doesn't have only shows its square, and a record
  without a location stays without one. Records waiting for review or rejected stay off it.
- Views (4 tests). The API can only read the views, and writing through one is turned down. The
  staff views read as whoever asks, and `records_public` filters before it shows anything. The
  `observations` view is gone, and nobody can run the review trigger through the API.
- Sensor nodes (2 tests). Only officers and admins see the nodes, and only admins change them.
- Species photos in Storage (5 tests). The bucket stays public and takes the same images as
  `record-photos`. Officers and admins add, replace and delete species photos, and nobody else can.
  These rules don't reach the private `record-photos` bucket, and anyone can see species photos.
- Changes with no filter (5 tests). Through the API an update or a delete can come without a
  filter. One that doesn't read the table only meets the update or delete rules, not the read
  rules, so these tests check those rules hold by themselves. Only admins change a role, a botanist
  only fixes their own waiting records, visitors, researchers and former botanists change no
  records, only officers and admins delete them, and species, sensor nodes and species photos stay
  as they are.
- Running 006 again (1 test). It ends up the same as the first time.

To check the tests catch real bugs, we broke 006 on purpose 74 ways, one change at a time, and
undid each change once its run was over. The first run had 69 changes and the tests missed one:
letting officers change roles. Every role change in the tests had a filter (`WHERE id = ...`),
and an update with a filter also has to get past the read rules, which hid other people's
profiles from officers. So we added the 5 tests with no filter, and 5 more changes aimed at the
same gap. In the end every one of the 74 made at least one test fail:

Roles and profiles:

1. Took the researcher role out.
2. Left the API with every privilege Supabase gives it on profiles by default.
3. Gave people who aren't signed in the right to read profiles.
4. Let names in profiles be changed through the API.
5. Took away the right to change a role, from admins too.
6. Let officers read every profile.
7. Let admins change their own role, with the check taken out of `USING` only.
8. Let admins change their own role.
9. Let officers change roles.
10. Let anyone signed in change the roles of other users.
11. Made the policy that lets admins read every profile without dropping it first, so a second run
    of 006 failed.

Species:

12. Took away the right to read the species table, so officers and admins couldn't find a species
    to edit or delete.

Records:

13. Let signed in users change every column of a record.
14. Let signed in users change `reviewed_by`.
15. Took away the right to delete records, from officers and admins too.
16. Let botanists read every record, through the officers' policy.
17. Let field staff read every record, through their own policy.
18. Let users who aren't field staff any more read the records they uploaded.
19. Let botanists edit their records after review, with the check taken out of `USING` only.
20. Let botanists delete records.
21. Let botanists edit records they didn't upload, with the check taken out of `USING` only.
22. Let former botanists edit their records, with the role check taken out of `USING` only.
23. Let former botanists edit their records.
24. Let researchers delete records.

Reviews:

25. Stopped counting a change to the review notes as a review.
26. Stopped counting a status change as a review.
27. Took the role check out of the review trigger.
28. Gave the review error the wrong code (`P0001` instead of `42501`).
29. Stopped the trigger filling in `reviewed_by`.
30. Stopped the trigger filling in `reviewed_at`.
31. Made the review trigger turn down status changes made in the SQL editor.
32. Made the review trigger run after the update, so it couldn't fill in who reviewed the record.
33. Made the review trigger without dropping it first, so a second run of 006 failed.
34. Let the API run the review trigger function.

Views:

35. Didn't drop the `observations` view.
36. Let Data Deficient plants show their exact spot.
37. Let Vulnerable plants show their exact spot.
38. Made Near Threatened plants only show a square.
39. Let plants protected in Sarawak show their exact spot.
40. Let plants the species table doesn't have show their exact spot.
41. Worked out the latitude's square with `round` instead of `floor`.
42. Worked out the longitude's square with `round` instead of `floor`.
43. Gave the corner of the square instead of the middle (latitude).
44. Gave the corner of the square instead of the middle (longitude).
45. Gave a square the phone's accuracy instead of 440 m.
46. Let an exact spot show when the phone took it (`capturedAt`).
47. Gave a record with no location a `gps` with empty values instead of `null`.
48. Added the notes to `records_public`.
49. Added the name of whoever recorded the plant to `records_public`.
50. Let records waiting for review show in `records_public`.
51. Left records whose species the species table doesn't have out of `records_public`.
52. Took `security_barrier` off `records_public`.
53. Made `records_public` read as whoever asks.
54. Made `species_staff` read as its owner.
55. Made `records_staff` read as its owner.
56. Took the role filter off `records_staff`, so botanists saw their own records in it.
57. Left the API with every privilege Supabase gives it on the views by default.
58. Let the API add rows through the public views.
59. Gave people who aren't signed in the right to read the staff views.

Sensor nodes:

60. Let anyone signed in see the sensor nodes, through a separate policy.
61. Let anyone signed in add, change and remove sensor nodes, through a separate policy.
62. Left the API with every privilege Supabase gives it on the sensor nodes by default.
63. Let botanists see the sensor nodes.
64. Let officers add, change and remove sensor nodes.

Species photos:

65. Changed the species photo size limit to 50 MB.
66. Let the species photo bucket take PDFs.
67. Let anyone signed in upload species photos, through a separate policy.
68. Took the role check out of the species photo upload policy.
69. Let the species photo upload policy reach every bucket.
70. Let anyone signed in replace species photos, with the role check taken out of `USING` only.
71. Let the species photo replace policy reach record photos, with the bucket check taken out of
    `USING` only.
72. Let species photos be moved to another bucket.
73. Let anyone signed in delete species photos.
74. Let the species photo delete policy reach record photos.

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| The hosted project | When we checked on 16 Oct 2026 it had 001 and 002 run, but not the rest | Run 003, 004, 005, 006 and 007 in the SQL editor, one file at a time, in that order, without stopping after 004 (see [supabase/README.md](../../supabase/README.md)). The website's species pages need 006 and 007 as well as 004. Then check the Policies page lists "Admins change the roles of other users" on `profiles`, and Database, Triggers lists `fill_in_review` on `records` |
| Supabase's own Postgres | PGlite runs Postgres 18.3 and Supabase projects run 15 or 17. 006 doesn't use anything newer than 15 (`security_invoker` came in 15), but the tests haven't run there | Run the tests against a local Supabase (`supabase start`, which needs Docker), or repeat the main checks on the hosted project |
| Through the Supabase API | The tests run SQL as the same roles the API uses, but not through the API itself | Once 006 and 007 are on the hosted project, sign in to the website as an officer and add, edit and delete a test species, then do the same as an admin |
| The Storage API | The size and file type limits on `botanical-photos` are checked by Supabase's Storage server, not by Postgres, so the tests only check the bucket settings and the policies | When item 18 adds species photo upload, try a real photo, an 11 MB file and a PDF, and check only the photo goes in |
| Locations inside species photos | A photo can keep where it was taken in its EXIF data, and the species photos bucket is public. Storage policies can't look inside a file | Take the EXIF data out before a species photo goes up, when item 18 adds species photo upload |
| Deleting record photos | No policy lets anyone delete a record photo through the API yet, so deleting a record leaves its photos in `record-photos` | Item 17 (editing and deleting records on the website) adds a delete rule for record photos, and deletes them with the record |

### Security check

`npm audit` on 16 Oct 2026.

**SQL tests:** 0 vulnerabilities. No new packages, only `@electric-sql/pglite` from item 3.

**Website:** no new packages. Nothing found with `--omit=dev`, and the dev tools have the same 5
high that the item 13 and 15 results describe. Don't run `npm audit fix --force`.

**Mobile:** not changed in this item.

**Keys.** The URL and the anon key are only in `web/.env.local` and `mobile/.env`, which git
ignores. No real key is in the repo, and the tests and CI don't need one.

**Who can do what.** Three layers work together, so one mistake in a policy doesn't open
everything up:

- Grants decide which tables, views and columns the API can touch at all. The API can only read the
  views, and a signed in user can only change the role in a profile and 11 columns in a record.
- Row Level Security decides which rows each user can read and change.
- The `fill_in_review` trigger decides who can review a record, because Row Level Security can't
  see what a change is changing. Only the trigger can run it, so nobody can call it through the
  API.

**Locations.** All the test records use made up spots near the park HQ. The public only sees the
exact spot of plants that are LC or NT and not protected in Sarawak, and only once an officer
publishes the record.
