# Niah Ground-Truthing (mobile app)

The phone app for recording plants out in Niah National Park. It's built with Expo (SDK 57) and
Expo Router.

All five tabs from item 5 are in place, with some fake records (only in development mode) so the
other sprint items have somewhere to plug in. The plant form from item 7 is finished, with species
suggestions and checks on what you type. Since item 8 the form gets the location from the phone's
GPS, and a record can't be saved without one. Since item 6 the Scan tab uses the camera to read a
plant's QR tag and open its record. Since item 9 the records are saved in SQLite on the phone, so
they're still there after the app restarts, and the phone has a place to keep the species list and
what happened to each upload. Since item 10 you sign in on the Profile tab, and the app uploads
waiting records by itself when it has signal, then reads back what officers decided and downloads
the species list ([docs/sync-design.md](../docs/sync-design.md) explains the rules).

| Tab | What it shows |
| --- | --- |
| Home | How many plants were recorded today and whether anything is waiting to sync |
| Scan | The camera, which opens a record from its QR tag, plus a box to type a tag code by hand |
| New Record | The plant form, with species suggestions, GPS capture and up to 5 photos |
| My Records | Every record on the phone, tagged "Pending sync", "Synced", "Approved", "Rejected" or "Couldn't upload", plus a Sync now button |
| Profile | Signing in and out, what's on the phone, when it last synced and some info about the app |

Tapping a record (or saving a new one) opens its page.

## Running it

```bash
cd mobile
npm install
npx expo start
```

Then press `i` for the iOS simulator, `a` for an Android emulator or `w` for the browser. On a
real phone, install Expo Go (the version for SDK 57) and scan the QR code in the terminal.
Everything used so far comes with Expo Go (`expo-location`, `expo-camera`, `expo-sqlite`,
`expo-crypto`, `expo-secure-store` and `expo-network` included), so you don't need a development
build yet. Expo Go asks for location and
camera access with its own text. Ours, set in `app.json`, only shows in a development or store
build.

## What's where

```
jest/
  css-stub.js           stands in for CSS files in tests, because Jest can't read them
  expo-sqlite.js        stands in for expo-sqlite in tests, using sql.js (see Tests below)
  setup.js              runs before every test file, and makes expo-crypto give real UUIDs
src/
  __tests__/            screen tests (they can't go in app/, see Tests below)
  app/                  screens. Every file in here is a route
    _layout.tsx         root stack, colours and the account, records and sync providers
    (tabs)/             the five tabs: index (Home), scan, new-record, records, profile
    record/[id].tsx     one plant record
  components/           Screen, ListScreen, RecordRow, LocationCapture, LocationSummary, QrScanner,
                        PhotoCapture, RecordPhotos and the two tab bars
    ui/                 small pieces: Button, Card, Field, Chip, Pill, SyncBadge, SyncBanner...
  constants/            colours, spacing and icon names
  data/
    mock-records.ts     fake records for testing
    species-list.ts     species the form suggests, with the same slugs as Supabase
  db/                   the SQLite database on the phone
    database.ts         opens niah.db and runs the steps that set up and update its tables
    records-store.ts    saves and loads records, the records waiting to upload and the species
                        list. The .web.ts one keeps them in memory instead
  hooks/                use-gps-capture.ts (GPS with expo-location), use-photo-capture.ts (the
                        camera and the library), use-now.ts (the time, read again when the app
                        comes back to the front), plus the theme hooks
  lib/                  formatting, the GPS and QR rules, the height and form checks, species
                        search, IDs and tag codes, saving photo files, the Supabase client and
                        how the session is stored in the keychain
  state/                records-context.tsx loads the saved records when the app starts and
                        shares them with every screen. account-context.tsx looks after signing
                        in, and sync-context.tsx decides when to sync
  sync/                 sync-engine.ts runs one sync from start to finish, supabase-api.ts makes
                        the real server calls, and upload-row.ts has the rules for uploading a
                        record or a photo and reading the answer
  types/                PlantRecord and the other shared types
```

## Notes for the team

- The mock coordinates are made up and sit around the park HQ. Never put real locations of
  protected plants in test data, screenshots or anything public.
- The GPS is real now, so a record shows where you really stood. Don't post screenshots of records
  from the park anywhere public, like a GitHub issue.
- A record needs a location to save. On the iOS simulator, pick one with Features > Location in
  the Simulator menu, or run `xcrun simctl location booted set 3.8141,113.7787` (the park HQ,
  which is public). On an Android emulator it's under Extended controls > Location.
- To try photos on the iOS simulator, use "Choose from library", since it has no camera. Add your
  own test picture with `xcrun simctl addmedia booted <file>`.
- The iOS simulator has no camera, so the camera box on the Scan tab stays black there. Try
  scanning on a real phone: make a QR code that holds `NNP-3F2A9C` (the mock Belian) and point the
  phone at it on another screen. On the simulator, type the tag code instead. On iOS, turning
  camera access on or off in Settings closes Expo Go, so open the project again after.
