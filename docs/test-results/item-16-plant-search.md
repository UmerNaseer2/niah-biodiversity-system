# Item 16 test results: plant information display and search (basic)

Two rounds so far. Round 1 was on 15 Oct 2026 against a test Supabase project. Round 2 was on 16
Oct 2026 against a stand-in for Supabase on Umer's Mac. It moved the home page and the tag pages
onto Supabase too, and ran the tests round 1 didn't get to.

## Round 2: 16 Oct 2026, the home page and tag pages

Run on Umer's Mac (macOS, Node 22.22.3) on `main`. The public pages now read the `species_public`
and `records_public` views (004 to 007), and the hosted project doesn't have those yet, so this
round used the Supabase stand-in in `supabase/tests/stand-in.js`. It builds the same database as
the SQL tests, with our SQL files and the seed data in order, and answers the parts of the
Supabase API the website uses. Public pages ask as the anon role, like the real API, so our Row
Level Security policies and column grants decide what they get.

On top of the seed, the stand-in adds a made up species, Standinia exacta (the "Stand-in tree",
Least Concern and not protected, so its exact spot is public), and four made up records near park
HQ:

| Tag | Plant | Status | What it tests |
| --- | --- | --- | --- |
| NNP-D00D01 | Stand-in tree, 4.2 m, healthy | Approved | A plant whose exact spot is public. The seed has none |
| NNP-D00D02 | Strangler fig (Ficus sp.), not matched to a species yet, no height, dead | Approved | A record with no species and no height |
| NNP-D00D03 | Tapang, 31 m, diseased | Waiting for review | Shouldn't show anywhere |
| NNP-D00D04 | Stand-in tree, 2.5 m, damaged | Rejected | Shouldn't show anywhere |

### What changed since round 1

- **The home page and tag pages use Supabase.** The "Recently tagged" list on the home page and
  the tag pages (`/tag/[code]`) used the mock records in `src/data/records.ts`. Now they read
  approved records from Supabase, like the plant pages. The home page was also built once, so its
  list was frozen at build time. Now every page that reads Supabase does it on each visit.
- **Views instead of tables.** The plant list and plant pages read `species_public` and
  `records_public` instead of the `species` and `records` tables. They only ask for the columns a
  page shows, and only for approved records.
- **Records with no species.** The field team can send a plant before they know its species. Its
  tag page shows the name they gave it, says the species hasn't been matched yet and only shows
  the rough area. The home page lists it too.
- **Supabase not answering.** The pages used to fall back to the mock data if Supabase failed,
  which hid the problem behind made up plants. Now a public page says "This page didn't load" with
  a "Try again" button (`src/app/(public)/error.tsx`). With no Supabase values at all the pages
  still use the sample data.
- **Dates in park time.** Supabase sends times in UTC, and the pages printed the UTC date. Now
  `parkTime()` in `src/lib/format.ts` moves them to Niah time (UTC+8) first.
- **Stored tag codes.** The pages read each record's `tag_code` from the database instead of
  working it out from the record ID.
- **Dead plants.** The app can mark a plant as dead, and the website has a label for it now.
- **The `/tag` examples.** The third example was NNP-5E9A2C, "waiting for review". It's approved
  in the seed data, so with Supabase it has a page. Now the example is NNP-D4B86E, which has no
  public page with Supabase or with the sample data.

### Automated checks

Run from `web/`.

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `npm run lint` | Pass |
| Types | `npx next typegen`, then `npx tsc --noEmit` | Pass |
| Build with no Supabase values | `npm run build` | Pass. `/` is built ahead of time with the sample data, and `/plants`, `/plants/[slug]` and `/tag/[code]` on each request |
| Build with a project URL | `npm run build` with `https://127.0.0.1:9`, where nothing answers | Pass. `/` is built on each request too |
| The site with no Supabase values | A script against that build: sign in is off, the dashboard sends you to `/login` and the public pages show the sample data (37 checks) | Pass |

### Checked on the stand-in

