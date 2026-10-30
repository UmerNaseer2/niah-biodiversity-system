# Report counts in the database: test results

Tested on 30 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `report-counts-in-db` branch. The
SQL was tried on PGlite (`supabase/tests/`) and the website on the Supabase stand-in in
`supabase/tests/stand-in.js`, not against the hosted project.

## What changed

Item 21 had this known limit: the Reports page loaded every record the filters covered and
counted them on the web server. That's fine for hundreds of records, but the page would get slow
with thousands, and it sent all of them from the database just to show some numbers.

Now:

- `supabase/012_report_counts.sql` adds a `report_counts` function. It takes the same filters as
  the page (published only or waiting too, and the days) and gives back every number the page
  shows: the four tiles, the counts by IUCN status, condition, species and month, the first and
  last record, and how many rows of the file would say Hidden.
- It reads `records_staff` and `species_staff` as whoever is asking, so the views still decide who
  gets anything. Officers and admins get the counts, other roles get zeros, and people who aren't
  signed in can't call it.
- Days are park days (UTC+8), the same as the rest of the page, and rejected records never count.
- The page now loads the counts, the species list and only the 20 rows the preview shows.
- The spreadsheet still needs every row, but its query now asks the database for just the
  records the filters cover, instead of reading them all and dropping the rest on the web server.
- If the counts don't load (say 012 hasn't been run yet), the page shows the box saying the
  records didn't load. Admins still see the list of downloads with exact spots under it, since
  that comes from its own table, and the spreadsheet download still works.
- The stand-in can now call database functions the way `supabase.rpc()` does, as the signed in
  user, so the page can be tried without a real project.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL tests | `cd supabase/tests && npm test` | 196 of 196 pass |
| Website lint, types and build | `cd web && npm run lint && npx tsc --noEmit && npm run build` | Pass |

The new SQL tests are in `supabase/tests/report-counts.test.js`. They check that:

- officers and admins get the counts the page shows, with the same rules for threatened plants
  and hidden spots as the file, and times in park time
- scope all counts records waiting for review too, never rejected ones, and any other scope
  counts published records only
- a record late at night lands on the park day it was made, at both ends of the range and in the
  month counts
- either day can be left out, and days the wrong way round count nothing
- botanists, researchers and visitors get zeros
- people who aren't signed in can't call it
- running 012 again keeps it working
- 012 stops and changes nothing if 011 hasn't been run

`supabase/tests/stand-in.test.js` also checks the stand-in calls a function as whoever is asking,
with only the arguments sent.

## Manual tests (stand-in)

The stand-in was started again so it built its database with 012. The cookie helper in the
scratchpad signed in the test accounts. Before the change, the page was saved for each set of
filters, so the new page could be checked against it.

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | Opened the Reports page as the test admin with 7 sets of filters (none, waiting too, both days, only a From day, only a To day, one day, and a day with no records) | Every tile, chart and month row the same as before the change | Pass |
| 2 | Downloaded the CSV for 5 of those sets | The number of rows and of Hidden rows match what the page says | Pass |
| 3 | Picked waiting too | The preview shows all 9 rows, and the server log shows one call to `report_counts` | Pass |
| 4 | Started the stand-in without 012 and opened the page as the admin | The box saying the records didn't load, with the list of downloads still under it, and the error in the server log | Pass |
| 5 | Opened the page as the test officer, still without 012 | The box, and no list of downloads | Pass |
| 6 | Downloaded the CSV, still without 012 | `200` and the file, with all 9 rows | Pass |
| 7 | Started the stand-in again with 012 and opened the same 7 pages | The same as test 1 | Pass |

## Known limits

- **The spreadsheet still loads every record it covers,** since the file needs them all. It reads
  them in pages, so it isn't stopped by the 1000 row limit.
- **The rules live in two places.** The counts come from the SQL and the file's rows from
  `reportRecords` in `web/src/lib/reports.ts`. The SQL tests and test 2 above check they match,
  but a change to one needs the same change in the other.

## Not tested yet

- The hosted Supabase project, which needs 003 to 012 run first.
- A big park's worth of records. The stand-in has 10, and the tests have 10 more.
