# Niah Ground-Truthing (mobile app)

The phone app for recording plants out in Niah National Park. It's built with Expo (SDK 57) and
Expo Router.

All five tabs from item 5 are in place, with some fake records so the other sprint items have
somewhere to plug in. The plant form from item 7 is finished, with species suggestions and checks
on what you type. Nothing talks to Supabase yet.

| Tab | What it shows |
| --- | --- |
| Home | How many plants were recorded today and whether anything is waiting to sync |
| Scan | Where the QR scanner goes, plus a box to type a tag code by hand |
| New Record | The plant form, with species suggestions, a GPS box and photo slots |
| My Records | Every record on the phone, each tagged "Pending sync" or "Synced" |
| Profile | Where sign in will go, plus some info about the phone and app |

Tapping a record (or saving a new one) opens its page.

## Running it

```bash
cd mobile
npm install
npx expo start
```

Then press `i` for the iOS simulator, `a` for an Android emulator or `w` for the browser. On a
real phone, install Expo Go (the version for SDK 57) and scan the QR code in the terminal.
Everything used so far comes with Expo Go, so you don't need a development build yet.

## What's where

```
jest/css-stub.js        stands in for CSS files in tests, because Jest can't read them
src/
  __tests__/            screen tests (they can't go in app/, see Tests below)
  app/                  screens. Every file in here is a route
    _layout.tsx         root stack, colours and the records provider
    (tabs)/             the five tabs: index (Home), scan, new-record, records, profile
    record/[id].tsx     one plant record
  components/           Screen, RecordRow, LocationSummary and the two tab bars
    ui/                 small pieces: Button, Card, Field, Chip, Pill, SyncBadge...
  constants/            colours, spacing and icon names
  data/
    mock-records.ts     fake records for testing
    species-list.ts     species the form suggests, with the same slugs as Supabase
  lib/                  formatting, the height and form checks, species search, IDs and tag codes
  state/                records-context.tsx, the in-memory store every screen reads from
  types/                PlantRecord and the other shared types
```

## Placeholders

Anything that isn't real yet has a dashed "Coming in item N" box on screen, so testers can tell
what's fake.

| Item | What goes in | Where |
| --- | --- | --- |
| 2 | Sign in with Supabase Auth | Profile tab |
| 6 | Camera and QR scanning with expo-camera | Scan tab |
| 8 | Real GPS with expo-location (replaces `mockGpsReading()`) | New Record tab |
| 9 | Saving records in SQLite so they survive a restart | `src/state/records-context.tsx` |
| 10 | Uploading records to Supabase | "Sync now" button on My Records |
| 11 | Taking photos | New Record tab |
| 12 | Printable QR tags | Record page |

## Notes for the team

- The mock coordinates are made up and sit around the park HQ. Never put real locations of
  protected plants in test data, screenshots or anything public.
- Records only live in memory, so they reset every time the app restarts. Item 9 fixes that.
- The web version is only a quick way to check layouts. The real website is in `/web`.
- The tab bar is in two files: `components/app-tabs.tsx` (native tabs on iOS and Android) and
  `components/app-tabs.web.tsx` (the browser). If you add or rename a tab, change both.
- Please try the New Record form on a real Android phone. Android apps draw edge to edge now, so
  the keyboard doesn't shrink the window. `Screen` wraps pages with text boxes in a
  `KeyboardAvoidingView` on Android to keep the focused box in view, but nobody has checked it on a
  real phone yet.
- `src/data/species-list.ts` uses the same slugs as the species table in Supabase. If you add a
  species to one, add it to the other too, until item 10 downloads the list when the phone syncs.
- Keys: copy `.env.example` to `.env` and fill it in. Only the Supabase anon key goes in the
  app. The service role key never goes in mobile code.

## Tests

```bash
npm test
```

Jest runs the tests in the `__tests__` folders, which sit next to the code they check. They cover
the helpers in `src/lib` (dates, heights, the form checks, species search, IDs and tag lookup), the
records store in `src/state`, and make sure the mock data follows the same rules as the app.

`src/__tests__/` has screen tests. They render a real screen with `renderRouter` from
`expo-router/testing-library` and tap through it the way a person would. Keep test files out of
`src/app/`, because Expo Router treats every file in there as a screen. Jest can't read CSS, so
`jest/css-stub.js` stands in for `global.css`.

Manual test results go in `docs/test-results/`. See the item 5 or item 7 ones for an example.

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
