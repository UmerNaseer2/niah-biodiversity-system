# Item 20 test results: plant species distribution maps (basic)

Round 1 was on 29 Oct 2026 on Umer's Mac (Node 22) on the `item-20-maps` branch. The hosted
Supabase project doesn't have the SQL files after 002 yet, so the pages were tried against the
Supabase stand-in in `supabase/tests/stand-in.js` (see `web/README.md`), with the stand-in's own
sample records.

## What it does

- **Real maps instead of the sketch maps.** Every map on the website is now a Leaflet map on
  OpenStreetMap tiles, with zoom buttons, the OSM attribution and a legend under it. Scrolling the
  page doesn't zoom the map, so it can't trap someone scrolling past it.
- **Plant pages** (`/plants/[slug]`) show where the species has been tagged. A species that can
  show its exact spot gets a dot for each approved record. A threatened or protected species only
  gets a shaded square for each grid square it's been tagged in, about 440 m across.
- **Tag pages** (`/tag/[code]`) show the plant's dot when its spot can be shown. A plant with no
  species yet gets the rough square instead. A threatened or protected plant still gets no map,
  just the link to the rough area on its species page, the same as before.
- **The overview** (`/dashboard`) map now shows every plant record from `records_staff` that
  hasn't been rejected, at its exact spot, so officers can see where the field team has been. The
  sensors on it are still mock data and keep their item 32 tape.
- **The sensors page** draws the mock sensor nodes on the same map, with offline sensors hollow and
  sensors with an alert circled.
- Each map has a name and a written description for screen readers, built on the server from the
  same data as the dots. While Leaflet loads the box says "Loading the map…", and if it can't load
  it says so.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Which map library | Leaflet 1.9 with OpenStreetMap tiles | Free, no API key, and it's the "mapping library" the proposal had in mind. Leaflet is small and doesn't need a framework wrapper |
| How Leaflet is loaded | `import("leaflet")` inside an effect in a client component | Leaflet needs `window`, so it can't run on the server. The rest of the page still renders on the server |
| What the browser gets for a hidden species | Only the rough squares, worked out on the server with `roughAreas()` in `lib/geo.ts` | Anything a client component is given ends up in the page. The points never leave the server, same as with the sketch maps |
| How labels go on the map | Built as text nodes, never as HTML | Names come from the database, so treating them as HTML would let someone put a script in a common name |
| Exact spots on the overview | Yes, from `records_staff` | Only officers and admins can open the overview, and `records_staff` only answers them (006). Rejected records are left off because they aren't plants we know are there |
| Zoom on scroll | Off, the buttons still zoom | Otherwise scrolling down a plant page gets stuck zooming the map |
| How far the map zooms in to start | At most zoom 15 | Closer than that and the map lost the park around a single square |

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Build | `cd web && npm run build` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |

The website has no unit tests yet. The location rule the maps depend on (`records_public`, 007) is
already covered by the database tests, and nothing in the database changed in this item.

## Manual tests (stand-in)

| Test | Result |
| --- | --- |
| Belian plant page (Vulnerable): the map loads OSM tiles and shows one shaded square and park HQ. There's no dot anywhere on the map | Pass |
| The "Rough area" and "Park HQ" labels don't sit on top of each other | Pass (they did at first, the rough area label moved to the square's top corner) |
| Tag NNP-3F2A9C (Belian): no map, the hidden spot text and the link to the species page, as before | Pass |
| Tag NNP-D00D01 (the stand-in's Least Concern tree): the map shows its dot and park HQ, and the description says "about 130 m north of park HQ" | Pass |
| Overview signed in as the test officer: 9 plant dots for the stand-in's 10 records (the rejected one is left off) and 5 sensors, with the planned tape for item 32 on top of the map | Pass |
| Sensors page: 5 sensors, 1 hollow (offline), 3 circled (alerts), and no plant dots | Pass |
| Each map's region has its name and points to its description, for example "Map showing tag NNP-D00D01" | Pass |
| The OpenStreetMap attribution shows in the corner of every map | Pass |
| Plant page at phone width (375 px): the map fits, there's no sideways scrolling and the legend wraps | Pass |
| No errors in the browser console after a fresh load of the maps | Pass |

## Not tested yet

- The "The map didn’t load" message. It shows if Leaflet's code can't be fetched, which is hard to
  cause on purpose in the dev server.
- A screen reader. The region names and descriptions were checked in the page, but not read out.
- The pages against the hosted project, which needs 003 to 009 run first.
- A slow or offline phone in the park, where tiles may not load at all.

## Known limits

- **Labels can overlap** when plants are close together, like on the overview. Zooming in with the
  buttons spreads them out.
- **The dots aren't buttons.** They can't be focused or clicked to open a record. Plant pages list
  their records in text as well, and staff have the records page.
- **The tiles come from openstreetmap.org.** Every visitor's browser asks OSM for them directly, so
  OSM sees their IP address. OSM's tile policy is fine with light use like ours, but a real launch
  would need a tile provider that allows more traffic.
- **No map without JavaScript.** The box says the map needs JavaScript turned on.
- **Park HQ may be in the wrong place.** The `PARK_HQ` point in `lib/geo.ts` (shared with the
  mobile app) lands in the forest on the real map, not on the HQ buildings. It needs checking
  against the real HQ before the "m from park HQ" directions mean much.
