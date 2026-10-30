# Phone app review fixes test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `mobile-review-fixes`
branch. It covers the fixes from the review of the phone app in `mobile/`. Every fix was checked
with Jest and the other three CI checks. Nothing was tried on a real phone or a simulator in this
round.

Round 2 was on 30 Oct 2026, after a second review of the whole project. See
[Round 2](#round-2-second-review) below.

## What changed

- **Species with no common name.** Picking a species from the list that has no common names put
  `undefined` in the Common name box. Save then failed every time with "Couldn't save the record
  on this phone", because tidying the name ran on `undefined`. The box now stays empty, and the
  suggestion is read out as "Use Ficus aurantiacea" instead of ending in ", undefined". New screen
  test.
- **Busy database while the species list is replaced.** `withExclusiveTransactionAsync` opens a
  new connection every time, and that connection had no busy timeout, so a record being saved at
  the same moment made the list fail straight away. The transaction now sets
  `PRAGMA busy_timeout` first. That's still in time, because expo-sqlite starts it with a plain
  `BEGIN`, which takes no lock until the `DELETE`. If SQLite still says "database is locked", the
  whole replace is rolled back and tried again, up to 3 times. Other errors aren't tried again. 4
  new records store tests.
- **Gap in the Jest stand-in.** A comment next to that code in `src/db/records-store.ts` now says
  the sql.js stand-in can't show the lock wait. Its second connection is the same database and
  shares transactions, so only a real phone can. The stand-in itself didn't change.
- **Database newer than the app.** Opening a database made by a newer copy of the app now throws
  its own `DatabaseTooNewError`. The start up screen then says "Update the app to open the records
  saved on this phone.", says nothing was changed, and has no Try again button, since trying again
  would fail the same way. New provider test.
- **GPS on a tab nobody is looking at.** Tabs stay mounted, so the GPS kept running after leaving
  New Record. The screen now passes `useIsFocused()` to `useGpsCapture`, which stops the capture
  when the tab loses focus. A location that was already saved stays, and Capture location starts
  it again. 2 new hook tests and 1 screen test.
- **Saved fixes from earlier.** A fix newer than the first fix in a capture was always trusted, even
  when that first fix was an old saved one. Now it only counts when the first fix is from the last
  minute (`MAX_CLOCK_GAP_MS` in `src/lib/gps.ts`). 3 new GPS tests.
- **Height for screen readers.** `Field` has a new `suffixLabel` prop, so the height box is read as
  "Height, in metres" instead of just "Height". The screen tests find the box by that label now.
- **Today count after a night in the background.** A new `useNow` hook reads the time again
  whenever the app comes back to the front, so Home stops counting yesterday's records as today's.
  A date from another year now shows the year, like "28 Dec 2025, 4:10 pm". New hook and format
  tests.
- **Sync badge and banner.** Home says "No records yet" instead of "Everything is synced" when the
  phone has no records. The My Records banner counts records that couldn't upload (tag clash, not
  allowed, rejected) apart from the ones waiting for signal. When only those are left it turns red,
  says "1 record couldn't upload" (or however many), tells you to open it to see why, and hides
  Sync now. New component tests, and the records screen test expects the split counts.
- **Old save error.** "Couldn't save the record on this phone" now goes away as soon as anything in
  the form changes, including picking a suggestion or a condition. New screen test.
- **README.** The My Records row lists the third tag, "Couldn't upload". The folder list, the
  database note and the Tests section mention the new hook, the banner and the update message.
