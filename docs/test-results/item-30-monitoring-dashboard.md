# Item 30 test results: real-time environmental monitoring dashboard

These ran on 31 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `item-28-31-iot` branch. The
hosted Supabase project is behind on the SQL files (`supabase/README.md`), so the pages were tried
against the Supabase stand-in in `supabase/tests/stand-in.js`, with readings from the node simulator.
No hardware was involved. Some results say 1 Nov because the site shows Malaysia time.

## What it does

The Sensors page and the sensor parts of the overview used to be mock data, and the red number in
the staff menu was worked out from that mock data. All of it is real now, and
`web/src/data/sensors.ts` is gone.

- **Sensors page** (`/dashboard/sensors`). Tiles for nodes reporting, nodes gone quiet, urgent alerts
  nobody has acknowledged and alerts not resolved. Then the alerts, then a card for each node with
  its latest values, how long ago it was last heard and its history.
- **History charts**. One small chart for each measure on each node, with a dashed line at any alert
  limit. Hovering shows the time and value, and "Last 10 readings" opens the same numbers as a table
  for keyboard and screen reader users. A gap in the readings is left as a gap, and a quiet node's
  chart is hatched and says "no data".
- **Refreshing**. A small client component asks a server action to draw the page again every 15
  seconds. The browser can't listen to Supabase Realtime, because our Content Security Policy is
  `connect-src 'self'`, and opening that up would put the browser back in touch with the database
  for the sake of a few seconds. It stops while the tab is hidden and checks straight away when the
  tab comes back.
- **The badge in the staff menu** is the real count of urgent alerts nobody has acknowledged. On other
  dashboard pages it asks for the count every 15 seconds, and only redraws if the count changed.
- **Overview**. "Needs you today" lists real alerts with a button to the Sensors page, and there's a
  "Sensors reporting" tile. It still says the map comes with item 32.
- **Before the SQL is on the database**, the pages say so and show no numbers.

The Devices page is in [item 28](item-28-iot-framework.md), and acknowledging and resolving are in
[item 31](item-31-threat-alerts.md).

## Rules

| Rule | Why |
| --- | --- |
| Everything goes through server components and server actions | The Content Security Policy doesn't let the browser talk to Supabase |
| Status is never colour alone. It has an icon and a word as well | Some people can't see the colours, and it has to read in bright light |
| Each alert says what the problem means and what to do | The officers using this aren't technical |
| A node's age and "Quiet" come from the database, and a node that's never sent anything says "Waiting" | The page doesn't guess, and never shows a number nobody sent |
| The made up numbers 002 put in `iot_nodes` are never read | They look like real readings but they aren't |
| If the sensor SQL is missing, only the sensor parts say so. Other pages and the badge carry on | The hosted project is behind on SQL files, and that can't break the rest of the dashboard |
| The refresh doesn't take focus or move the page, and the "Updated at" line isn't a live region | A screen reader saying the time every 15 seconds would make the page useless. New alerts are announced instead |
| A slow refresh can't pile up, because the next wait only starts when the last one is done | A slow database doesn't get more requests |

## Automated checks

Run on Umer's Mac on 31 Oct 2026 after the last code change.

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Production build, no environment variables | `cd web && npm run build` | Pass. Two Turbopack font warnings that aren't from this work |
| Production build, made up https address and key | The same, with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set | Pass, and the dashboard pages are all dynamic |
| Database tests | `cd supabase/tests && npm test` | Pass, 362 of 362 in 66 suites |

The website has no tests of its own for these pages, so the results below are what checks them.

## Manual tests (stand-in, signed in as the test officer)

