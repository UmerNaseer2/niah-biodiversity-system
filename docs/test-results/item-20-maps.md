# Item 20 test results: plant species distribution maps (basic)

Round 1 was on 29 Oct 2026 on Umer's Mac (Node 22) on the `item-20-maps` branch. The hosted
Supabase project doesn't have the SQL files after 002 yet, so the pages were tried against the
Supabase stand-in in `supabase/tests/stand-in.js` (see `web/README.md`), with the stand-in's own
sample records. Round 2, on the same day on the `map-dot-links` branch, made the plant dots into
links. Round 3, on 30 Oct on the `map-label-overlap` branch, stopped the labels overlapping.
Round 4, on 30 Oct on the `map-without-js` branch, added a map for browsers with JavaScript off.

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
| How a dot opens its record (round 2) | A real `<a>` link inside a Leaflet marker, not a click handler on the marker | A link already works with Tab, Enter, middle click and "open in new tab", and screen readers call it a link |
| Where a dot goes (round 2) | The record's edit page on the overview, the tag page on a plant page. The tag page's own dot isn't a link | Those are the pages the lists next to the maps already link to. A link to the page you're on would do nothing |

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

## Round 2: the dots are links

| Test | Result |
| --- | --- |
| Overview: all 9 plant dots are links with names like "Edit NNP-D00D02, Strangler fig". The label beside each dot is hidden from screen readers so the name isn't read out twice | Pass |
| Tab from the map goes through the dots one at a time, then the zoom buttons. The focused dot gets the green focus ring and comes in front of any dot it overlaps | Pass |
| Clicking the Keruing sarawak dot opens that record's edit page | Pass |
| Enter on the focused Strangler fig dot opens that record's edit page | Pass |
| Dragging the map with the pointer starting on a dot moves the map and stays on the overview | Pass |
| A click that ends a drag started on a dot is blocked, but a plain click or Enter straight after still opens the record. Checked with mouse events fired from the browser console, since a slow hand drag can't be done in the test browser | Pass |
| Stand-in tree plant page (exact point): one dot, a link named "Tag NNP-D00D01", and Enter on it opens the tag page. The map's description says each dot is a link | Pass |
| Tapang plant page (protected, rough area only): no dots and no links on the map, so no link gives away a hidden spot | Pass |
| Tag NNP-D00D01: its one dot stays a plain dot | Pass |
| No errors in the browser console from clicking or pressing Enter on the dots | Pass |

## Round 3: labels make room for each other

Tested on 30 Oct 2026. Plants close together used to have their names printed on top of each other
and on top of the dots, so on the overview a few of them couldn't be read at all. Now the map checks
every label after each zoom and when the map changes size. A label that would cover a label already
shown, or a dot that isn't its own, is hidden until there's room for it. Plant names go first, then
park HQ, sensors and the rough area labels. Pointing at a dot or tabbing to it shows its name even
when another label was in the way, and that label steps aside until the pointer or focus moves on.

| Test | Result |
| --- | --- |
| Overview at the zoom it opens at: 8 of the 15 labels show, and none of them touch another label or a dot | Pass |
| One zoom in: 10 labels show. Two zoom ins: 11. Still no label touches another label or a dot once the zoom has finished | Pass |
| Tabbing to the Stand-in tree dot, whose name was hidden, shows its name, and the Slipper orchid name next to it hides. Moving focus away puts both back | Pass |
| Pointing at the same dot does the same, and moving the pointer off puts it back | Pass |
| Overview at phone width (400 px): 8 labels show, none overlapping | Pass |
| Sensors page: all 5 sensor names and park HQ show, since nothing is in the way | Pass |
| Tapang and Slipper orchid plant pages: "Rough area" and "Park HQ" both show | Pass |

## Round 4: a map without JavaScript

Tested on 30 Oct 2026. A browser with JavaScript turned off used to get a box saying the map needs
JavaScript, and nothing else. Now it gets a still map, drawn on the server by
`web/src/components/static-map.tsx`:

- It has the same OSM tiles, rough squares, park HQ, sensors and plant dots as the Leaflet map, at
  the closest zoom that fits them all (at most 15, the same as the Leaflet map).
- A plant dot that's a link on the Leaflet map is a plain link here too, so it still opens the
  record or the tag page.
