# Item 9 test results: offline storage

One round so far, on 16 Oct 2026 on the iOS simulator and in a browser. Until now records only
lived in memory, so a new record was gone as soon as the app restarted. This item saves them in
SQLite on the phone with `expo-sqlite`, so a record stays on the phone through a restart, a crash
or a flat battery until item 10 uploads it.

This is the Sprint #1 part of item 9. Photos, the species list and the upload queue need items 10
and 11 first, so they finish in Sprint #2 (see
[Carried over to Sprint #2](#carried-over-to-sprint-2)).

## Round 1: 16 Oct 2026, iOS simulator and browser

Run on Umer's Mac on `main`, in Expo Go 57.0.9 on an iPhone 17 Pro simulator (iOS 26.5), and in a
browser on the same Mac.

### What we built

- **A database on the phone.** The app uses `expo-sqlite` (`~57.0.4`, the version
  `npx expo install` picks for SDK 57) and keeps the records in a file called `niah.db`. It comes
  with Expo Go, so there's still no need for a development build. The file uses WAL mode, so the
  app can read from it while it's writing.
- **A table with rules.** `plant_records` has a column for each part of a record, and it checks the
  same things the app does:
  - the species name can't be empty
  - the condition and the upload state have to be on the list
  - a height has to be more than 0, and the photo count can't be negative
  - latitude has to be between -90 and 90, longitude between -180 and 180, and the accuracy can't
    be negative
  - a location is all four parts (latitude, longitude, accuracy and time) or none of them
  - two records can't have the same ID or tag code

  So if a bug in the app ever made a bad record, the table would turn it down instead of item 10
  uploading it. It's a `STRICT` table too, so SQLite turns down a value of the wrong type (like
  words in the height column) instead of saving it anyway.
- **Versions.** The database remembers its version (`PRAGMA user_version`), and when the app opens
  it runs the steps that phone hasn't run yet. Each step runs in a transaction with its version
  bump, so a step that fails leaves the file the way it was and runs again next time. Photos and
  the species list will be new steps on the end. If the file is from a newer copy of the app, this
  one leaves it alone instead of changing something it doesn't understand, and shows the "Couldn't
  open" message below.
- **Saving.** Save record writes the record to the database first and only then shows it. If that
  fails, the form keeps everything typed in and shows "Couldn't save the record on this phone. Try
  again." VoiceOver and TalkBack read it out, and on the web it has `role="alert"`. Save is turned
  off while it's saving, so a quick double tap can't save the same plant twice.
- **Opening the app.** The tabs only show once the saved records have loaded, with a spinner until
  then. If the database won't open, the app says "Couldn't open the records saved on this phone."
  with a Try again button, instead of an empty list that looks like the records are gone. The
  database is closed when the screens go away (like on a reload while developing). If the phone
  kills the app instead, SQLite still keeps every record that finished saving.
- **IDs.** New record IDs come from `expo-crypto` (`~57.0.4`), which uses the phone's secure random
  number generator. Before this, a phone without `crypto.randomUUID` fell back on `Math.random`.
  The tag code is the start of the ID, so if a new tag would match one already in the list, the
  app picks another ID.
- **Sample records.** The six fake records still show so the screens have something in them, but
  only in development mode (`__DEV__`), which is how the app runs in Expo Go from
  `npx expo start`. They're never saved in the database, so item 10 can't upload them, and a store
  build starts with an empty list.
- **The web build.** SQLite on the web is still in alpha with `expo-sqlite`, and it needs a
  WebAssembly file, extra server headers and changes to the Metro config. The web build is only
  for checking layouts, so it keeps records in memory and they're gone when the page reloads.
- The "Coming in item 9" box on My Records is gone.

How the code is split:

- `src/db/database.ts` opens the database and runs the version steps. The table is the first step.
- `src/db/records-store.ts` saves and loads records, and turns table rows back into
  `PlantRecord`s. `src/db/records-store.web.ts` is the in-memory one for the web.
- `src/state/records-context.tsx` loads the saved records when the app starts and shares them with
  every screen. Its `addRecord` saves a new record on the phone before showing it.

### Automated checks

Run from `mobile/`.

