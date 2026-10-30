# A deleted record coming back: test results

Tested on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `deleted-records` branch. The
SQL was tried on PGlite (`supabase/tests/`) and the Supabase stand-in in
`supabase/tests/stand-in.js`, not against the hosted project.

Round 2, on 30 Oct on the `phone-remove-deleted` branch, let the phone remove its own copy. Round 3,
the same day, fixed what a review of round 2 found.

## What changed

Item 17 and `docs/sync-design.md` both had this known limit: if an officer deleted a record
before the phone had marked it synced, the next sync uploaded it again. Say Aina's phone sent a
record, but the signal dropped before the answer came back. An officer then deleted the record on
the website because it was a duplicate. At Aina's next sync, the phone sent it again and it came
back as a new record waiting for review.

Now:

- `supabase/010_deleted_records.sql` adds a `deleted_records` table with the ID of every deleted
  record, who deleted it and when. Nothing else about the record is kept, so no species, notes or
  location stays behind.
- A trigger adds the ID whenever a record is deleted, from the website, the API or the SQL editor.
- Another trigger turns down an upload with one of those IDs. The error is the same kind Postgres
  gives for an ID that's taken (`23505`), but it names `deleted_records_pkey`, so the phone can
  tell it apart from `records_pkey`, which means the record went up before.
- Only officers and admins can read the list, and nobody can change it through the API.
- Someone in the SQL editor (where nobody is signed in) can still put a deleted record back on
  purpose. The ID then comes off the list, so the phone that recorded it is told it's synced.
- The phone has a fourth upload problem, `deleted`. The record stays on the phone and its page
  says: "An officer deleted this record on the website, so the server won't take it again. It's
  still on this phone. Ask an officer if you think it should be put back, or remove it from this
  phone if not." Round 2 added the last part and a button for it.
- The phone's database had a rule listing the problems, and SQLite can't change that rule on a
  column, so step 4 in `mobile/src/db/database.ts` makes the records table again with the new rule
  and copies every record across.
- The website's delete record page now says the server turns the record down instead of saying
  it comes back.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL tests | `cd supabase/tests && npm test` | 176 of 176 pass |
| Phone tests | `cd mobile && npx jest` | 323 of 323 pass |
| Phone types and lint | `cd mobile && npx tsc --noEmit && npm run lint` | Pass |
| Website lint, types and build | `cd web && npm run lint && npx tsc --noEmit && npm run build` | Pass |

The new SQL tests are in `supabase/tests/sync.test.js`, under "a record an officer deleted". They
check that:

- deleting a record keeps only its ID, the time and the officer who deleted it
- uploading it again as a botanist or an officer is turned down with `23505` and
  `deleted_records_pkey`
- a botanist can't delete a record, so nothing goes on the list
- only officers and admins can read the list. A botanist or visitor sees nothing, and someone
  not signed in is refused
- nobody can add to, change or empty the list through the API, or call the trigger functions
- putting the record back in the SQL editor takes it off the list, and the next upload gets
  `records_pkey`, so the phone marks it synced
- running 010 again, or 002 after it, keeps the list
- 010 stops on its first line if 009 hasn't been run

The new phone tests check that `classifyUpload` reads `deleted_records_pkey` as `deleted`, that
every problem has a message, and that a phone on version 3 with records (one with a problem, one
waiting with a location and one synced) keeps all of them unchanged after step 4. After step 4 the
`deleted` problem saves, and the old rules on synced records, tag codes, locations and column
types still hold.

## Manual tests (stand-in)

The stand-in was started again so it built its database with 010. The records were throwaway ones
added through the stand-in's API, so the sample data wasn't touched.

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | Uploaded a record as the test botanist through the API, then sent it again | The second try gets `409`, `23505` and `records_pkey`, which the phone reads as synced | Pass |
| 2 | Deleted it as the test officer through the API | Deleted, and the officer sees one row for it in `deleted_records` with themselves as `deleted_by` | Pass |
| 3 | Read `deleted_records` as the botanist | No rows | Pass |
| 4 | Uploaded it again as the botanist | `409`, `23505` and `deleted_records_pkey`, which the phone reads as `deleted` | Pass |
| 5 | Deleted another record on the website's delete page, posting the form the way a browser without JavaScript does, then uploaded it again | Turned down with `deleted_records_pkey` | Pass |
| 6 | Opened a record's delete page as the officer | The last bullet says the server turns it down at the next sync and the phone says an officer deleted it | Pass |