- Labels go in the same order as round 3: plants, park HQ, sensors, then rough areas. A label moves
  to the other side of its dot when that keeps it on a phone's screen or out of the way, and is left
  off if it would cover another label or a dot on both sides. A plant link with no label still has
  its name as a tooltip.
- A note in the bottom right corner says to turn JavaScript on to zoom and move the map, with the
  OSM attribution under it. It's at the bottom so the planned tape on the overview can't cover it.
- It's inside a `<noscript>`, so a browser with JavaScript never loads its tiles and gets the
  Leaflet map the same as before.
- It's given the same data as the Leaflet map, so a hidden species still only gets rough squares.

The test browser can't turn JavaScript off, so each page's HTML was loaded with its scripts taken
out and the `<noscript>` shown, which is what a browser without JavaScript does.

| Test | Result |
| --- | --- |
| Overview at desktop width: tiles, 9 plant dots, 5 sensors and park HQ. 9 of the 15 labels show, and none of them touch another label or a dot | Pass (at first the Slipper orchid label touched the S-05 label by 3 px, since the label height guess was too short. It's now the real 18 px) |
| The 9 plant dots are links named like the Leaflet ones, for example "Edit NNP-D00D02, Strangler fig". The 6 with no label have their name as a tooltip | Pass |
| Overview at phone width (375 px): the same 9 labels, all inside the map with at least 55 px to spare, no sideways scrolling, and the planned tape doesn't cover the note | Pass |
| Stand-in tree plant page: one dot with its label, linking to tag NNP-D00D01 | Pass |
| Slipper orchid plant page (rough area only): one shaded square, "Rough area" and "Park HQ", and no dots or links | Pass |
| Tag NNP-D00D01: its one dot stays a plain dot | Pass |
| Tag NNP-2A1B0C (hidden): still no map, and no tiles or coordinates anywhere in the page | Pass |
| Sensors page: all 5 sensors with their names, and park HQ | Pass |
| With JavaScript on: the Leaflet map loads as before, none of the still map's tiles are in the page, and moving between map pages in a fresh tab gives no errors in the browser console | Pass |

## Not tested yet

- The "The map didn’t load" message. It shows if Leaflet's code can't be fetched, which is hard to
  cause on purpose in the dev server.
- A screen reader. The region names, descriptions and dot link names were checked in the page, but
  not read out.
- Dots on a touch screen. They're 24 px across, which is smaller than the 44 px the rest of the site
  uses for things to tap, so a phone may need a zoom in first.
- The pages against the hosted project, which needs 003 to 012 run first.
- A slow or offline phone in the park, where tiles may not load at all.

## Known limits

- **Fixed on 30 Oct:** labels used to overlap each other and the dots when plants were close
  together, like on the overview. Now a label that's in the way hides until zooming in makes room.
  See round 3 above.
- **Dots can still overlap** when plants are only a few metres apart. Zooming in spreads them out,
  and a dot under another one can still be reached with Tab, which also shows its name.
- **A sensor's name has no way to show on its own.** Plant names show when you point at the dot,
  but a hidden sensor name only comes back after zooming in. The sensors page lists them all.
- **A label near the edge of the Leaflet map gets cut off,** for example on a phone. Dragging the
  map brings it back in. The map without JavaScript moves those labels to the other side instead.
- **Fixed on 29 Oct:** the dots used to be pictures only, so they couldn't be focused or clicked to
  open a record. Now each plant dot is a link. See round 2 above.
- **The tiles come from openstreetmap.org.** Every visitor's browser asks OSM for them directly, so
  OSM sees their IP address. OSM's tile policy is fine with light use like ours, but a real launch
  would need a tile provider that allows more traffic.
- **Fixed on 30 Oct:** there was no map without JavaScript, just a box saying to turn it on. Now
  there's a still map. See round 4 above.
- **The map without JavaScript can't zoom or move,** so it only shows the labels that fit at its
  one zoom. Turning JavaScript on gives the full map.
- **Its label sizes are guesses.** The server can't measure text, so each label's width comes from
  its number of letters, on the wide side. A name full of wide letters could still touch the next
  label.
- **Its label check doesn't know about the note in the corner,** so on a busy map a label in the
  bottom right could end up under it. None do with the stand-in's data.
- **Park HQ may be in the wrong place.** The `PARK_HQ` point in `lib/geo.ts` (shared with the
  mobile app) lands in the forest on the real map, not on the HQ buildings. It needs checking
  against the real HQ before the "m from park HQ" directions mean much.