| Check | Command | Result |
| --- | --- | --- |
| Unit and screen tests | `npm test` | Pass, 246 tests in 14 files (item 6 had 216 in 12) |
| Typecheck | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Expo Doctor | `npx expo-doctor` | 20 of 21 pass. The one that fails is the known `ios.icon` false alarm from item 5 |
| Package versions | `npx expo install --check` | Pass, up to date |

`expo-sqlite` needs a phone, so in Jest `jest/expo-sqlite.js` stands in for it with `sql.js`
(`^1.15.0`, a dev dependency). That's SQLite built for WebAssembly, so the tests still run the real
SQL against a table with the same rules as on the phone. It acts like the phone where it matters
too: a closed database can't be used again, and an open one can't be deleted. `jest/setup.js`
makes `expo-crypto` give real UUIDs in tests, because the jest-expo stand-in gives nothing back.

New tests:

- `src/db/__tests__/records-store.test.ts` (14 tests) saves records and reads them back: every
  field the way it went in, empty fields coming back as missing instead of `null`, newest first
  (and the later save first when two have the same time), turning down a second record with the
  same ID or tag code, 9 kinds of bad record the table should turn down, and the records still
  being there after the database is closed and opened again.
- `src/db/__tests__/database.test.ts` (5 tests) checks a new database ends up at the latest version
  in WAL mode, opening it again doesn't run the steps again, a database from a newer copy of the
  app is left alone (and closed), a step that fails is undone along with its version bump, and
  only the steps the phone hasn't run yet get run.
- `src/state/__tests__/records-context.test.tsx` (now 11 tests, was 5) checks the spinner, that
  the sample records are never saved, that a new record is saved on the phone before it shows,
  that it's still there after the app restarts, a new ID when a tag code is taken (a sample's tag
  too), a failed save leaving the list as it was, the "Couldn't open" message with Try again (and
  the splash screen going away so the message can be seen), and the database closing when the
  screens go away.
- `src/__tests__/new-record-screen.test.tsx` (2 new tests) checks the form keeps everything when
  the save fails, and that a quick double tap on Save only saves once.
- `src/__tests__/scan-screen.test.tsx` (1 new test) scans the tag of a record that was saved on
  the phone before the app opened.
- `src/data/__tests__/mock-records.test.ts` (2 new tests) checks the sample records show in a
  development build and not in a store build.
- `src/lib/__tests__/id.test.ts` now checks IDs come from `expo-crypto`, instead of testing the old
  `Math.random` fallback.
- The other screen tests now wait for the saved records to load before they start.

To check the tests catch real bugs, we broke the code on purpose 10 times. The tests failed every
time, then we put the code back:

1. Ran each version step without a transaction.
2. Took out the double tap guard on Save.
3. Kept the new ID when its tag code was already taken.
4. Showed a new record before it was saved.
5. Took out the rule that a location is all four parts or none.
6. Took out the latitude range rule.
7. Showed the sample records in store builds.
8. Left the database open when the screens go away.
9. Listed two records saved at the same time oldest first.
10. Didn't load the saved records when the app starts.

The website wasn't changed in this item.

### Tests on the iOS simulator

The simulator's location was set to a made up point near the park HQ with
`xcrun simctl location <device> set`. To look inside the database, we opened the simulator's copy
of `niah.db` on the Mac with `sqlite3`.

| # | Screen | What we did | What should happen | Result |
| --- | --- | --- | --- | --- |
| 1 | New Record | Picked *Shorea macrophylla* from the suggestions, typed 8.4 for the height, picked Diseased and pressed Capture location | Engkabang fills in as the common name, the location shows "±5 m · Good" and Save turns on | Pass |
| 2 | New Record | Pressed Save record | Opens the new record, tag NNP-0E87DF, Pending sync, with everything filled in | Pass |
| 3 | Database | Looked inside `niah.db` with `sqlite3` | Version 1, WAL mode, and one row in `plant_records`, the new record. None of the sample records are in there | Pass |
| 4 | Home | Closed Expo Go with `xcrun simctl terminate`, then opened the project again | Home shows 4 waiting to sync (the 3 sample ones and the new one) with the new record at the top, and the My Records badge shows 4 | Pass |
| 5 | Scan | Typed the tag as Nnp-0e87df and pressed Find record | Opens the record with the same species, common name, height, condition and location as before the restart | Pass |