The website ran with `npm run dev` pointed at the stand-in. A script requested each page and
searched the HTML, 54 checks in all (tests 1 to 14). Test 15 was in a browser.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| 1 | Opened `/tag/NNP-D00D01` | Stand-in tree, 4.2 m, recorded 10 Oct 2026, with its spot from park HQ and a link to the species | Pass |
| 2 | Opened `/tag/NNP-D00D02` | Strangler fig and Ficus sp., "Not measured", Dead and no photos. It says the species hasn't been matched and only has a rough area map. No IUCN status, no species links, and the tab title is "Strangler fig (NNP-D00D02)" | Pass |
| 3 | Opened `/tag/NNP-3F2A9C` (Belian) | 18.5 m, "The exact spot is hidden" and a link to the rough area on the species page. No map on the tag page | Pass |
| 4 | Opened the other 5 tags in the seed | Each one loads and hides the exact spot | Pass |
| 5 | Opened NNP-D00D03 (waiting), NNP-D00D04 (rejected), NNP-D4B86E (only in the mock data) and NNP-ABCDEF | "No plant with that tag yet" (404) for all four | Pass |
| 6 | Opened `/tag/nnp-d00d01` and `/tag/D00D02` | Sent on to `/tag/NNP-D00D01` and `/tag/NNP-D00D02` | Pass |
| 7 | Opened `/` | "Recently tagged" has the 4 newest approved plants, newest first: NNP-D00D02, NNP-D00D01, NNP-3F2A9C and NNP-8C41E7. The waiting and rejected ones are newer, but they're not there | Pass |
| 8 | Opened `/plants` | 1 tagged plant each for Belian, Tapang and Stand-in tree. The waiting Tapang and the rejected Stand-in tree aren't counted, and the plant with no species isn't counted under a species called "null" | Pass |
| 9 | Opened the Keruing sarawak page | Recorded 28 Sep 2026, for a record stored as 4:30 pm UTC on 27 Sep | Pass |
| 10 | Opened the Stand-in tree page | A dot on the map for its approved plant, and only that plant in the list | Pass |
| 11 | Opened the Belian page | The hatched rough area square, and "18.5 m tall" | Pass |
| 12 | Opened the other 4 plant pages | All load | Pass |
| 13 | Opened `/tag` and `/screens` | `/tag` has NNP-D4B86E as the tag with no page, and `/screens` says the public pages read species and approved records from Supabase | Pass |
| 14 | Searched the HTML of all 25 pages for the exact points of every hidden plant, from the seed and the stand-in | None of them are there | Pass |
| 15 | Looked at the home page, the plant list, the Belian and Stand-in tree pages, `/tag` and two tag pages in a browser, at desktop width and at 375 px | Everything fits, and nothing scrolls sideways | Pass, after one fix (see "Fixed while testing") |

### Supabase not answering

A production build with an https project URL where nothing answers (`https://127.0.0.1:9`),
checked with a script and in a browser.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| 16 | Opened `/`, `/plants`, `/plants?q=belian`, the Belian page and `/tag/NNP-3F2A9C` | A server error (500) with no sample data in the page: no Belian, no Tapang and no "Recently tagged". The error message isn't in the HTML or the page data | Pass |
| 17 | Opened `/tag`, `/login` and `/screens` | They load as normal, because they don't read records | Pass |
| 18 | Opened `/tag/nnp-3f2a9c` and `/tag/not-a-tag` | Sent on to `/tag/NNP-3F2A9C`, and a 404 | Pass |
| 19 | Opened the home page, the Belian page and a tag page in a browser | "This page didn't load", a "Try again" button and a link to the home page. The tab title is "This page didn't load · Niah Plant Records" | Pass |
| 20 | Clicked "Try again" | It asks the server again, and shows the same page because Supabase still isn't answering | Pass |

The browser console shows "Minified React error #441" on these pages. It's React's production
message for a server error with the details left out, so it's expected. The real error only goes
in the server's log.

### The round 1 "Not tested yet" list

| What | Result |
| --- | --- |
| Looking at the pages in a browser | Pass (15 and 19) |
| Supabase down or slow | Down: pass (16 to 20). The pages show an error instead of the mock data, so a problem can't hide behind made up plants. Slow: not tested yet |
| Records waiting for review | Pass (5, 7 and 8), and rejected records too |
| Home page and tag pages | Pass (1 to 7). They moved into this item instead of item 12 |

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| The hosted project | It doesn't have 003 to 007 yet, and the public pages need the views. Until they're run, the public pages there say "This page didn't load" | Run 003 to 007 in order (see `supabase/README.md`), then open the home page, the plant list, a plant page and a tag page |
| Supabase being slow | Not simulated | Make the stand-in wait a few seconds before it answers, and check the pages still load |
| Real phones | Only the browser at 375 px so far | Open the public pages on an Android phone and an iPhone |
| A teammate checking it | It went straight to `main` to finish sprint 1 | Angel and Andy read through the commit and try the pages |

### Known limit

The tagged plant counts on `/plants` come from reading the species of every approved record. The
hosted project sends at most 1000 rows for one request, so past 1000 approved records the counts
come out too low. A count in the database (a view or a function) would fix it.

### Fixed while testing

- A record with no species was counted on the plant list under a species called "null".
- A record with no height showed "0 m". Now the tag page says "Not measured" and the plant page
  says "Height not measured".
- A record with no time got the current time, and one with no recorder got "field_botanist". The
  pages don't make those up now, and they don't read who recorded a plant at all.
- A plant the app marked as dead had no label, because the website only knew healthy, damaged and
  diseased.
