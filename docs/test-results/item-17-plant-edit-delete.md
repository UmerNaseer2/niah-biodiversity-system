# Item 17 test results: plant record editing and deletion (web)

Round 1 was on 28 Oct 2026 on Angel's Windows PC (Node 22) on the `item-17-plant-edit-delete`
branch. The hosted Supabase project doesn't have the SQL files after 002 yet, so the pages were
tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see `web/README.md`). It
builds the same database as the SQL tests, so Row Level Security, the column grants and the
views from our SQL files decide what comes back.

## What it does

- **Records list** (`/dashboard/records`): every record from `records_staff`, newest first, with
  tabs for waiting, published and rejected. Officers and admins only, like the rest of the
  dashboard.
- **Edit** (`/dashboard/records/[id]/edit`): species, common name, height, condition, when it was
  recorded, location and notes. The tag, who recorded it, who uploaded it and the status don't
  change here, because the database doesn't let anyone change them. Status is item 19.
- **Delete** (`/dashboard/records/[id]/delete`): a separate page that says what goes with the
  record, then a danger button. It goes back to the list with a banner.
- **`supabase/008_record_edits.sql`**: adds `records.updated_at`, which a trigger sets when a
  record is edited, and makes `records_staff` show it. Officers and admins could already change
  and delete any record (policies from 004 and 006), so no policy changed.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Hard or soft delete | Hard delete | It's what the database already does, and soft delete would touch the public views and the phone's sync |
| Editing a published record | It stays published, and `updated_at` moves | Putting it back in the review queue belongs with item 19 |
| Photos when a record is deleted | Nothing removed | Record photos aren't uploaded yet (item 11), and storage has no delete policy for them (005) |

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 136 of 136. 8 are new: officers and admins editing in any status, `updated_at` moving, `updated_at` staying put when nothing changed, nobody setting it through the API, and `records_staff` showing it. The run-the-files-again test now includes 008 |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass. The three new routes are built on each request |

One thing the tests caught: `tag_code` is a generated column, which Postgres fills in after a
`BEFORE` trigger runs, so comparing the whole row made every save look like a change. The trigger
leaves `tag_code` out of the comparison.

## Manual tests (stand-in, signed in as the test officer)

| Test | Result |
| --- | --- |
| Records list shows all 10 records and the status counts | Pass |
| "Edited" says "Not yet" for a record nobody has changed | Pass (it first showed the upload time for every record, fixed) |
| Edit page fills in from the record, with the time in park time | Pass |
| A height of `abc` is turned down with a summary and a message on the field | Pass |
| A height of `9,5` saves. Species changed to a name on the list now links to it (the "No species yet" label goes) | Pass |
| After saving, the recorded time is the same and "Edited" shows the time | Pass |
| Delete page, then Delete record, goes to the list with "Record NNP-D00D04 was deleted" and the count drops | Pass |
| Opening the delete page of the deleted record gives a not found page | Pass |
| Signed in as the test botanist, the list, edit and delete pages all say "No access" | Pass |
| Signed in as the test admin, the edit page opens | Pass |
| Location: a latitude of 95 with the longitude cleared is turned down with both messages | Pass |
| Location: a valid spot saves and is still there after reloading | Pass |
| Location: clearing all three boxes saves a record with no location | Pass |
| At 375 px wide, the list and edit pages don't scroll sideways (the table scrolls inside its box) | Pass |

## Not tested yet

- A visitor or researcher signing in. They take the same "No access" path as the botanist, but
  that wasn't run.
- The pages with JavaScript turned off. The forms use the same pattern as the species forms,
  which are meant to work without it.
- Keyboard-only use and a screen reader.
- The pages against the hosted project, which needs 003 to 008 run first.

## Known limits

- **A phone that hasn't synced a record uploads it again** if an officer deletes it first. This is
  already in `docs/sync-design.md` under "Known limits", and the delete page says so. A synced
  record stays deleted.
- **No history.** Nothing records who edited or deleted a record.
- **Fixed on 29 Oct:** two people editing the same record or species used to mean the last save
  won. Now a save that comes after someone else's is refused and the form says so. See
  [edit-conflicts.md](edit-conflicts.md).