| Test | Result |
| --- | --- |
| No readings yet: "Nodes reporting 0 of 3", "Waiting" cards and no numbers | Pass |
| After the simulator: 3 of 3, with values and charts | Pass |
| "Updated at" moves every 15 seconds (7:44:59, 7:45:14, 7:45:30, 7:45:45, 7:46:00) | Pass |
| A disturbance sent with the Sensors page open: the alert shows after 7.5 s on one run and 13.3 s on another, where the send came just after a page check | Pass |
| A disturbance sent with the records page open, just after a page check: the badge goes from 1 to 2 after 15.1 s. The checks were 15.1 s apart | Pass |
| The status line says "New alert: Possible disturbance on NNP-IOT-01, Urgent" | Pass |
| Node goes quiet: "2 of 3", "Nodes gone quiet 1", the card says Quiet and the chart says no data | Pass |
| A calm reading from that node: the quiet alert closes by itself and the badge clears | Pass |
| Overview: "Needs you today" lists the waiting record, the urgent alert with when it was last seen and a See sensors button, and the routine alert. The tile says "Sensors reporting 4 of 4" with a test node added | Pass |
| Hover on a chart: a crosshair and "7:57 am, 54.9%" | Pass |
| "Last 10 readings" opens a table, and it stays open with the page in the same place across a refresh | Pass |
| Tab hidden, by setting `document.hidden` and sending `visibilitychange` for 46 s: no checks, and "Updated at" stays at 7:54:51 | Pass |
| Tab back: a check straight away, "Updated at" 7:55:48, and the next one 15 s later | Pass |
| 375 px wide, Sensors and Devices pages: nothing wider than the screen | Pass |

Who gets refused:

| Test | Result |
| --- | --- |
| Botanist, researcher, visitor and an account with no profile on `/dashboard`, `/dashboard/sensors` and `/dashboard/sensors/devices`: no sensor data. The botanist gets "No access" | Pass |
| Signed out: sent to the sign in page | Pass |
| `refreshSensors` called directly as a botanist or visitor: no sensor text comes back | Pass |
| Anon reading `iot_readings`, `iot_alerts`, `iot_devices`, `iot_alert_limits` and `iot_node_status` over the API: 401 | Pass |

The SQL missing, by starting the stand-in with `STAND_IN_SQL_THROUGH`:

| Test | Result |
| --- | --- |
| Through 015, Sensors page: "This database hasn't been set up for sensors yet, so there's nothing to show here. The other pages aren't affected. Ask an administrator to run the sensor steps in supabase/README.md." | Pass |
| Through 015, Devices page as admin: says there aren't any devices to manage until those steps run | Pass |
| Through 015, overview: a "Sensors aren't set up in this database yet" row and "Sensors reporting Didn't load" | Pass |
| Through 015: no badge, and the review, records, species, reports and users pages all answer 200 with no error page | Pass |
| Through 015: no error in the website's log | Pass |
| Through 016 (no alerts yet): the Devices page works, and Sensors and the overview say the same "not set up" messages | Pass |

**Fixed on 31 Oct:** a tile called "Open alerts" said 0 while an acknowledged alert was still in the
list below it. The two alert tiles now say "Urgent, not acknowledged" and "Alerts not resolved", and
count what they say.

**Fixed on 31 Oct:** the badge check on other pages was every 20 seconds. With the 10 seconds an edge
device can wait, that used the whole 30 second goal with no room for the request. It's every 15 now,
the same as the Sensors page.

## The 30 second goal

The proposal says alerts should be on the dashboard within 30 seconds of a sensor trigger. Only part
of that has been measured.

| Step | Time | How we know |
| --- | --- | --- |
| Node to edge device | Straight away for a knock, tilt or movement | From the sketch, not measured |
| Edge device to Supabase | Up to 10 s | From the sketch, not measured |
| Supabase to the open page | Up to about 15 s (7.5 s, 13.3 s and 15.1 s measured) | Measured with the simulator |
| Total | About 25 s | By adding them up |

So this should meet the goal, but it needs trying on real hardware before we say it does. It only
applies to a page that's open and showing, because a hidden tab doesn't check until it comes back.

## Not tested yet

- A real sensor trigger, so the full 30 second goal above.
- Really switching tabs. The pause was tested by setting `document.hidden` in the page, because the
  test browser couldn't be put in the background on demand.
- A screen reader. The status line and focus moves were checked in the page, not with one.
- A real phone. Phone width was only tried at 375 px in a desktop browser.
- The hosted project, which needs 003 to 017 run first.
- Many nodes, or a page left open for hours.

## Known limits

- **On a phone, the badge can start off screen.** The staff menu scrolls sideways, so on other pages
  the Sensors link and its badge may need scrolling to. The overview's "Needs you today" still shows
  the alert.
- **Nothing tells anyone who isn't looking.** Alerts only show on the dashboard, and nothing is sent
  to a patrol team yet.
- **The history makes one query for each node.** That's fine for a few nodes, but it'll want changing
  for a lot of them.
- **No sensors on the map yet.** That's item 32. `components/park-map.tsx` keeps its `sensors` prop
  for that.
