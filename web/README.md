# Niah Plant Records (website)

The website for the Digital Plant Knowledge System. It has two sides: public pages where anyone can
look up the plants of Niah National Park, and a dashboard where SFC staff review records, manage
species and keep an eye on the sensors. It's built with Next.js 16 (App Router) and Tailwind CSS 4.

The original item 13 wireframe is still the visual baseline. Staff sign in, the species pages on
the dashboard (add, edit and delete) and the public plant list and plant pages now use Supabase
(items 14 to 16). The other dashboard screens still use mock data, and refreshing them puts them
back how they were.

| Side | Screens |
| --- | --- |
| Public | Home, plant list with search, a page for each plant, scan a tag, tag pages, staff sign in |
| Staff | Overview, species, add, edit and delete a species, review queue, reports, sensors, users and roles |

## Running it

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:3000. The public pages and staff sign in use Supabase when configured,
so copy `.env.example` to `.env.local` and fill in the project URL and publishable key. The app
accepts both `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` and the Supabase export
names `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`. Without them `/login` says sign in isn't set up
and `/dashboard` sends you back to `/login`. A production build (`npm run build`) also needs the
project URL to start with `https://` (item 23), and treats any other URL as not set up.

For the demo, start at http://localhost:3000/screens. It lists every screen in the order we show
them, with what works on each one. The pink strip at the top of every page links there too.

## Trying sign in without a Supabase project

`supabase/tests/stand-in.js` is a stand-in for our Supabase project that runs on your computer,
with a made up account for each role. It's for trying sign in and the dashboard without a real
project or real accounts. Start it in one terminal:

```bash
cd supabase/tests
npm install
npm run stand-in
```

Then start the website in a second terminal. On macOS or Linux:

```bash
cd web
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=stand-in-anon-key npm run dev
```

In PowerShell on Windows:

```powershell
cd web
$env:NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "stand-in-anon-key"
npm run dev
```

Values set in the terminal win over `.env.local`, so there's no need to change it. In PowerShell
they stay set until you close that window. Sign in at http://localhost:3000/login as
`officer@example.test` or `admin@example.test`. The botanist, researcher, visitor and noprofile
accounts get "No access". The stand-in lists the accounts when it starts, and the password is
`TEST_PASSWORD` in `stand-in.js`. Everything in it is made up, and it all goes when you stop it.
[supabase/README.md](../supabase/README.md#tests) has more about it.

This only works with `npm run dev`. The stand-in's URL is http, so a production build of the
website says sign in isn't set up.

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
      login/            staff sign in and sign out, with Supabase Auth
      screens/          every screen in demo order
    dashboard/          the staff side, with the sidebar in layout.tsx
      review/           approve or reject records sent from the mobile app
      species/          the species table, new/ to add one, and [slug]/edit and [slug]/delete
      reports/          the CSV export
      sensors/          alerts, the sensor nodes and their map
      users/            who has an account and what each role can do
  components/           shared pieces: sketch map, tree tag, planned tape, icons...
  data/                 mock species, records, people and sensors, plus the screen list
  lib/                  Supabase and sign in, species form checks, IUCN labels, the location grid
```

## Planned features

Anything that isn't built yet has a strip of pink flagging tape on it, like the tape field teams tie
on trees they need to come back to. The tape says which item it belongs to and which sprint it's
planned for, so it's clear what's real during the demo. The item numbers match the proposal and
`docs/sprint-1.md`, and they're listed in `src/lib/release.ts`.

| Item | What goes in | Where |
| --- | --- | --- |
| 2 | Invites and changing someone's role | Users and roles |
| 12 | QR codes that really scan, printed for each tag | Scan a tag, tag pages |
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
- Public plant pages query the `species_public` and `records_public` views, never the tables.
  `records_public` only gives the exact spot of a plant that's LC or NT and isn't protected in
  Sarawak, and the middle of its grid square for every other plant (006, item 4). Keep the exact
  spots of threatened and protected plants in server-only staff workflows, and never select them
  into a public page response.
- A species hides its exact spot if it's threatened on the IUCN Red List (VU, EN or CR) or
  protected in Sarawak. See `hidesLocation()` in `src/data/species.ts`. Public pages only get a
  rough area: the server snaps the point to a 0.004 degree grid square (about 440 m at Niah) in
  `src/lib/geo.ts` before the page is built, so the exact point never reaches the browser. Keep it
  that way on every public page.
- Client components (files starting with `"use client"`) only import from `src/lib` and
  `src/components`, never from `src/data`, because anything they import gets sent to the browser.
  `import type` from `src/data` is fine since types disappear at build time. For the same reason
  `SketchMap` is only used in server components.
- Every staff page starts with `if (!(await requireStaff())) return null;` from
  `src/lib/auth.ts`, and a new staff page needs it too. The check in `dashboard/layout.tsx` isn't
  enough on its own. Next renders a page and its layout at the same time, so a layout that shows
  "No access" doesn't stop the page's data from reaching the browser.
- Staff pages do send exact points to the browser (review queue, reports and the overview map), so
  the reports CSV should be built on the server (item 21). The database checks roles too (006,
  item 4), so the staff views give anyone else nothing.
- Sign in and the species forms post to server actions, so nothing anyone types ends up in the
  address bar. The other wireframe forms don't have `name` attributes and never submit anywhere.
  The plant search keeps `?q=` in the URL on purpose, so a search can be shared.
- The species form checks live in `src/lib/species-form.ts`, so the page runs them before it sends
  the form and the server action runs them again before it saves. A species' scientific name can't
  change once it's added, because its public page link and its records use it.
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