- **npm audit.** No packages changed. See [Security check](#security-check).

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Tests | `cd mobile && npm test` | Pass. 320 tests in 18 suites (297 in 16 before) |
| Types | `cd mobile && npm run typecheck` | Pass |
| Lint | `cd mobile && npm run lint` | Pass, no warnings |
| Expo doctor | `cd mobile && npx --yes expo-doctor` | Pass, 21 of 21 checks |

Like CI, the type check needs `expo-env.d.ts`, which is gitignored, so it was written first.

## Security check

`npm audit` in `mobile/` on 29 Oct 2026.

| | Before | After |
| --- | --- | --- |
| `npm audit` | 19: 6 high, 13 low | Same, 19: 6 high, 13 low |
| `npm audit --omit=dev` | 17: 6 high, 11 low | Same, 17: 6 high, 11 low |

They all come from three packages. Nothing could be fixed safely, so nothing changed:

- **`zod` 3.25.76**, high
  ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). Used by
  `@expo/cli` and `eslint-plugin-react-hooks`. Only 4.6.6 and up are fixed, so an override would
  move Expo's own CLI onto a new major version of zod. None of our four checks start the dev
  server, so they couldn't show whether that breaks it. It's in the tools that build the app, not
  in the app on the phone.
- **`decode-uri-component` 0.2.2**, high
  ([GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr),
  [GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f)). It comes in through
  `query-string` 7.1.3 in `expo-router`, which uses it to read links, so this one is in the app.
  The fix is in 0.5.1, but that version only works as an ES module and `query-string` 7 loads it
  with `require`. An override to 0.5.1 was tried: the audit went down to 15 (3 high), but Jest
  couldn't load expo-router any more ("Unexpected token 'export'") and Node said
  "decodeComponent is not a function". The override was taken back out. `npm audit fix --force`
  wants expo-router 58, which is for SDK 58, so this waits for the SDK update.
- **`deepmerge` 4.3.1**, low
  ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)). Comes in through
  `@expo/config` and Jest. Every version from 4.2.0 up has it, including the newest, so there's
  nothing to move to.

A dry run of plain `npm audit fix` only reshuffled the lock file and still left all 19, so it
wasn't run for real. `npm audit fix --force` wasn't run either. It wants to put back expo 51 and
move expo-router to 58, and both would take the app off SDK 57.

## Round 2: second review

One fix, on the `phone-gps-range` branch, checked with Jest, the type check and lint.

- **GPS point off the globe.** `toGpsReading` in `src/lib/gps.ts` already skipped a reading with
  no accuracy or a broken number, but it took any latitude and longitude. The server turns down a
  point past 90 or 180 (`records_gps_check` in 005), so a broken reading like that would only have
  failed at upload, after the plant was left behind. Now it's skipped like the others and the
  capture keeps waiting for a good fix. A point right on the edge, like a latitude of -90, still
  counts. 1 new GPS test, so 331 tests in 18 suites now.

The review also flagged two things that turned out to be on purpose:

- **Records with an upload problem are still in `loadWaiting`.** That's so the next sync tries
  them again. "Not allowed" says to sync again once an admin gives you the role, and the records
  store test "lists the oldest first, problems and all" checks it. The badges on Home, the tab bar
  and Profile count them as waiting too, while the My Records banner splits them out. Nothing
  uploads yet, so no record can have a problem today. Item 10 can decide how the other badges
  show them.
- **A `42501` answer is saved as "not allowed".** The record stays waiting and goes up on a later
  sync, so it isn't stuck for good. An expired sign in comes back from the API with its own code,
  not `42501`, so it's tried again like no signal. The one case to watch in item 10 is the app
  carrying on as nobody signed in after a refresh fails, since that does get `42501`. The sync
  design already says item 10 should stop the sync on the first one.

## Not tested yet

- A real phone or a simulator. Everything in this round was checked in Jest only.
- The busy wait and retry when the species list is replaced while a record saves. The Jest
  stand-in can't show two connections fighting over the lock (see the comment in
  `records-store.ts`), and nothing replaces the list yet. Item 10 will, when it downloads it.
- The GPS stopping on a real phone when you leave New Record. The tests use a mocked
  `expo-location`.
- VoiceOver and TalkBack reading the height box and the new banner.
- Not done: keeping the New Record form as a draft if the phone closes the app in the background.
  It was left for its own item, for two reasons. On the web the records store only keeps things in
  memory (`records-store.web.ts`), so a draft saved with `expo-sqlite/kv-store` would need its own
  web version. We'd also need to decide how old a restored GPS fix can be before it shouldn't be
  trusted. Until then, a form that isn't saved is lost if the phone closes the app.