- Dates were printed in UTC, so a plant recorded before 8 am at Niah showed the day before.
- When Supabase failed, the pages quietly showed the mock data.
- The home page's "Recently tagged" list was frozen when the site was built.
- `/tag` gave NNP-5E9A2C as its example of a tag with no page, but it's approved in the seed data.
- The error page had no tab title on plant and tag pages, because their title needs the same data
  that failed. The error page sets its own now.
- At 375 px a tag code on `/tag` broke onto two lines next to a long note. The codes stay on one
  line now.

### Security check

- Public pages only read `species_public` and `records_public`, never the tables, and only ask for
  the columns they show. They don't read notes or who recorded a plant.
- In our SQL files (the views from 004, then 006 and 007), `records_public` only gives the exact
  spot of a plant whose species is LC or NT, isn't protected in Sarawak and isn't marked rough area
  only. Every other plant, including one with no species yet, gets the middle of its grid square.
  The pages use the same rule (`showsExactSpot()` in `src/lib/iucn.ts`), so they never draw an
  exact dot the view would hide, and test 14 found no hidden point in any page.
- The error page doesn't show the error. A production build only sends the browser a code, and
  test 16 checked the message wasn't in the page.
- The website only needs the project URL and the publishable key. The service role key isn't used
  anywhere in it.

## Round 1: 15 Oct 2026, the plant list and plant pages on a test project

Run on Deangel's Victus (Windows 11, Node 24.21.0), on the `item-16-plant-search` branch, against
a test Supabase project with the item 14 schema (`001`) and seed data (`002`).

This branch is built on top of `item-14-plant-schema`, because it needs `src/lib/species-db.ts`.

### What this item adds

- The plant list (`/plants`) and each plant page (`/plants/[slug]`) now read from Supabase through
  `species-db.ts`, instead of the files in `src/data`. Without Supabase they still fall back to the
  mock data.
- Plant pages are built when someone asks for them, so a species added to the database gets a page
  without a new build. A slug that isn't in the database is a 404.
- The tagged-plant counts on the list come from `src/lib/records-db.ts`, which only returns counts
  and never coordinates.
- Search is unchanged: common name, Latin name and family, with the search kept in `?q=`.

### Automated checks

Run from `web/`.

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `npm run lint` | Pass |
| Website build | `npm run build` | Pass. `/plants` and `/plants/[slug]` are built on each request |

There are no unit tests for the website yet, so the rest was checked against the running site below.

### Checked against the running site and the database

Pages were requested from the dev server with `curl`, and the HTML was searched. Nobody has looked
at them in a browser for this item yet (see "Not tested yet").

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| 1 | Read `species` and `records` with the public key | 6 species and 6 published records from the seed data | Pass |
| 2 | Opened `/plants` | The 6 species from the database, with "Showing all 6 plants". Names from the seed (Kawang jantong, Slipper orchid, Keruing sarawak) show up, the old mock-only ones (Durian kuning) don't | Pass |
| 3 | Searched `?q=orchid` | "Showing 1 of 6 plants" | Pass |
| 4 | Searched `?q=dipterocarpaceae` (a family) | "Showing 2 of 6 plants" | Pass |
| 5 | Searched `?q=zzz` | "No plants match" | Pass |
| 6 | Opened the 6 plant pages | All return 200 | Pass |
| 7 | Opened `/plants/not-a-plant` | 404 | Pass |
| 8 | Searched the HTML of all 6 plant pages for the exact coordinates in `records` | None of them are there. The pages say the exact spot is hidden and show only the rough area | Pass |
| 9 | Opened the Slipper orchid page | Shows the tag NNP-2A1B0C and "1 plant public" | Pass |
| 10 | Timed a search request (`?q=orchid`) | Under 2 seconds (the proposal's target) | Pass, 0.59 s on a dev server on one laptop |

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| Looking at the pages in a browser | Checks 2 to 9 read the HTML only | Click through the list and 2 plant pages at desktop width and at 375 px wide, and check nothing scrolls sideways |
| Supabase down or slow | Not simulated | Remove the key from `.env.local` and check the pages fall back to the mock data |
| Records waiting for review | The seed has none, so we haven't checked they stay hidden | Add a `waiting` record in Supabase and check it isn't counted or shown |
| Home page and tag pages | Not part of this item. They still use the mock data | Item 12 |

### Security check

- Pages snap exact coordinates to the grid on the server for threatened and protected species before
  the page is built. Test 8 shows no exact point reached the HTML.
- Hiding the point on the page only helps if the database hides it too, because anyone can call
  the API with the public key. The database rules for that are item 4: in our SQL files the public
  key reads the `species_public` and `records_public` views, which only give the rough area of
  threatened and protected plants (006 and 007). Round 2 moved the pages onto those views.
- In the seed, every plant is hidden (all are VU, EN or protected), so the "exact point is shown"
  path on plant pages isn't exercised.

### Fixed while testing

Nothing yet.
