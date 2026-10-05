# Niah Plant Records (website)

The website for the Digital Plant Knowledge System. It has two sides: public pages where anyone can
look up the plants of Niah National Park, and a dashboard where SFC staff review records, manage
species and keep an eye on the sensors. It's built with Next.js 16 (App Router) and Tailwind CSS 4.

Right now this is a clickable wireframe for item 13, so we have something to show at the Sprint 1
review. Every screen is in place and runs on mock data from `src/data/`. Nothing talks to Supabase
yet and nothing is saved, so refreshing a page puts it back how it was.

| Side | Screens |
| --- | --- |
| Public | Home, plant list with search, a page for each plant, scan a tag, tag pages, staff sign in |
| Staff | Overview, species, add a species, review queue, reports, sensors, users and roles |

## Running it

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:3000. Nothing uses Supabase yet, so you can skip the `.env.local` step
in the main README for now.

For the demo, start at http://localhost:3000/screens. It lists every screen in the order we show
them, with what works on each one. The pink strip at the top of every page links there too. The
sign in page has no password. Its button just opens the dashboard.

## What's where

```
src/
  app/
    layout.tsx          fonts, the pink wireframe strip and the skip link
    globals.css         colours, fonts and the shared classes (card, btn, field, tape...)
    not-found.tsx       the 404 page
    (public)/           the public site. The brackets keep the folder name out of the URL
      plants/           plant list with search, and [slug] for one plant
      tag/              type in a tag code, and [code] for the page a QR tag opens
      login/            staff sign in (just a button for now)
      screens/          every screen in demo order
    dashboard/          the staff side, with the sidebar in layout.tsx
      review/           approve or reject records sent from the mobile app
      species/          the species table, and new/ for the add a species form
      reports/          the CSV export
      sensors/          alerts, the sensor nodes and their map
      users/            who has an account and what each role can do
  components/           shared pieces: sketch map, tree tag, planned tape, icons...
  data/                 mock species, records, people and sensors, plus the screen list
  lib/                  formatting, tag codes, IUCN labels, the location grid and the release items
```

## Planned features

Anything that isn't built yet has a strip of pink flagging tape on it, like the tape field teams tie
on trees they need to come back to. The tape says which item it belongs to and which sprint it's
planned for, so it's clear what's real during the demo. The item numbers match the proposal and
`docs/sprint-1.md`, and they're listed in `src/lib/release.ts`.

| Item | What goes in | Where |
| --- | --- | --- |
| 2, 15 | Real sign in with Supabase Auth, so only staff can open the dashboard | Staff sign in, the whole dashboard |
| 4 | Invites and changing someone's role | Users and roles |
| 12 | QR codes that really scan, printed for each tag | Scan a tag, tag pages |
| 14 | A real database instead of the files in `src/data`, and saving new species | Everywhere |
| 17 | Editing and deleting species | Species |
| 18 | Photo upload and the photo gallery | Home, plant pages, tag pages, add a species |
| 19 | Saving approve and reject decisions | Review queue |
| 20 | Real maps instead of the sketch maps | Overview, plant pages, tag pages |
| 21 | PDF reports and charts | Reports |
| 28, 29 | Live readings from the ESP32 sensor nodes | Sensors |
| 30 to 32 | The monitoring dashboard, alerts sent to the patrol team and the sensor map | Sensors, overview |

## Notes for the team

- All the data is made up. The coordinates sit around the park HQ, the names are fake and the
  emails use example.com. Never put the real location of a threatened or protected plant in mock
  data, screenshots or anything public.
- A species hides its exact spot if it's threatened on the IUCN Red List (VU, EN or CR) or
  protected in Sarawak. See `hidesLocation()` in `src/data/species.ts`. Public pages only get a
  rough area: the server snaps the point to a 0.004 degree grid square (about 440 m at Niah) in
  `src/lib/geo.ts` before the page is built, so the exact point never reaches the browser. Keep it
  that way when the real database goes in.
- Client components (files starting with `"use client"`) only import from `src/lib` and
  `src/components`, never from `src/data`, because anything they import gets sent to the browser.
  `import type` from `src/data` is fine since types disappear at build time. For the same reason
  `SketchMap` is only used in server components.
- Staff pages do send exact points to the browser (review queue, reports and the overview map).
  That's fine for made up data, but once it's real those pages need a role check on the server
  first (items 2, 4 and 15), and the reports CSV should be built on the server (item 21).
- The wireframe forms don't have `name` attributes and never submit anywhere, so nothing anyone
  types ends up in the address bar. The plant search keeps `?q=` in the URL on purpose, so a search
  can be shared.
- Dates are formatted by hand in `src/lib/format.ts`, so the server and the browser print the same
  thing. The wireframe pretends it's 9 am on 4 Oct 2026 (`MOCK_NOW`). Don't call `new Date()` or
  `Date.now()` while a page renders. In a client component it causes hydration errors, and in a
  server component the date gets frozen at build time.
- The six mock records have the same IDs and tag codes as `mobile/src/data/mock-records.ts` (for
  example the Belian is NNP-3F2A9C in both). If you change one file, change the other.
- Write Tailwind class names out in full. Tailwind can't find a class that's glued together from
  bits of strings, so it never ends up in the CSS.
- A box that scrolls sideways (`overflow-x-auto`) also needs `relative`. Otherwise screen reader
  only text inside it can poke out past the edge and make the whole page scroll on phones.

## Before you open a pull request

```bash
npm run lint
npm run build
```

Both should pass with no errors. The build prints two warnings about font fallbacks for Atkinson
Hyperlegible ("Failed to find font override values"). They're harmless. They only mean Next can't
make a size matched backup font while the real one loads.

There are no unit tests for the website yet. Click through the pages you changed, including at
375 px wide in the browser's dev tools, and check nothing scrolls sideways. GitHub runs lint and the
build again on every pull request and every push to `main`.

Manual test results go in `docs/test-results/`. See the item 13 one for the website.
