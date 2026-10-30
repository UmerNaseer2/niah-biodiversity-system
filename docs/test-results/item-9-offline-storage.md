# Item 9 test results: offline storage

Two rounds, both on the iOS simulator and in a browser: round 1 on 16 Oct 2026 and round 2 on
29 Oct 2026. Until now records only lived in memory, so a new record was gone as soon as the app
restarted. This item saves them in SQLite on the phone with `expo-sqlite`, so a record stays on
the phone through a restart, a crash or a flat battery until item 10 uploads it.

Round 1 was the Sprint #1 part of item 9. Round 2 finishes the item in Sprint #2: the phone now
keeps the species list, the records waiting to upload and what happened when each one was sent,
and My Records is a FlatList. Photos get saved with their record in item 11, since that's the
item that takes them (see [Left for items 10 and 11](#left-for-items-10-and-11)).

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

## Round 2: 29 Oct 2026, iOS simulator and browser

Run on Umer's Mac on the item 9 branch, in Expo Go on the same iPhone 17 Pro simulator as round 1,
and in a browser on the same Mac. The simulator still had the round 1 database, so it was backed up
first and put back at the end.

### What we built

- **The species list on the phone.** A new version step (version 2) adds a `species` table with
  the slug, the scientific name and the common names. Item 10 downloads the list from Supabase when
  the phone syncs, and `replaceSpecies` saves it. It swaps the whole list in one transaction, so if
  any species in the download can't be saved (an empty name or the same slug twice), nothing
  changes and the old list stays. It turns down an empty list too, with "The species list that came
  down was empty, so the old one stays.", because row level security on Supabase hands back no
  rows instead of an error when an account can't read a table. Until the first download the table
  is empty and the New Record form uses the list that comes with the app, like before. After that
  it suggests and links species from the downloaded list, so a species added on the website shows
  up on the phone without an app update.
- **The records waiting to upload.** `loadWaiting` gives item 10 the records that still have to go
  up, oldest first so they reach the server in the order they were made. The sample records are
  never in it, because they're never saved.
- **What happened to each upload.** `saveUploadOutcome` saves the answer from
  `src/sync/upload-row.ts` on the phone:
  - synced: the record is marked synced
  - try again later (like no signal): nothing changes
  - a problem someone has to sort out (a tag clash, an account without the botanist role, or a
    value the server turned down): the record stays waiting and remembers which problem it was

  The problem goes in a new `upload_problem` column (version 3), so the phone can still say what's
  wrong after the app restarts. The table only lets a waiting record have one, and marking a
  record synced clears it. If no saved record has the ID, it fails with "No record with that ID is
  saved on this phone." instead of quietly doing nothing.
- **"Couldn't upload".** A record with a problem shows a red "Couldn't upload" tag in My Records and
  on its page, instead of "Pending sync". Its page also has a "Couldn't upload" card above Details
  that says what to do about it, like asking an officer to sort out a tag clash before printing the
  plant's tag. Item 10 is what sets these, so for now only the tests and the simulator check below
  make one.
- **A FlatList for My Records.** The new `ListScreen` in `src/components/screen.tsx` looks the same
  as the other tabs but only draws the rows near the screen, so My Records stays quick with a few
  thousand records. The title, the waiting banner and the filter chips scroll with the list.
- **Saving a record while the species list is being replaced.** `replaceSpecies` writes on its own
  connection to the database, so a record saved at the same time can't end up inside that
  transaction and get undone with it if the list fails. The record waits instead. The main
  connection has `PRAGMA busy_timeout = 5000`, so it waits up to 5 seconds rather than failing
  straight away.
- **Phones from Sprint #1.** A phone with the round 1 database (version 1) runs steps 2 and 3 the
  next time the app opens. Its records stay, with no upload problem.
- **The web build.** It still keeps everything in memory, and now has the same functions with the
  same rules as the tables.

How the code is split:

- `src/db/database.ts` has the two new version steps and sets the busy timeout.
- `src/db/records-store.ts` has `loadWaiting`, `saveUploadOutcome`, `loadSpecies` and
  `replaceSpecies`. `src/db/records-store.web.ts` is the in-memory one for the web.
- `src/state/records-context.tsx` loads the species list with the records when the app starts,
  shares the list the form should use, and updates the record in the list once an outcome is
  saved.
- `UploadProblem` moved to `src/types/plant-record.ts`, because the phone now keeps it with the
  record.

### Automated checks

Run from `mobile/`.

| Check | Command | Result |
| --- | --- | --- |
| Unit and screen tests | `npm test` | Pass, 297 tests in 16 files (`main` had 267 in 15) |
| Typecheck | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Expo Doctor | `npx expo-doctor` | 21 of 21 pass |
| Package versions | `npx expo install --check` | Pass, up to date |

New tests:

- `src/db/__tests__/records-store.test.ts` (now 32 tests, was 14) checks the waiting list comes
  back oldest first with problems and all and none that are synced, each of the three outcomes, a
  synced record never getting a problem, the message when no record has the ID, and the outcome
  still being there after the database is closed and opened again. For the species list it checks
  there's nothing before the first download, the list coming back in the order it came down,
  a new list replacing the old one, the old list staying when the new one is empty or has a
  repeated slug, an empty slug or an empty scientific name, and the list still being there after
  a restart. Two more kinds of bad record are turned down: a problem that isn't on the list, and a
  problem on a synced record.
- `src/db/__tests__/database.test.ts` (now 7 tests, was 5) brings a version 1 database up to date
  and checks its records are still there, and checks the table only lets a waiting record have an
  upload problem.
- `src/state/__tests__/records-context.test.tsx` (now 17 tests, was 11) checks the samples are
  never handed over for upload, an outcome showing straight away and after the app restarts, a
  failed save leaving the list as it was, the form using the list that comes with the app until
  the first download and the downloaded list straight away and after a restart, and a failed
  species save keeping the old list.
- `src/__tests__/new-record-screen.test.tsx` (1 new test) suggests and links a species that's only
  in the downloaded list.
- `src/__tests__/records-screen.test.tsx` (new, 3 tests) checks My Records lists every record with
  the right tag, the filter chips, and the "Couldn't upload" card on the record's page.

In Jest the database is still `sql.js` (see round 1). Its stand-in for
`withExclusiveTransactionAsync` runs the same steps on a second connection, but the connections
share one database in memory, so the tests can't show a record waiting for the other connection.
That part was checked on the simulator instead (row 3 below).

To check the tests catch real bugs, we broke the code on purpose 14 times. The tests failed every
time, then we put the code back:

1. Took the "only a waiting record" part out of the `upload_problem` rule.
2. Kept the problem when a record was marked synced.
3. Cleared the problem when the record should be tried again.
4. Listed the waiting records newest first.
5. Put synced records in the waiting list.
6. Replaced the species list without a transaction.
7. Let an empty species list replace the old one.
8. Listed the species A to Z instead of in the order they came down.
9. Dropped the upload problem when reading a record back.
10. Used the saved species list even when it was empty.
11. Didn't show an outcome until the app restarted.
12. Showed "Pending sync" on a record with a problem.
13. Took out the "Couldn't upload" card on the record's page.
14. Ignored the filter chips in My Records.

The website wasn't changed in this item.

### Tests on the iOS simulator

Rows 2 and 3 needed the species list to be replaced, which only item 10 does from the app. So for
those rows a few lines were added to the app to call `replaceSpecies` when it opened, and taken out
again before the commit. As in round 1, we looked inside the simulator's copy of `niah.db` on the
Mac with `sqlite3`.

| # | Screen | What we did | What should happen | Result |
| --- | --- | --- | --- | --- |
| 1 | Database | Opened the app on the round 1 database (version 1, with record NNP-0E87DF), then looked inside it | Version 3, NNP-0E87DF still there and its `upload_problem` is empty | Pass |
| 2 | Database | Replaced the species list with one species and read it back | The table has just that species, with its common names | Pass |
| 3 | Database | Replaced the list with 3,001 species where the last one repeats a slug, and saved a record 15 ms later on the main connection | The replace fails with "UNIQUE constraint failed: species.slug" after about 670 ms. The record waits and then saves (688 ms). The old list and the new record are both kept. Afterwards the list was set to the one that comes with the app plus *Ficus benjamina* (Weeping fig), and the test record was deleted | Pass |
| 4 | Database | With `sqlite3`, gave NNP-0E87DF the tag-clash problem, then tried to mark it synced without clearing it | The table turns it down with "CHECK constraint failed" | Pass |
| 5 | My Records | Restarted the app and opened My Records | 7 records, "4 records waiting to sync", chips All 7, Pending 4 and Synced 3. NNP-0E87DF is at the bottom with a red "Couldn't upload" tag. The list scrolls and the last row clears the tab bar | Pass |
| 6 | Record | Opened NNP-0E87DF | "Couldn't upload" under the title, and a "Couldn't upload" card above Details with the tag clash message | Pass |
| 7 | New Record | Typed "weep" for the species | Suggests *Ficus benjamina*, Weeping fig, which is only in the saved list | Pass |

### Tests in a browser

This was the page Metro serves at `http://localhost:8081`, in a browser on Umer's Mac. The web build
starts with the 6 sample records and no downloaded species list.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| 1 | Opened My Records fresh | 6 records, "3 records waiting to sync" and chips All 6, Pending 3 and Synced 3 | Pass |
| 2 | Pressed the Pending chip | Only the 3 waiting records show | Pass |
| 3 | Went back to All and scrolled to the bottom | The last record, *Dryobalanops aromatica*, sits above the tab bar | Pass |
| 4 | On New Record, typed "nep" for the species | Suggests *Nepenthes ampullaria*, Pitcher plant, from the list that comes with the app | Pass |
| 5 | Checked the browser console | No errors or warnings | Pass |

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| A real iPhone | Only the simulator so far | Run the round 1 restart check on a phone, then rows 1, 5 and 6 above |
| Android | No Android emulator on this Mac | Run the round 1 rows and rows 1, 5 and 6 above on an Android phone |
| A real sync | Item 10 adds the "Sync now" button that uses these functions | When item 10 is merged, sync a phone with a waiting record and check it shows Synced, then give it a tag clash on the stand-in and check the "Couldn't upload" card |
| A few thousand records on a real phone | Only the simulator's 7 so far | Load a test phone with a few thousand records and check My Records still scrolls smoothly |

### Left for items 10 and 11

- **Photos.** Item 11 takes the photos and saves each one on the phone with its record until it
  syncs. That's a new version step on the end of `MIGRATIONS`.
- **Downloading and uploading.** Item 10 adds the Supabase client and the "Sync now" button. It
  calls `loadWaiting`, sends each record, saves what happened with `saveUploadOutcome`, and saves
  the downloaded species list with `replaceSpecies`. The "Uploading comes in item 10" line in the
  My Records banner goes then too.

### Security check

`npm audit` on 29 Oct 2026, from `mobile/`. No packages were added in this round.

**Website:** not changed in this item.

**Mobile:** 19 in total (13 low, 6 high), down from 65 in round 1 because of the Expo patch updates
since then. They come from three advisories: `decode-uri-component` and `zod` (high) and
`deepmerge` (low), and none of them come through the code in this item. With
`npm audit --omit=dev` it's 17 (11 low, 6 high).

**SQL.** The new queries use bound parameters too, so a species name from the download can't change
what the SQL does. The species list is names only, never locations.

**What's on the phone.** Same as round 1: the database isn't encrypted on top of the phone's own
encryption yet (item 22), so don't share the database file or screenshots of real records
anywhere public.

Don't run `npm audit fix --force`. It would drop Expo down to an old SDK and break the app.
