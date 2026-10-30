# Website review fixes test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `web-review-fixes`
branch. The pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), with the stand-in's own sample records and test accounts, not the hosted project.
Round 2, on 30 Oct, fixed what a second review of the whole project found, one branch per fix. See
round 2 below. Round 3, later that day, fixed what a review of the earlier fixes found.

## What changed

A review of the staff pages found a few places where the website trusted what was typed a bit too
much, and a couple of photo problems.

- **Species names with a `*`** on the record edit page. The page finds the species for a name by
  matching it in `species_staff`, and the API reads a `*` in that pattern as "anything". So a
  name like `Shorea*` could link the record to whichever Shorea species came back. A name with a
  `*` now never links to a species, since no scientific name has one in it.
- **The date and time a plant was recorded** now has to be a real time. Before, `25:00` or `10:61`
  got past the check because only the date part was looked at.
- **The CSV report** already put a `'` in front of a cell starting with `=`, `+`, `-` or `@`, so
  Excel shows it instead of running it as a formula (item 21). Now it does the same when there
  are spaces before the sign, or when the sign is the full width one a phone keyboard can type,
  since some spreadsheets still run those.
- **Species photos on the edit page** are picked by their place on the page as well as their key.
  Two photos with the same outside link used to share a key, so making one main or removing it
  could change the other one. The server checks the place still matches the key, and if the
  photos changed since the page loaded it finds the photo by key instead. The confirm step for
  removing a photo goes by place too, so only the photo that was clicked asks to be removed.
- **Photo descriptions for screen readers.** The upload form needs a caption, but a photo put in
  the database another way can have an empty one, and then it had an empty description that a
  screen reader skips. It now reads "A photo of" and the plant's name, on the plant page, the tag
  page and the edit page.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass, all 22 routes. Only the two font warnings `web/README.md` explains |

The website has no unit tests yet, so the two rules were also run in a throwaway node script:

| Rule | Inputs | Result |
| --- | --- | --- |
| CSV cells get a `'` | `" =1+1"`, a full width space then `=cmd`, `＝SUM(A1)`, `- note` | All 4 get a `'` |
| CSV cells left alone | `Shorea`, and a note with a `-` in the middle | Both left alone |
| Recorded time | `T24:00`, `T10:60`, 30 February | All 3 turned down |

Nothing in the database or the phone app changed.

## Manual tests (stand-in)

The site ran with `npm run dev`. Throwaway scripts signed in as the test officer through the real
login form and sent the real forms. They only printed status codes, form messages and the fields
being checked.

| Test | Result |
| --- | --- |
| Before the fix: saving a record with the species name `Standinia*` linked it to a species | The bug showed up |
| After the fix: the same name saves with no species link | Pass |
| Putting the name back to `Standinia exacta` links the species again | Pass |
| Saving a record with hour 25, then with minute 61 | Both say "Enter the date and time it was recorded." and nothing is saved |
| Uploading a photo to Belian, making it main, making the first one main again, then removing the new one | Pass, every step. Belian is back to its one photo |
| Each photo form on the edit page sends its place on the page | Pass |
| No errors in the dev server log | Pass |

## Round 2: second review

A second review on 30 Oct read every page again, this time looking for crashes on missing data,
screen reader problems and anything that could show a hidden plant's spot. Nothing showed a
hidden spot. Each fix below was tried on the stand-in the same way as round 1.

| Branch | What was wrong | Now |
| --- | --- | --- |
| `tag-error-alert` | On the Scan a tag page, typing a bad code and pressing Enter showed an error that a screen reader never read out, since the field already had focus and nothing moved | The error is an alert, and it's put back in the page each time a bad code is sent, so it's read out every time |
| `plant-name-fallback` | A species with no common name had an empty heading and page title, "undefined" in its map's description and a card with no name. The form always asks for a name, but an admin can save one without through the API, and so can the SQL editor. With no species at all, the Plants page said "No plants match" and offered to clear a search nobody typed | The plant page, its title and the list use the Latin name, the heading doesn't say it twice, and Local names says "None recorded". With no species the list says there are no plants yet |
| `record-notes-line-breaks` | A form sends each line break in the notes box as two characters (`\r\n`), but the box counts it as one. Notes that filled the box, with line breaks, were turned down with "Notes can be up to 1000 characters." even when nobody touched them. Saving any record with line breaks in its notes also logged a notes change in its history | Line breaks are turned back into `\n` before the check, like the species form already does. The limit matches the box, and notes nobody touched save exactly as they were |
| `record-time-seconds` | The Recorded on box only goes down to the minute, so saving a record from the edit page cut the seconds off a time the phone saved, even when nobody touched the box. The history then said "Recorded on changed from 12 Oct 2026, 10:40 pm to 12 Oct 2026, 10:40 pm" | If the box still shows the stored minute, the stored time is kept as it is. A history change that reads the same before and after says "changed slightly (still ...)" instead |
| `report-date-check` | The reports page and the CSV link only checked a date had the right shape. A day that doesn't exist, like `to=2026-13-01`, crashed both with a 500. A day like 30 February got to the database, which turned it down, and the page said the records didn't load and to ask an admin to check the database | A day that doesn't exist counts as no limit, the same as a date that isn't one at all, so the page and the file still load |
| `exact-download-origin` | The CSV link with `exact=1` worked from anywhere the officer was signed in. The sign in cookies still go with a link clicked on another site, so a page somewhere else could start a download with exact spots and put the officer's name on the admins' list without them meaning to | Browsers say where a request came from. A download with exact spots is only made when it came from the site itself, or from a typed address or a bookmark. From anywhere else it's turned down with a 403 that says to download it from the Reports page. Downloads without exact spots work the same as before |