### Tests in a browser

This was the page Metro serves at `http://localhost:8081`, in a browser on Umer's Mac. That browser
blocks location for every site, so for row 2 we swapped in a made up point near the park HQ from
the browser console, the same as the location override in the developer tools. So this checks
saving on the web, not the GPS.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| 1 | Opened the app fresh | No errors in the browser console | Pass |
| 2 | On New Record, picked *Eusideroxylon zwageri* from the suggestions, typed 6.2 for the height, picked Damaged and pressed Capture location | Belian fills in as the common name, the location shows "±7 m · Good" and Save turns on | Pass |
| 3 | Pressed Save record | Opens the new record, tag NNP-822BF8, Pending sync, with everything filled in | Pass |
| 4 | Pressed the back arrow at the top of the record page | Back on New Record with an empty form | Pass |
| 5 | Opened My Records | 7 records with the new one at the top, and the badge shows 4 | Pass |
| 6 | Reloaded the page | Back to the 6 sample records with 3 waiting to sync. The new record is gone, because the web build only keeps records in memory | Pass |
| 7 | Checked the browser console | No errors | Pass |

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| A real iPhone | Only the simulator so far | Save three records, force close the app, restart the phone and check all three are still there with every field. Then do it again with flight mode on the whole time |
| Android | No Android emulator on this Mac | Run rows 1 to 5 on an Android phone, plus the restart check above. Also check the records are still there after Android closes the app in the background |
| A full phone | Hard to fill up the simulator's storage | Fill a test phone's storage, try to save, and check the form keeps everything and shows "Couldn't save the record on this phone. Try again." Check VoiceOver or TalkBack reads it out. The screen tests fake this error |
| Updating the app | There's only one database version so far | When Sprint #2 adds the photos step, install the Sprint #1 build, save a record, update to the new build and check the record is still there |
| Hundreds of records on one phone | Nobody has that many yet | Load a phone with a few hundred records and check My Records still scrolls smoothly. The FlatList carried over to Sprint #2 fixes it if it doesn't |

### Carried over to Sprint #2

- **Photos.** Item 11 takes the photos. Each one gets saved on the phone with its record until it
  syncs, which needs a new database step.
- **The species list.** Item 10 downloads it from Supabase when the phone syncs, into a new table,
  so the suggestions match the website even without signal.
- **The upload queue.** Item 10 sends the waiting records to Supabase and marks them synced in the
  database.
- **A FlatList for My Records.** It only draws the records on screen, which matters once a phone
  has hundreds of them. It can't go inside `Screen`'s ScrollView, so My Records needs reworking
  for it.

### Security check

`npm audit` on 16 Oct 2026, after adding `expo-sqlite`, `expo-crypto` and `sql.js`.

**Website:** not changed in this item.

**Mobile:** 65 in total (16 moderate, 49 high), the same as item 6, and none of them come through
the new packages. It's still the same five advisories as
[item 5 round 2](item-5-mobile-skeleton.md#security-check): `braces`, `node-forge`, `uuid`,
`decode-uri-component` and `sprintf-js`. With `npm audit --omit=dev` it's 61 (16 moderate,
45 high), also the same as item 6. `sql.js` is a dev dependency, so it only runs in tests and never
ships in the app.

**SQL.** Every value goes into the SQL as a bound parameter and is never pasted into the SQL text,
so nothing typed into the form, like a species name or a note, can change what the SQL does.

**What's on the phone.** The records sit in the app's own folder, which other apps can't read, and
iOS and Android both encrypt the phone's storage when it has a passcode. The file isn't encrypted
on top of that yet. That's part of item 22, see
[encryption at rest](../security/encryption-at-rest.md). `expo-sqlite` can use SQLCipher for it in
a development build (it doesn't work in Expo Go). Once botanists use the app in the park the
records hold real GPS points of plants, some of them protected, so don't share the database file
or screenshots of real records anywhere public.

Don't run `npm audit fix --force`. It would drop Expo down to an old SDK and break the app.
