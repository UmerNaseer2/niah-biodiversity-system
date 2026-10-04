# Niah Ground-Truthing (mobile app)

The phone app for recording plants out in Niah National Park. It's built with Expo (SDK 57) and
Expo Router.

Right now this is the skeleton from item 5. All five tabs are in place with their layouts and
some fake records, so the other sprint items have somewhere to plug in. Nothing talks to
Supabase yet.

| Tab | What it shows |
| --- | --- |
| Home | How many plants were recorded today and whether anything is waiting to sync |
| Scan | Where the QR scanner goes, plus a box to type a tag code by hand |
| New Record | The plant form, with a GPS box and photo slots |
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
src/
  app/                  screens. Every file in here is a route
    _layout.tsx         root stack, colours and the records provider
    (tabs)/             the five tabs: index (Home), scan, new-record, records, profile
    record/[id].tsx     one plant record
  components/           Screen, RecordRow, LocationSummary and the two tab bars
    ui/                 small pieces: Button, Card, Field, Chip, Pill, SyncBadge...
  constants/            colours, spacing and icon names
  data/mock-records.ts  fake records for testing
  lib/                  date and number formatting, record IDs and tag codes
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
| 7 | Finishing the plant form | New Record tab |
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
- Item 7: please try the form on a real Android phone as well. The keyboard covers fields
  differently there.
- Keys: copy `.env.example` to `.env` and fill it in. Only the Supabase anon key goes in the
  app. The service role key never goes in mobile code.

## Before you open a pull request

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

All three should pass with no errors.