| Test | Result |
| --- | --- |
| Typed `NNP-12` in the tag code box and pressed Enter | The error shows with `role="alert"`, the box is marked invalid and keeps focus |
| Pressed Enter again with the same code | A new error is put in the page, so it's read out again. The page stays on `/tag` |
| As the test admin, saved the stand-in tree with no common names through the API, then opened its plant page, the Plants list and its tag page | The heading and title are "Standinia exacta", Local names says "None recorded", the list card has the Latin name, and nothing says "undefined". The tag page still uses the record's own name. The names were put back afterwards |
| Before the fix: gave a record 1000 characters of notes on 16 lines through the API, then pressed Save changes on its edit page without changing anything | "Notes can be up to 1000 characters." and nothing saved |
| After the fix: the same save | "Changes saved". The notes are still 1000 characters with plain `\n` line breaks, and no new history entry |
| Gave the record a time 37.123 seconds past the minute through the API, then pressed Save changes without changing anything | "Changes saved". The time still has its seconds and there's no new history entry |
| Picked the next minute in Recorded on and saved | The time moves to that minute, and the history says "Recorded on changed from 12 Oct 2026, 10:40 pm to 12 Oct 2026, 10:41 pm" |
| The history entries from before the fix | They say "Recorded on changed slightly (still 12 Oct 2026, 10:40 pm)" |
| Before the fix: opened the reports page and the CSV link with `?to=2026-13-01`, and the page with `?from=2026-02-30` | The first two gave a 500. The third said "The records didn’t load" |
| After the fix: the same three, plus the page with both bad dates at once | All load. The page says "any date", like it does with no dates, and the file has all 8 records |
| `?from=2028-02-29` and `?from=2026-10-01&to=2026-10-05` | Still kept as limits. The second file has 3 records |
| Before the fix: asked for the CSV with `exact=1` as if from a link on another site (`Sec-Fetch-Site: cross-site`) | `200` and the file, and a new row on the admins' list |
| After the fix: the same, and the same again as `same-site` | Both `403` with the message, no file, and the list stays at the same number of rows |
| After the fix: `exact=1` as `same-origin` (the Reports page form), `none` (a typed address) and with no header at all | All `200` and the file, and the list goes up by 3 rows |
| After the fix: the CSV without exact spots as `cross-site` | `200` and the file, and no new row |

## Round 3: reviewing the fixes

Later on 30 Oct a review went back over the earlier fixes and the items finished since. Each
website fix below was tried on the stand-in, the same way as before. The phone fixes from the same
review are in [deleted-records.md](deleted-records.md), under round 3.

