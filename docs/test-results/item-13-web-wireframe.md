# Item 13 test results: web wireframe

Run on 4 Oct 2026 on Umer's Mac (macOS, Node 22.22.3), on the `item-13-web-wireframe` branch.

## Automated checks

Run from `web/` unless it says otherwise. GitHub runs all of these on every pull request and every
push to `main`.

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `npm run lint` | Pass |
| Website build | `npm run build` | Pass. It makes 25 static pages, and `/plants` is built on each request because it reads `?q=` |
| Mobile lint | `npm run lint` in `mobile/` | Pass |
| Mobile typecheck | `npm run typecheck` in `mobile/` | Pass |
| Mobile unit tests | `npm test` in `mobile/` | Pass, 59 tests in 4 files |

The mobile checks were run again because one made up GPS point in the mobile mock data moved (see
fix 1 at the end).

The build prints two warnings, "Failed to find font override values" for Atkinson Hyperlegible Next
and Atkinson Hyperlegible Mono. They mean Next skips making a size matched backup font, so text can
shift a little while the fonts load. Nothing breaks.

There are no unit tests for the website yet, so everything on it was tested by hand below.

## Manual tests in the browser

The site ran on the Next.js dev server and was opened in a browser at desktop width, 1024 px and
375 px wide. Everything starts from the mock data in `web/src/data`, and refreshing a page puts it
back how it was.

| # | Screen | What we did | What should happen | Result |
| --- | --- | --- | --- | --- |
| 1 | Home | Searched for `pitcher` | Goes to `/plants?q=pitcher` and shows "Showing 1 of 6 plants", just the pitcher plant | Pass |
| 2 | Plant list | Cleared the search and pressed Threatened | "Showing 4 of 6 plants": Belian, Engkabang, Durian kuning and Kapur. The button is marked as pressed for screen readers | Pass |
| 3 | Plant list | Typed `dipterocarpaceae` with Threatened still on | "Showing 2 of 6 plants", Engkabang and Kapur, and the address changes to `/plants?q=dipterocarpaceae` | Pass |
| 4 | Plant list | Changed the search to `dipterocarpaceae zzz` | "No plants match" with a Clear search button | Pass |
| 5 | Plant list | Pressed Clear search | The search box is empty and focused, the filter is back on All and it says "Showing all 6 plants" | Pass |
| 6 | Overview | Opened `/dashboard` and looked at the sketch map | The park HQ icon and every plant dot can be seen, and no labels sit on top of each other | Pass, after fix 1 |
| 7 | Overview | Checked the tab title | "Overview · Staff · Niah Plant Records", the same pattern as the other staff pages | Pass, after fix 3 |
| 8 | Review queue | Pressed Reject on a record, then Reject record with no reason | The box gets a red border, "Write a reason so the ranger knows what to fix." shows and focus stays in the box | Pass |
| 9 | Review queue | Approved Kapur | Kapur moves to "Done in this session", a screen reader hears "Approved Kapur, NNP-D4B86E." and focus moves to the next record, Engkabang | Pass |
| 10 | Review queue | Pressed Undo on Kapur | Kapur is back in the queue with focus on it, and a screen reader hears "Kapur, NNP-D4B86E, is back in the queue." | Pass |
| 11 | Species | Opened `/dashboard/species` | 6 species with their IUCN status, "Protected in Sarawak" where it applies, rough area or exact spot, and how many records are waiting. At 1024 px the table scrolls inside its own box | Pass |
| 12 | Add a species | Pressed Add species with nothing filled in | "Fix these 5 things before you add the species" shows with a link to each field and focus moves to it. The 5 fields are marked invalid and the address doesn't change | Pass |
| 13 | Add a species | Then chose Endangered (EN) as the IUCN status | Exact spot locks and Rough area only gets picked, the preview shows "EN Endangered" and "Location hidden", and the message drops to "Fix these 4 things" | Pass |
| 14 | Reports | Opened `/dashboard/reports` | Public records (4) is picked. Belian and Pitcher plant say Hidden, Durian kuning says No GPS point, Tapang shows its point, and the text says "2 rows will say Hidden." | Pass |
| 15 | Reports | Picked All records | 6 rows, including the 2 waiting for review | Pass |
| 16 | Reports | Ticked "Include exact spots of threatened and protected plants" | Every row with a GPS point shows it, and the warning "Only share this file with SFC staff." appears | Pass |
| 17 | Reports | Unticked it again, still on All records | 4 rows say Hidden | Pass |
| 18 | Reports | Window 1024 px wide | Nothing sticks out sideways | Pass |
| 19 | Sensors | Pressed Acknowledge on the S-03 movement alert | It moves to "Acknowledged in this session", focus moves to the S-05 alert and a screen reader hears "Acknowledged: Movement near S-03 at night." | Pass |
| 20 | Sensors | Pressed Undo on it | S-03 is back at the top of the open alerts with focus on it, and a screen reader hears "Movement near S-03 at night is back in open alerts." | Pass |
| 21 | Sensors | Looked at the sensor nodes and the map | S-02 is offline, so its chart ends in a red hatched "no data" gap. S-05's battery bar is red at 12%. On the map S-02 is hollow and the sensors with alerts are circled | Pass |
| 22 | Users and roles | Opened `/dashboard/users` | 6 people, "(you)" next to Mira Tan, Hafiz shows as Deactivated and the heading says 5 active. The roles table fits, and Invite someone is greyed out with the planned tape next to it | Pass |
| 23 | Scan a tag | Typed `hello` and pressed Look it up | "Tag codes look like NNP-3F2A9C: NNP and then 6 letters or numbers." The box is marked invalid for screen readers, focus stays in it and the address stays `/tag` | Pass |
| 24 | Scan a tag | Typed `nnp 5e9a2c` (Engkabang, still waiting for review) | Opens `/tag/NNP-5E9A2C` with "No plant with that tag yet", because records waiting for review aren't public | Pass |
| 25 | Tag page | Opened `/tag/nnp-3f2a9c` | Changes to `/tag/NNP-3F2A9C` and shows the Belian with "The exact spot is hidden". Its coordinates aren't anywhere in the page's HTML | Pass |
| 26 | Plant pages | Opened the Belian and Pitcher plant pages and searched the HTML for their coordinates | They aren't there, the pages only have the rough area | Pass |
| 27 | Every page | Window 375 px wide, on every public page, every staff page and the 404 page | Nothing scrolls sideways. The staff menu scrolls inside its own strip and its badges read "2 waiting" and "1 urgent alert" to a screen reader | Pass, after fix 2 |
| 28 | Every page | Opened every page in a fresh tab and watched the browser console | No errors | Pass |

## Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| Download CSV | Clicking it saves a file, and nobody has opened that file in Excel or Google Sheets yet | Download it with each option, open it in both, and check the columns line up and Hidden rows have blank coordinates |
| Real phones | 375 px was only tested in a desktop browser | Click through it in Safari on an iPhone and in Chrome on an Android phone |
| Screen reader | We checked where focus goes and what the status messages say, but not with a real screen reader | Run tests 8 to 10, 19, 20 and 23 with VoiceOver on a Mac |
| Team check | Angel and Andy own items 13 to 16 | They click through it and add anything missing before we tick item 13 |

## Security check

`npm audit` in `web/` on 4 Oct 2026.

**Packages the site runs on** (`npm audit --omit=dev`): nothing found.

**Dev tools:** 5 high, but npm counts one advisory again for every package in the chain, so it's
really one:

| Package | Severity | The problem | Where it comes from | In the website? | Fixed version |
| --- | --- | --- | --- | --- | --- |
| `braces` 3.0.3 | High | Very deeply nested patterns can crash it ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)) | ESLint, through `eslint-config-next` 16.3.8, `@next/eslint-plugin-next`, `fast-glob` and `micromatch` | No, it only runs when we lint | None yet |

Don't run `npm audit fix --force`. It would swap `eslint-config-next` for 14.2.35, which is made
for Next 14 and would break lint. Check again in Sprint #2 and after each Next update.

**Plant locations:**

- Tests 24 to 26 show that records waiting for review aren't public, and that public pages never
  get the exact point of a threatened or protected plant.
- Staff pages (review queue, reports and the overview map) do send exact points to the browser.
  That's fine while the data is made up, but once it's real those pages need a role check on the
  server first (items 2, 4 and 15), and the reports CSV should be built on the server (item 21).
- The wireframe forms never submit anywhere, so nothing typed into them ends up in the address
  bar. The plant search is the only exception: it puts `?q=` in the URL on purpose so a search can
  be shared.

## Fixed while testing

1. On the overview map the Belian dot sat right on top of the park HQ icon. We moved its made up
   point a little, inside the same grid square, in `web/src/data/records.ts` and
   `mobile/src/data/mock-records.ts` so the two apps still match.
2. At 375 px wide every staff page scrolled sideways (648 px instead of 375). The screen reader
   text in the staff menu badges ("1 urgent alert") was poking out of the menu's scroll box.
   Adding `relative` to the menu and to the 5 tables that scroll sideways fixed it.
3. The overview's tab title was "Overview · Niah Plant Records", while the other staff pages have
   "Staff" in theirs. The title template in `dashboard/layout.tsx` only covers the pages below it,
   so the overview now sets its whole title.
