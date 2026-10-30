# Reading past 1000 rows test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `read-past-row-cap` branch.
The pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), with the stand-in's own sample records and test accounts, not the hosted project.

## What changed

Hosted Supabase sends at most 1000 rows for one request (Max rows in the API settings), whatever
the query asks for. Several pages read every row of a view and count or list them on the
website, so past 1000 records they would quietly come out short, with no error to show it.

- **`readAll()`** in `web/src/lib/supabase/read-all.ts` asks for the rows a page at a time and
  uses the count Supabase sends back to know when it has them all. That way it still works if
  Max rows is ever set lower than 1000. Each query sorts by the id last, so rows can't swap places
  between pages.
- **The pages that use it:** the dashboard overview, the records list, the species list and its
  record counts, the delete species page, the add species page (for the name check), the report
  and the CSV, and on the public side the plant list counts, a plant's records and the species
  photos.
- **The stand-in** now sends at most 1000 rows for one read too, like Supabase. `maxRows` (or
  `STAND_IN_MAX_ROWS` for `npm run stand-in`) makes that smaller, so a long list can be tried
  with the 10 sample records.

Small lists still take one request, since a page holds 1000 rows. Nothing in the database or the
phone app changed. The phone app only uploads, so it doesn't read lists.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Supabase tests | `cd supabase/tests && npm test` | Pass, 168 tests |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass, all 22 routes. Only the two font warnings `web/README.md` explains |

The new stand-in test starts a second stand-in with `maxRows: 3`, signs in as the officer and
checks that a read of `records_staff` gets 3 rows even when it asks for 999, that the count still
says 10, and that reading 3 at a time with `offset` gets all 10 rows once each.

## Manual tests (stand-in)

The site ran with `npm run dev`. A throwaway script signed in as the test officer through the real
login form, opened the pages below, and saved their text. It never printed the password.

Pages: `/dashboard`, `/dashboard/records`, `/dashboard/species`, `/dashboard/reports`,
`/dashboard/reports/csv`, `/dashboard/species/new`, the delete page for Standinia exacta,
`/plants`, and the plant pages for Standinia exacta and Belian.

| Test | Result |
| --- | --- |
| Saved the pages with a fresh stand-in that sends up to 1000 rows | All 200 |
| Saved them again with a fresh stand-in started with `STAND_IN_MAX_ROWS=3` | All 200, and the text is the same as the 1000 row run, word for word |
| Before the fix: the old pages with the same 3 row stand-in | The overview said 1 public record instead of 8, the records list showed 3 of 10, the CSV had 1 record instead of 8, and the plant list showed 3 of 7 plants with some saying "None public yet" |
| Put the normal stand-in back after | Pass |

## Not tested yet

- The hosted Supabase project, which needs 003 to 009 run first.
- A real table with thousands of rows. Each page of 1000 is one more request, so a very big table
  would make these pages slower. Counting in the database (a view or a function) would be quicker
  then, but there are nowhere near that many records yet.
- A record added or removed while a page is reading. It could be counted twice or missed for that
  one page load, and the next load is right again.
