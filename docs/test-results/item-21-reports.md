# Item 21 test results: biodiversity reports generation and export

Round 1 was on 29 Oct 2026 on Umer's Mac (Node 22) on the `item-21-reports` branch. The hosted
Supabase project doesn't have the SQL files after 002 yet, so the pages were tried against the
Supabase stand-in in `supabase/tests/stand-in.js` (see `web/README.md`), with the stand-in's own
sample records and test accounts.

## What it does

- **The reports page** (`/dashboard/reports`) now counts the real plant records from
  `records_staff` and `species_staff` instead of the mock records. It shows four totals (records,
  species recorded, threatened or protected, and damaged, diseased or dead), then bar charts by
  IUCN status, by condition and by species, and a month by month table split by condition.
- **Filters** at the top pick published records only (the default) or published and waiting for
  review, and a date range. They're a plain GET form, so a filtered report has its own link.
  Rejected records never count.
- **Print or save as PDF.** The button opens the browser's print dialog. The print styles hide the
  sidebar, the wireframe banner, the filters and the download section, keep the bar colours and
  lay the charts out two to a row.
- **Download CSV** gets the same records as the report, one row each, with 16 columns. The file is
  built on the server in `dashboard/reports/csv/route.ts`, which checks the person is an officer or
  admin again before it sends anything. Signed out people get sent to the sign in page, and
  anyone else gets a 403 with a short message.
- **Exact spots are off by default.** Rows of threatened and protected plants, and plants not
  matched to a species yet, say "Hidden" with blank coordinates. Ticking "Include exact spots"
  shows a warning to only share the file with SFC staff, and the server logs which account
  downloaded a file with exact spots.
- **A preview** under the download shows the first 20 rows the file will have, with each row's
  status, condition and whether its location will be exact or hidden. The page itself never gets
  any coordinates.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Rejected records | Left out of every count and the file | They aren't plants we know are there. The overview map leaves them off for the same reason |
| Records waiting for review | Left out unless the filter asks for them | The default report should only have records an officer has checked |
| Plants not matched to a species | Counted as "Not matched to a species yet", and their spot is hidden | Nobody knows yet if they're threatened, so they get the safe rule, the same as the public tag pages |
| How the PDF is made | The browser's print dialog with print styles | No PDF library to add, the charts are HTML tables so they print sharp, and every browser can save a print as a PDF |
| Where the CSV is built | A route handler on the server | Before this the page built the file in the browser, so every record's exact spot was in the page. Now the page gets no coordinates, and the role is checked again when the file is asked for |
| How the download is sent | A GET form to the route, with the filters and `exact=1` in the query | The browser downloads the file and stays on the page. The query only has the filters and a flag, never anything personal |
| How the file opens in Excel | UTF-8 with a BOM, CRLF line ends, and a `'` in front of any cell starting with `=`, `+`, `-`, `@` or a tab | Without the BOM Excel garbles names. The `'` stops a note typed in the field running as a formula |
| Charts | Bars drawn inside a table, one colour, the number at the end of each bar, zeros kept | A screen reader reads it as a table, it prints, and a zero still shows up as a row |
| Month by month | A table, not a chart | There are only a few months with four conditions each, which reads better as numbers |
| Dates | Park time (UTC+8) for the filter and the file name | A record made late at night in the park should land on the day the team was there |

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Build | `cd web && npm run build` | Pass, `/dashboard/reports/csv` builds as a dynamic route |
| Types | `cd web && npx tsc --noEmit` | Pass |
| CSV cells | A throwaway script that runs `csvCell` from `lib/reports.ts` on 12 inputs (formulas, commas, quotes, new lines, a negative number, an empty value) | 12 of 12 pass |

The website has no unit tests yet. Nothing in the database changed in this item, so the database
tests weren't touched.

## Manual tests (stand-in)

| Test | Result |
| --- | --- |
| Signed in as the test officer, published only: 8 records made between 26 Sep 2026 and 11 Oct 2026, 7 species, 1 record not matched, 6 threatened or protected, 1 damaged, diseased or dead | Pass |
| By IUCN status: CR 0, EN 1, VU 2, NT 1, LC 3, DD 0, NE 0, not matched 1, adding up to 8 | Pass |
| By condition: Healthy 7, Dead 1. Month by month: Sep 3, Oct 5 | Pass |
| Published and waiting: 9 records, with 1 waiting for review (NNP-D00D03, diseased). October becomes 6 (4 healthy, 1 diseased, 1 dead) | Pass |
| The stand-in's rejected record doesn't appear in any count, the preview or the file | Pass |
| Filtering 1 Oct to 5 Oct 2026 gives 3 rows in the file, and the same 3 with the dates the wrong way round | Pass |
| The filter form goes to `?scope=all&from=2026-10-01&to=`, shows 6 records and a Clear link, and the download form carries `scope=all` and `from=2026-10-01` | Pass |
| No coordinates anywhere in the page's HTML or its data for the browser. The only decimals are bar widths | Pass |
| CSV without exact spots: status 200, `text/csv`, downloaded as an attachment, `private, no-store`, BOM and CRLF, 16 columns, 8 rows with 7 Hidden and 1 Exact (the stand-in's Least Concern tree) | Pass |
| CSV with exact spots and waiting records: 9 rows, all Exact, the file name ends in `-exact-spots`, and the server log has a line with the account's id | Pass |
| Ticking "Include exact spots": the warning shows, the preview's Hidden rows switch to Exact, and the screen reader status says how many records are downloading | Pass |
| Signed out: both `/dashboard/reports` and `/dashboard/reports/csv` send a 307 to `/login` | Pass |
| Botanist, researcher, visitor and an account with no profile: the CSV route gives 403 with the message, and the page says No access | Pass |
| Test admin: the CSV route gives 200 with 9 rows, and the page shows the report | Pass |
| Print styles turned on in the page: the sidebar, banner, filters, print button and download section are hidden, and the charts and month table fit the page | Pass |
| Phone width (375 px): no sideways scrolling, the filters wrap, the totals sit two by two, and only the preview table scrolls inside its own box | Pass |
| No errors in the browser console after a fresh load of the report | Pass |

## Not tested yet

- A real print to PDF. The print view was checked by turning the print styles on in the page, not
  through the print dialog, and Safari and Firefox weren't tried.
- Opening the file in Excel and Google Sheets. The BOM, line ends and quoting were checked in the
  bytes of the file.
- A screen reader. The chart tables, headings and the download status were checked in the page,
  but not read out.
- The page against the hosted project, which needs 003 to 009 run first.
- A big park's worth of records. The stand-in has 10.

## Known limits

- **Exact spot downloads only go to the server log.** There's no table in the database that keeps
  who downloaded what, and hosted logs aren't kept for long. A proper audit table would be a later
  item.
- **The preview stops at 20 rows.** The file always has every row, and the page says how many more
  there are.
- **Counting happens on the web server.** The page loads every record and counts them in
  `lib/reports.ts`. That's fine for hundreds of records, but thousands would be better counted in
  the database.
- **The sidebar's waiting badge still comes from the mock records** in `dashboard/layout.tsx`, so
  it can disagree with the report's waiting count until the review queue is real (item 19).
- **The wireframe banner still says the site uses mock data.** It's hidden when printing, but the
  wording is out of date now that most pages read Supabase.
