# Record photos after an account is deleted: test results

Tested on 30 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the
`photo-folder-after-account-delete` branch. The SQL was tried on PGlite (`supabase/tests/`) and the
website on the Supabase stand-in in `supabase/tests/stand-in.js`, not against the hosted project.

## What changed

Item 18 had a known limit: deleting an account lost the record photos it had sent. The phone puts
a record's photos in `record-photos/<account ID>/<record ID>/` (005), and the website found that
folder from the record's `submitted_by`. When the account is deleted, `submitted_by` is emptied,
so the record edit page showed no photos and deleting the record left them in the bucket. Until
now the README said to set the person's role back to `visitor` instead of deleting the account.

Now:

- `supabase/014_photo_folder.sql` adds a `photo_folder` column to records. It isn't linked to the
  account, so it stays when the account is deleted.
- A trigger fills it in with the account that sent the record, once `submitted_by` has been set
  to the person signed in (005). The phone can't pick a folder, and nobody can change it through
  the API, since the grants from 005 and 006 only name other columns.
- Records from before 014 get it from `submitted_by`. The edit triggers from 008 and 013 are off
  while that runs, so the records don't look edited and the history doesn't get a row for each.
- Officers and admins read it from `records_staff`, the same as every other column. The public
  view names its columns, so it never shows the folder.
- The record edit page and deleting a record use `photo_folder`. Before 014 is run they fall back
  to `submitted_by`, which is what they did before.
- If a record has photos but no folder, the edit page says the account may have been deleted
  before 014 was run.
- The README now says deleting an account keeps the photos with their records, though setting the
  role back to `visitor` is still the first thing to try.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL tests | `cd supabase/tests && npm test` | 221 of 221 pass |
| Website lint, types and build | `cd web && npm run lint && npx tsc --noEmit && npm run build` | Pass |

The new SQL tests are in `supabase/tests/photo-folder.test.js`. They check that:

- a record uploaded like the phone does gets the account that sent it, and officers and admins
  can read it from `records_staff`
- the folder stays when the account is deleted, while `submitted_by` is still emptied
- the phone can't upload a record with another account's folder
- admins, officers and botanists can't change it through the API, or call its function
- a record added in the SQL editor gets its folder from `submitted_by`, or none if that's empty
- the public view doesn't have it, and researchers and visitors get nothing from `records_staff`
- 014 fills in older records without changing when they were last edited or adding history rows,
  and the edit triggers work again straight after
- a record whose account was deleted before 014 stays empty
- running 014 again keeps the folders, every trigger on records is still on, and 002 still runs
  after it
- 014 stops and changes nothing if 013 hasn't been run

## Manual tests (stand-in)

The stand-in was started again so it built its database with 014. A script in the scratchpad
signed in the test botanist through the stand-in's API and uploaded a record the way the phone
does, with two photos in its folder, at a made up spot near park HQ. The cookie helper signed in
the test officer for the website.

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | Read the new record from `records_staff` as the officer | Its folder is the botanist's account, the same as `submitted_by` | Pass |
| 2 | Opened the record's edit page as the officer | Photos from the field shows both photos, and they load | Pass |
| 3 | Opened the record's delete page | It says its 2 photos are deleted too | Pass |
| 4 | Deleted the record | The record is gone, and so are both photos in its folder | Pass |

The stand-in has no way to delete an account through its API, so the account part ran on a second
stand-in that a script started on a free port, leaving the one the website uses alone. It
uploaded a record and two photos as the botanist, deleted the botanist's account straight in its
database, then made the same calls the website makes as the officer:

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 5 | Read the record after the account was deleted | `submitted_by` is empty, and the folder is still the old account | Pass |
| 6 | Listed the folder and made links to the photos, like the edit page | 2 photos, and both links open a JPEG | Pass |
| 7 | Deleted the record and removed its photos, like the delete button | 1 record deleted, 2 photos removed, nothing left in the folder | Pass |

## Known limits

- **Records whose account was deleted before 014 is run still lose their photos.** Nothing is left
  to say which folder they're in. An admin could find the folder in Storage by the record ID and
  type the account part of it into the record's `photo_folder` in the Table Editor.
- **The folder is still named after the account.** Moving photos to a folder named after the
  record would need the phone to upload them there, which comes with item 10's sync.

## Not tested yet

- Deleting an account on the website itself, since the stand-in can't. It was checked with the
  same calls on a second stand-in instead.
- The hosted Supabase project, which needs 003 to 014 run first.
