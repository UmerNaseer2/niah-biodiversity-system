# Downloads with exact spots: test results

Tested on 30 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `download-audit` branch. The SQL
was tried on PGlite (`supabase/tests/`) and the website on the Supabase stand-in in
`supabase/tests/stand-in.js`, not against the hosted project.

Round 2, on 30 Oct on the `download-list-paging` branch, split the list into pages of 20 so
admins can read back past the newest 20.

## What changed

Item 21 had this known limit: a reports CSV with the exact spots of threatened and protected
plants only left a line in the server log, and hosted logs aren't kept for long. So nobody could
look back and see who had taken those spots away from the website.

Now:

- `supabase/011_exact_location_downloads.sql` adds an `exact_location_downloads` table. Each row
  has who downloaded the file, when, the filters on the page (published only or waiting too, and
  the days) and how many rows the file had and how many of those had an exact spot only because
  it was asked for. No coordinates or record IDs are kept.
- A trigger fills in who and when, so a row can't say someone else downloaded the file, or that
  it was at another time. The website only sends the filters and the counts.
- Officers and admins can add a row for their own download. Only admins can read the list, and
  nobody can change or empty it through the API.
- The name is kept as well as the ID, so the list still says who it was after their account is
  deleted.
- The website adds the row before it builds the file. If it can't (say 011 hasn't been run yet),
  it sends back an error page and no file. A download without exact spots doesn't need a row, so
  it still works.
- Admins see the last 20 downloads at the bottom of the Reports page, newest first. Officers
  don't get that section at all.
- The warning under the exact spots box now says your name goes on a list administrators can
  see, and the Users and roles page has a row for it.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL tests | `cd supabase/tests && npm test` | 187 of 187 pass |
| Website lint, types and build | `cd web && npm run lint && npx tsc --noEmit && npm run build` | Pass |

The new SQL tests are in `supabase/tests/downloads.test.js`. They check that:

- officers and admins add a row, and the trigger fills in their name and the time
- a download with no dates picked keeps them empty
- a row can't name someone else or another time, even if the request tries to send them
- botanists, researchers, visitors and people signed out can't add a row
- only admins can read the list
- nobody can change or empty the list through the API, or call the trigger function
- the database turns down counts and filters the website should never send, like more exact
  spots than rows, or a start day after the end day
- the row keeps the name after the account is deleted
- a row added in the SQL editor is turned down, because nobody is signed in
- running 011 again keeps the list, and 002 still runs after it
- 011 stops and changes nothing if 010 hasn't been run

## Manual tests (stand-in)

The stand-in was started again so it built its database with 011. The cookie helper in the
scratchpad signed in the test accounts.

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | Downloaded a CSV with exact spots as the test officer | `200` and the file, and one new row on the list with the officer's name | Pass |
| 2 | Opened the Reports page as the officer | No list of downloads | Pass |
| 3 | Opened the Reports page as the test admin | The officer's download, with the time in park time, the filters and both counts | Pass |
| 4 | Downloaded with the From day after the To day | The row keeps the days in the right order, the same as the page does | Pass |
| 5 | Ticked the exact spots box | The warning says the name goes on a list administrators can see | Pass |
| 6 | Started the stand-in without 011 and downloaded with exact spots | `500` and the message saying the download couldn't be recorded, no file, and the error in the server log | Pass |
| 7 | Downloaded without exact spots, still without 011 | `200` and the file | Pass |
| 8 | Opened the Reports page as the admin, still without 011 | The box saying the list didn't load and 011 may need running | Pass |
| 9 | Started the stand-in again with 011 and opened the page as the admin | "Nobody has downloaded exact spots yet." | Pass |

## Round 2: older downloads

The list stopped at the newest 20, so an admin had to open the Table Editor to see anything
older. Now it shows 20 at a time, with Older and Newer buttons under the table and a line saying
which ones you're looking at, like "Downloads 21 to 40". The page number goes in the address as
`?downloads=2`, so the report filters stay as they were and the link can be shared with another
admin. The page asks for 21 rows to know if there's an older page, instead of counting them all.

Tested on the stand-in as the test admin, after downloading 24 files with exact spots from the
browser console so there was more than one page:

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | Opened the Reports page with "Published and waiting" picked | 20 rows, "Downloads 1 to 20" and only an Older button, which keeps the filter in its link | Pass |
| 2 | Pressed Older | The page goes back down to the list, with 4 rows, "Downloads 21 to 24" and only a Newer button | Pass |
| 3 | Pressed Newer | Back to the newest 20, and the address has no page number | Pass |
| 4 | Typed `?downloads=9` in the address | "There are no downloads this far back." and a button back to the newest | Pass |
| 5 | Typed `?downloads=abc` with a From day | The newest 20, and the Older link keeps the From day | Pass |
| 6 | Changed the filters and pressed Update report | The list starts again from the newest | Pass |
| 7 | Looked at page 2 at 375 px wide | The table scrolls sideways in its box, the buttons fit and the page doesn't scroll sideways | Pass |
| 8 | Opened the Reports page as the test officer | Still no list of downloads | Pass |

## Known limits

- **Fixed on 30 Oct:** the list only showed the last 20, so older rows were only in the Table
  Editor. Now it has pages. See round 2 above.
- **It keeps the filters, not the file.** The list says which records the file covered, but
  records edited or deleted since then mean the same filters might not give the same file again.

## Not tested yet

- The hosted Supabase project, which needs 003 to 011 run first.
- A screen reader reading the list out. The headings and table were checked in the page.