- A printed QR tag holds a link to the plant's page on the website
  (`https://<website>/tag/NNP-3F2A9C`), so a normal phone camera can open it. The address comes
  from `EXPO_PUBLIC_SITE_URL` in `.env`, and a build without it puts only the tag code on the tag
  (`NNP-3F2A9C`). The Scan tab reads both, but it only takes the code out of a link and never opens
  it. Set the address before printing real tags, because a printed tag can't be changed later. It
  has to be https, apart from `http://127.0.0.1` and `http://localhost` for trying it on one
  computer.
- Records are saved in SQLite on the phone (`niah.db`), so they're still there after the app
  restarts. The fake records are never saved, and they don't show at all in a store build. To start
  again with an empty list, delete the app (or Expo Go) and install it again.
- To change the database, add a new step to the end of `MIGRATIONS` in `src/db/database.ts`. Never
  edit a step that's already merged, because a phone that ran it won't run it again. If a phone's
  database is newer than the app (say you went back to an older build), the app asks you to update
  it and doesn't touch the records.
- The web version is only a quick way to check layouts. The real website is in `/web`. On the web,
  records are only kept in memory, so a new one is gone when the page reloads, even though the
  My Records banner says it's saved on the phone.
- The tab bar is in two files: `components/app-tabs.tsx` (native tabs on iOS and Android) and
  `components/app-tabs.web.tsx` (the browser). If you add or rename a tab, change both.
- Please try the New Record form on a real Android phone. Android apps draw edge to edge now, so
  the keyboard doesn't shrink the window. `Screen` wraps pages with text boxes in a
  `KeyboardAvoidingView` on Android to keep the focused box in view, but nobody has checked it on a
  real phone yet.
- `src/data/species-list.ts` uses the same slugs as the species table in Supabase, but it has two
  the server doesn't have yet, *Durio graveolens* and *Dryobalanops aromatica*. A record of one
  of those still uploads, because the server keeps the species name and only clears a slug it
  doesn't know. If you add a species, add it to both. The phone downloads the list when it
  syncs and keeps that one (`src/db`), so it only uses this file until the first sync.
- Keys: copy `.env.example` to `.env` and ask Umer for the values. Only the Supabase anon key
  goes in the app. The service role key never goes in mobile code.
- To try syncing without a real project, start the stand-in (`npm run stand-in` in
  `supabase/tests`), then start the app with `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY=stand-in-anon-key` set in front of `npx expo start --clear`. Those
  beat what's in `.env`. It only works on the iOS simulator, because 127.0.0.1 on a real phone is
  the phone itself. The [supabase README](../supabase/README.md) lists the stand-in's accounts.

### The patch in `patches/`

`npm audit` flagged the `decode-uri-component` that Expo Router uses to read links. The fixed version
only has a default export, so `overrides` in `package.json` moves to it and
`patches/query-string+7.1.3.patch` changes the one line that loads it. `patch-package` puts the patch
back after every install. When Expo Router stops using `query-string` 7 (`npm ls query-string` will
show it), delete all three, along with `decode-uri-component` in `transformIgnorePatterns`.

## Tests

```bash
npm test
```

Jest runs the tests in the `__tests__` folders, which sit next to the code they check. They cover
the helpers in `src/lib` (dates, heights, the form checks, the GPS and QR rules, species search, IDs
and tag lookup), the GPS and clock hooks in `src/hooks` (GPS against a mocked `expo-location`),
the sync badge and banner in `src/components/ui`, the database and records store in `src/db`, the
records, account and sync providers in `src/state`, how the session is split up for the keychain
in `src/lib`, and the upload rules and every path through a sync in `src/sync` (the upload rules
against the same example records as the SQL tests in `supabase/tests/`). They also make sure the
mock data follows the same rules as the app.

The time limit per test is 30 seconds, because with an empty Jest cache, like on CI, a screen gets
compiled during its first test.

`expo-sqlite` needs a phone, so in tests `jest/expo-sqlite.js` stands in for it with `sql.js`, which
is SQLite built for WebAssembly. The tests still run our real SQL against a table with the same
rules as on the phone. `jest/setup.js` runs before every test file and makes `expo-crypto` give
real UUIDs, because the jest-expo stand-in gives nothing back.

`src/__tests__/` has screen tests. They render a real screen with `renderRouter` from
`expo-router/testing-library` and tap through it the way a person would. The Scan tab ones mock
`expo-camera`, so they can pretend the camera saw a QR code. Keep test files out of `src/app/`,
because Expo Router treats every file in there as a screen. Jest can't read CSS, so
`jest/css-stub.js` stands in for `global.css`.

Manual test results go in `docs/test-results/`. See the item 5 to 10 ones for an example.

## Before you open a pull request

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

All four should pass with no errors. GitHub runs all four again on every pull request, and the
result shows at the bottom of the PR.

Expo Doctor has one known false alarm. It says `Field: ios.icon - cannot access file at
'./assets/expo.icon'`, because it tries to read our Liquid Glass icon folder as a PNG. Expo's own
config schema allows a `.icon` folder there and the build uses it fine, so you can ignore that one
message. The CI step lets it through and fails on anything else.