| Branch | What was wrong | Now |
| --- | --- | --- |
| `species-rough-backfill` | A threatened or protected species could still have rough area only switched off, because the public rule hid it anyway. The first save on its edit page turned the switch on, so the history said "On the public map changed from Exact spot to Rough area only" even though the public saw no change | `supabase/015_species_rough_area.sql` turns the switch on for these species without a history line and keeps it on. The public sees the same as before |
| `report-date-limits` | Round 2's date check let through year 0, which the database doesn't have, and the last day of year 9999, where the day after a "to" date doesn't fit. The page said the records didn't load and the CSV link gave a 500 | Both count as no limit, like any other day that can't be used |
| `history-whitespace-lines` | Notes that only differed by spaces or line breaks showed as "Notes changed", and opening it showed the same text twice. A short field could read "Recorded by set to" and then nothing | The history says "Notes changed slightly (only spaces or line breaks)" or "Recorded by changed slightly (still Aina)" |
| `history-duplicate-photos` | The history matched species photos by file or link, so two photos with the same outside link counted as one. Removing one of them, or adding the same link again, said nothing | Each old photo is only matched once, in order, and whatever is left over was removed |
| `history-text-wording` | The history section, its comment and the docs said no location goes in the history. The map location doesn't, but notes are kept word for word, so a place someone typed is kept too | They now say the map location never goes in, but typed text like notes is kept as it was typed |
| `map-sensor-under-dots` | A sensor square could sit on top of a plant dot, so clicking the dot did nothing | Sensor squares sit under the plant dots, so the link still opens where they overlap |
| `map-labels-keyboard` | A label with no room is hidden until its dot is pointed at or tabbed to, but only plant links could be tabbed to, and the plain dot on a tag page couldn't even be pointed at | Sensor squares and plain dots can be tabbed to and pointed at, the label shows while they have focus, and they have a name for screen readers, like "Sensor S-02, offline, with an alert". A dot that's been dragged off the map pans back into view |

Round 2 said notes nobody touched save exactly as they were. That's only true for notes with plain
line breaks and no spaces at the ends. Other notes get tidied when saved, and the history now says
so in words that make sense.

| Check | Command | Result |
| --- | --- | --- |
| SQL tests | `cd supabase/tests && npm test` | 239 of 239 pass |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass. Only the two font warnings `web/README.md` explains |

| Test | Result |
| --- | --- |
| Pressed Save changes on belian's edit page without changing anything, after 015 | "Changes saved", and the history still says nobody has changed it |
| Before the fix: reports page and CSV link with `to=9999-12-31`, `from=0000-01-01` and `to=0000-01-01` | The page said the records didn't load and the CSV link gave a 500 |
| After the fix: the same three | All load. The page says "any date" and the file has all 8 records |
| `to=9999-12-30`, `from=0001-01-01` and `from=2026-10-01&to=2026-10-05` | Still kept as limits. The last file has 3 records |
| Gave a record notes with `\r\n` and spaces at the end through the API, then pressed Save changes without changing anything | "Changes saved", and the history says "Notes changed slightly (only spaces or line breaks)" |
| A throwaway script on the history wording: notes with only spaces, only a line break, and spaces to empty | All three say "Notes changed slightly (only spaces or line breaks)" |
| The same script: `Aina` to ` Aina `, empty to spaces, and a time a few seconds later | "Recorded by changed slightly (still Aina)", "(still empty)" and "(still 12 Oct 2026, 10:40 pm)" |
| The same script: real changes, and fields added and taken off | They read the same as before |
| A throwaway script on the photo lines: one of two photos with the same link removed, then the same link added again | "Photo removed (“Two”)" and "Photo added (“Two”)" |
| The same script: both captions changed, the main photo moved, a new photo made main, and all photos removed | Two caption lines, the right main photo line, and three removed lines |
| At 1024 px, checked what's on top at the middle of every dot and square on the dashboard map | None of the 9 plant dots are under a sensor. 7 are on top and 2 are under another plant dot very close by. All 5 sensors are still on top where no plant is |
| Clicked the dashboard map and pressed Tab | Goes through S-01 to S-05 in turn, each with a solid focus ring and on top of the other labels. A label that was hidden to make room shows on focus, and the one next to it hides instead |
| On a tag page, pressed Tab to the plain dot | It looks the same as before, its name is the tag code, and the visible label is hidden from screen readers so it isn't said twice |
| Dragged that dot off the map and pressed Tab | The map pans it back into view |
| Browser console during the map tests | No errors |

The history can't tell two photos with the same link apart, since nothing else marks which is
which. Removing the first of two reads as "Photo caption changed from “One” to “Two”" and
"Photo removed (“Two”)". The photos left are right, only the wording is off.

## Not tested yet

- The Plants page with no species at all, since the stand-in's records need its species. The new
  message was read, not tried.
- A photo with an empty caption. The upload form won't take one (tried, it asks for a caption),
  so the fallback description was read, not tried.
- Two photos with the same outside link. The stand-in only stores uploads, so the code for that
  case was read, not tried.
- Pressing Download on the Reports page in a real browser. The browser pane here doesn't save
  files, so the header the form sends was set by hand. The form is a plain GET on the same site,
  so a browser sends `same-origin` for it.
- The history lines for two photos with the same outside link on a real save. They were only tried
  on the function, since it takes the Table Editor to make two photos like that.
- The map labels with a real screen reader. Their names and focus were checked in the browser with
  real Tab presses, but nothing read them out loud.
- The hosted Supabase project, which needs 003 to 015 run first.
