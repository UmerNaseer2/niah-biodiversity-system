# Website polish test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `web-polish` branch. The
pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), with the stand-in's own sample records and test accounts, not the hosted project.

## What changed

A pass over the whole website for smaller problems that the earlier reviews left.

- **Empty sections on a plant page.** A species added on the website has no habitat or uses yet,
  since the add species form doesn't ask for them. Its plant page still showed "Where it grows"
  and "How people use it" headings with nothing under them. A section with no text is now left
  out.
- **Text that was too light.** The login labels, the times under the sensor charts and the
  placeholder name on the species preview card used the pencil colour, which is 3.48:1 on white.
  Small text needs 4.5:1, so they're now ink (the labels) or moss (5.65:1).
- **Field borders.** Text boxes and dropdowns had a border in the line colour, which is only
  1.22:1 on the page, so an empty field was hard to pick out. The border is now pencil (3.22:1
  on the page, 3.48:1 on white), over the 3:1 a part of a control needs. Hovering makes it moss.
- **Error pages.** When a page couldn't load, for example because Supabase didn't answer, the
  site showed the plain Next.js error screen. There are now three of our own:
  - `web/src/app/error.tsx` for the public pages
  - `web/src/app/dashboard/error.tsx` for the staff pages, shown inside the staff layout so the
    menu is still there
  - `web/src/app/global-error.tsx` for when the main layout itself fails

  Each one says it's a problem on our side, has a Try again button and a link back. The error
  message itself isn't shown to the person, it's in the server log.
- **Home page with nothing public yet.** "Recently tagged" was an empty list when no records were
  approved, for example on a fresh hosted project. It now says no plants are public yet and that
  they show up once a conservation officer has checked them.
- **Footer.** It said all the records and people on the site were made up, but the plant pages use
  real species and their real IUCN statuses. It now says the tagged records are test data, not
  results from a real survey.
- **Report preview.** The report page sent every row of the report to the browser, even though
  the preview only shows the first 20. Now only those 20 go, along with the total and how many
  rows will say Hidden, which the server works out. The CSV still reads every row itself.

Nothing in the database or the phone app changed.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass, all 22 routes. Only the two font warnings `web/README.md` explains |

The contrast numbers above were worked out with the WCAG formula from the colours in
`web/src/app/globals.css`.

## Manual tests (stand-in)

The site ran with `npm run dev` and was checked in a browser, signed in as the test officer where
the page needed it.

| Test | Result |
| --- | --- |
| Login page: field borders are pencil and the labels are bold ink | Pass |
| Standinia exacta (added with no habitat or uses): only the About section shows | Pass |
| The other 6 plant pages still show all 3 sections | Pass |
| Report with the 9 stand-in records: the totals and "8 rows will say Hidden" are the same as before | Pass |
| Report with the preview cut to 3 rows for the test: only 3 rows in the page, "And 6 more in the file." shows, and the later tag codes aren't in the HTML at all | Pass, then put back to 20 |
| Footer shows the new line | Pass |
| A throwaway staff page that throws: the staff error page shows inside the staff layout, with the menu, one main area and the title "This page didn’t load · Staff · Niah Plant Records" | Pass |
| A throwaway public page that throws: the public error page shows with the logo, Try again and "Go to the home page" | Pass |
| Throwaway pages removed after | Done |

## Not tested yet

- The hosted Supabase project, which needs 003 to 009 run first.
- The home page empty state on a real empty project. The stand-in always has public records, so
  only the code path was read.
- `global-error.tsx` showing for real. That needs the main layout itself to fail, which none of
  the pages do on purpose. It was built and type checked like the other two.
