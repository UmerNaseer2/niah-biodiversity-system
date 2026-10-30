# Dashboard overview test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `dashboard-real-data`
branch. The pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), with the stand-in's own sample records and test accounts, not the hosted project.

## What changed

The overview (`/dashboard`) was the last records page still on mock data. It now reads Supabase
like the records, reports and maps pages.

- **Today's date** comes from the clock in park time (`parkNow()` in `web/src/lib/format.ts`)
  instead of a made up date. The page reads the cookies to sign in, so it's drawn for each request
  and the date can't get stuck on the day the site was built. The greeting says good morning,
  afternoon or evening by the park's clock.
- **Needs you today** says how many records are waiting for review, names up to three of them and
  links to the records page filtered to waiting ones. With none waiting it says so. The sensor
  alerts under it are still mock data.
- **Counts** for species, public records and records waiting come from `species_staff` and
  `records_staff`. Sensors online is still mock data. A count that doesn't load says "Didn't load"
  instead of showing 0.
- **Latest records** lists the 8 newest records from `records_staff`, with links to each record's
  edit page, and a link to the records page when there are more.
- **The sidebar's waiting badge** on Review queue now counts the waiting records in `records_staff`
  instead of the mock records. If the count fails the badge is left off.
- **The wireframe banner and the site description** now say only some staff screens show sample
  data, not the whole site.
- The CSV route (item 21) uses the same `parkNow()` for the date in its file name, instead of its
  own copy of the time zone sum.

If the records don't load, the page says so at the top and leaves them out, instead of showing
zeros that look real.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass, all 22 routes. Only the two font warnings `web/README.md` explains |

The website has no unit tests yet. Nothing in the database or the phone app changed.

## Manual tests (stand-in)

The site ran with `npm run dev`. A throwaway script signed in through the real login form, then
loaded each page. It only printed status codes, headings and the overview's visible text.

| Test | Result |
| --- | --- |
| Test officer: the overview gives 200, shows the date in park time and greets them by first name | Pass |
| The waiting item says 1 record is waiting and names the stand-in's Tapang record by its tag, and its button goes to `/dashboard/records?status=waiting` | Pass |
| Counts: 7 species, 8 public records and 1 waiting, the same as the species page, the records page and the report | Pass |
| Latest records shows the 8 newest of the stand-in's 10, newest first, with a rejected and a waiting one marked, and "See all 10 records" under it | Pass |
| A record with no species shows "No species yet" under its name | Pass |
| The sidebar badge on Review queue says 1 waiting, the same as the page | Pass |
| The map still shows 9 plant dots (the rejected record is left off) and the 5 mock sensors | Pass |
| Test visitor: the overview says No access, and the CSV route still gives 403 | Pass |
| Every other page in the smoke test (public pages, records, reports, CSV, species, sensors, users) still gives the same status and heading as before | Pass |
| No errors in the dev server log | Pass |

The only browser console errors were the dev server's live reload socket failing to connect,
which only happens with `npm run dev` and isn't part of the site.

## Not tested yet

- The hosted Supabase project, which needs 003 to 009 run first.
- A records table bigger than 1000 rows. Hosted Supabase only sends 1000 rows per request, so the
  counts would stop at 1000 until the pages read the rows in pages.
  **Fixed on 29 Oct:** the pages read the rows a page at a time now, and a stand-in that sends 3
  rows per request gives the same counts (see `read-past-row-cap.md`).
- What the page looks like when the records fail to load. The stand-in can't be told to fail one
  view, so only the code path was read, not tried.
