# Edit history: test results

Tested on 30 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `record-history` branch. The SQL
was tried on PGlite (`supabase/tests/`) and the website on the Supabase stand-in in
`supabase/tests/stand-in.js`, not against the hosted project.

## What changed

Items 17 and 18 had the same known limit: nothing recorded who edited a record or a species, or
who added or removed a photo. If a record's condition changed from Healthy to Dead, nobody could
tell who did it, when, or what it said before.

Now:

- `supabase/013_edit_history.sql` adds two tables, `record_history` and `species_history`. A
  trigger adds a row every time a record or species is saved with a change in it. The row has who
  saved it, when, and what each changed column was before and after.
- The map location never goes in. For `records.gps` and the species' spots the row only says
  whether there was a spot before and after. Text like notes is kept word for word, so a place
  someone typed stays in it, the same as the notes themselves. Only officers and admins can read it.
- The name is kept as well as the account, so the history still says who it was after their
  account is deleted. A row with no name was saved in the Supabase dashboard (the Table Editor or
  the SQL editor), where nobody is signed in.
- A save that doesn't change anything adds no row. Columns the database fills in on its own (when
  it was last changed, the tag, and who reviewed it and when, which come from the same person and
  time as the row) are left out.
- Officers and admins can read it, the same people who can edit. Nobody can add, change or remove
  a row through the API, only the triggers add to it.
- A record's or species' history goes when it's deleted, the same as 010, so nothing about a
  deleted plant stays behind.
- The record and species edit pages have a History section at the bottom, newest first. Each
  change gets a line like "Condition changed from Healthy to Damaged". Notes, summaries and other
  long text open to show before and after. For photos it says which one was added, removed or
  had its caption, credit or main photo changed.
- It shows the newest 50 changes, and says so when there are more.
- If the history doesn't load (say 013 hasn't been run yet), the section says so in a red box,
  and the rest of the edit page still works.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL tests | `cd supabase/tests && npm test` | 212 of 212 pass |
| Website lint, types and build | `cd web && npm run lint && npx tsc --noEmit && npm run build` | Pass |

The new SQL tests are in `supabase/tests/history.test.js`. They check that:

- an officer's edit adds a row with their name, the time and only the columns that changed
- a record's location never goes in, only whether it had one, when it moves, is taken off or is
  added back
- a review keeps the status and review notes, without who reviewed it and when again
- a save that changes nothing adds no row
- a botanist fixing their own waiting record is in the history too
- a change in the SQL editor has no name
- a species' edit, photos and spots work the same way, and its spots never go in
- deleting a record or species deletes its history
- only officers and admins can read it, botanists, researchers and visitors get nothing, and people
  who aren't signed in are turned down
- nobody can add to it, change it or empty it through the API, or call its functions
- a row keeps the name after the account is deleted
- running 013 again keeps the history and each trigger still runs once, and 002 still runs after it
- 013 stops and changes nothing if 012 hasn't been run

`supabase/tests/sync.test.js` had one test that takes the records' ID rule off and puts it back.
013's link from the history to the record needs that rule, so the test now takes the link off with
it.

## Manual tests (stand-in)

The stand-in was started again so it built its database with 013. The cookie helper in the
scratchpad signed in the test officer.

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | Opened a sample record's edit page before changing anything | History says nobody has changed it since the history started | Pass |
| 2 | Changed the record's height, condition and notes, and saved | A new entry with Aina Officer and the time, saying the height and condition changed from and to what, and "Notes changed" | Pass |
| 3 | Opened "Notes changed" | Before and After, with the line breaks kept | Pass |
| 4 | Moved the record's location a little and saved | A new entry saying "Location changed", and no numbers from the location anywhere on the page | Pass |
| 5 | Changed the summary of a sample species (belian) and saved | An entry saying "Summary changed", which opens to show before and after | Pass |
| 6 | Changed the caption of belian's photo | An entry saying the photo caption changed, from what to what | Pass |
| 7 | Looked at the History section at phone width (375 px) | Everything fits, with no scrolling sideways | Pass |

Test 5 also said "On the public map changed from Exact spot to Rough area only". That's right:
belian is threatened, and the species form saves a threatened species as rough area only (since
007), which the sample data didn't have yet. The history shows what the database did, not only
what the officer typed.

**Fixed on 30 Oct:** that line was true for the database, but it told the officer the public map
changed when the public rule already hid the species. 015 turns the switch on for these species
without a history line, and keeps it on, so the line only shows when the status really changes.

## Known limits

- **The history only starts once 013 is run.** Changes before that aren't in it, and the
  section says so.
- **Deleted records and species take their history with them.** That keeps the promise from 010
  that nothing about a deleted plant stays behind, but it means the history can't show what a
  deleted record said. The server still keeps who deleted it and when.
- **Record photos from the phone aren't in it.** They're files in Storage, not columns, and the
  website can't change them one at a time. Species photos are in it, since they're a column.
- **It can't undo a change.** An officer can read what a field said before and type it back.

## Not tested yet

- The red box when the history doesn't load. It needs the stand-in started without 013.
- The hosted Supabase project, which needs 003 to 013 run first.