## Round 2: removing it from the phone

Tested on 30 Oct 2026. A record the server turned down because an officer deleted it used to stay
in My records for good, still counted as waiting. Now its page has a "Remove from this phone"
button under the message. Tapping it asks first, since the server doesn't have the record either,
so it's gone for good after that. "Keep it" puts the button back and "Remove it" takes the record
off the phone and goes back to My records. The phone only takes off a record with the `deleted`
problem, so a record that still has to go up can't be lost this way, even if the screen asked for
it.

| Check | Command | Result |
| --- | --- | --- |
| Phone tests | `cd mobile && npx jest` | 330 of 330 pass |
| Phone types and lint | `cd mobile && npx tsc --noEmit && npx expo lint` | Pass |

The new phone tests check that:

- the store takes off a record with the `deleted` problem and leaves the rest, and it's still
  gone after the database is opened again
- it turns down a record with another problem, one with no problem, a synced one and an ID that
  isn't saved, and nothing changes
- the records list drops it and the waiting count goes down by one, and for any other record it
  throws and the list stays the same
- the record's page only shows the button for the `deleted` problem, "Keep it" changes nothing,
  and "Remove it" goes back to My records with one record fewer

Not tried on a real phone yet. The web build of the phone app keeps records in memory and can't
get a `deleted` answer without item 10's sync, so the button was only checked in the tests.

## Round 3: fixes from the review

Tested on 30 Oct 2026, one branch per fix.

| Branch | What was wrong | Now |
| --- | --- | --- |
| `phone-outcome-after-remove` | A record with the `deleted` problem is still tried again, so it can be removed while its request is on the way. When the answer came back there was no row to mark, and that threw an error, which would stop the rest of the sync | With no row there's nothing to mark, so it does nothing. A real database failure still throws. `docs/sync-design.md` has the note for item 10 |
| `phone-remove-flow` | Two quick taps on "Remove it" could both land before the button showed as disabled, and the second said removing it failed even though it had worked. "Keep it" left an old failure showing for next time. A screen reader wasn't told the question had appeared, and the button that had focus was gone by then | Only the first tap runs, "Keep it" clears the failure, and the question is read out when it appears |
| `phone-test-gaps` | The GPS check only tried one edge of the globe. The button was only checked against one other problem. The web version of the records store had no tests. The test for a removal lasting after a reopen looked like it showed more than it could | 90 and 180 are tried, along with points just past them. The button is checked against every other problem. The web store is checked against the phone's rules and messages. The test says what it can't show, since the stand-in for SQLite keeps the database in memory |

| Check | Command | Result |
| --- | --- | --- |
| Phone tests | `cd mobile && npm test -- --watchAll=false` | 364 of 364 pass, in 19 suites |
| Phone types and lint | `cd mobile && npx tsc --noEmit && npx expo lint` | Pass |

The new tests for `phone-remove-flow` were checked by taking each fix out on its own. The double
tap, Keep it and read out tests each failed without their fix and passed with it.

Still not tried on a real phone or with a real screen reader. The announcement was only checked in
the tests, and a real sync can't happen until item 10.

## Known limits

- **Fixed on 30 Oct:** the phone couldn't remove its own copy, so the record stayed in My records
  with the message for good. Now its page has a button to remove it. See round 2 above.
- **Only the ID is kept.** A deleted record can't be looked at again from the list. Putting one
  back needs the whole record from somewhere else, like the phone that recorded it.
- **A delete in the Table Editor counts too.** It goes on the list with no `deleted_by`. To let a
  phone upload it again, delete its row from `deleted_records` in the SQL editor.

## Not tested yet

- The hosted Supabase project, which needs 003 to 010 run first.
- A real phone syncing, which comes in item 10. The phone side here is how it reads the answer and
  stores the problem, and the tests run it on sql.js.
- Step 4 on a real phone with a large number of records. It copies them in one transaction, so a
  failure part way leaves the table the way it was.
