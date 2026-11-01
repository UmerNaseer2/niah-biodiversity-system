# Item 31 test results: threat detection and alert system

These ran on 31 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `item-28-31-iot` branch. The
hosted Supabase project is behind on the SQL files (`supabase/README.md`), so everything ran against
PGlite and the Supabase stand-in in `supabase/tests/stand-in.js`, with readings from the node
simulator. No hardware was involved. Some results say 1 Nov because the site shows Malaysia time.

## What it does

The rules are in `supabase/017_iot_alerts.sql`. A trigger runs them when a reading arrives, so they
work with the website closed.

| Alert | Set off by | Starting limit | How urgent |
| --- | --- | --- | --- |
| Possible disturbance (`disturbance`) | Tilt, a hard knock or a change in distance | 30 degrees, 2.5 g, 10 cm | Urgent |
| Movement near a plant (`movement`) | The PIR | Any movement | Routine, because animals set it off too |
| Soil is very dry or very wet (`soil_dry`, `soil_wet`) | Soil moisture | Below 20%, above 85% | Routine |
| Too hot or too cold (`too_hot`, `too_cold`) | Temperature | Above 40 C, below 15 C | Routine |
| Battery low (`battery_low`) | Battery | Below 20% | Routine |
| Node has gone quiet (`quiet`) | No reading for too long | 15 minutes | Urgent, or routine if the battery was already low |

**These limits are starting values to tune.** Nobody has tried them in the field. The soil numbers
and the distance come from the testing Bryan did in `iot/testing/`, and the rest are our first guess
at what's unusual. They're in one row in `iot_alert_limits`, so they can be changed without touching
the rules.

- **One problem is one alert.** While an alert for that node and kind isn't resolved, more readings
  add to its count ("Seen 12 times") and update its times and latest value.
- **Going quiet.** No reading arrives to set this off, so something has to ask. It's checked each time
  any device sends and each time a staff page checks. A new reading closes the alert by itself.
- **Acknowledge** says someone is on it, and takes the alert out of the red number in the staff menu.
  **Resolve** closes it. Both record who and when, and the database fills those in.
- **The page** says what each alert means and what to do, and shows the value next to its limit.
  "Recently resolved" lists the ones just closed.

## Rules

| Rule | Why |
| --- | --- |
| The rules run in the database, not the website or the edge device | They work with the website closed. The edge device only does basic checks, as the proposal says |
| A reading the server refuses raises nothing, and sending a reading again doesn't count twice | A resend after a dropped connection can't make it look worse |
| A sensor the node doesn't have raises nothing | A missing value isn't a problem |
| A tilt, a knock and a distance change on one reading are counted once | They're one event, and it should say so |
| After someone resolves an alert, the same problem on the same node waits 60 minutes (`reraise_minutes`) before it makes a new alert | A soil probe that stays dry shouldn't come straight back after someone resolves it |
| An old reading from a buffer widens the alert's times but keeps the newest value | A catch-up after an outage shouldn't change what the alert says now |
| An old reading from a buffer doesn't close a quiet alert. A new one does | The node may still be quiet now |
| One silence makes one quiet alert, even if someone resolves it | It shouldn't come back every time someone opens the page |
| A node that has never sent anything isn't quiet | It hasn't started, so the sample nodes from 002 stay silent |
| Only officers and admins can acknowledge and resolve. The action checks, then the database checks again | Nobody can close an alert in someone else's name |
| Doing it twice keeps the first person | The record says who really did it |
| The database only lets one unresolved alert exist for each node and kind | Two batches arriving at the same moment can't make two |
| Only admins change the limits, and nonsense limits are turned down | One slip shouldn't turn the rules off |
| 017 stops on its first line if 016 isn't there. Running it again keeps tuned limits | The hosted project gets files one at a time |

## Automated checks

Run on Umer's Mac on 31 Oct 2026 after the last code change.

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 352 of 352 in 63 suites. 103 are new in `iot.test.js` |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Production build | `cd web && npm run build` | Pass |

The tests for this item in `supabase/tests/iot.test.js`:

| Group | What it checks |
| --- | --- |
| Threat rules | Each limit raises the right alert past it and nothing at it. A calm reading raises nothing. 50 readings of one problem are one alert with a count of 50. Different problems and different nodes get their own. A problem that carries on after it's resolved waits, then makes a new alert |
| The limits the rules use | Officers and admins read them, only admins change them and the rules follow straight away, and there's only ever one row |
| Acknowledging and resolving | Both say who and when, an alert can be resolved without being acknowledged, doing it twice keeps the first person, and anyone else is turned down |
| Nodes going quiet | One alert however often it's checked, nothing under the limit, resolving it doesn't bring it back in the same silence, a new reading closes it and a later silence makes a new one, an old reading doesn't close it, routine if the battery was low, and the count for the staff menu |
| Through the stand-in | An officer acknowledges and resolves through the API, and a botanist can't |

## Manual tests (stand-in, signed in as the test officer)

| Test | Result |
| --- | --- |
| Disturbance from the simulator: an urgent alert shows, and the badge goes to "1 urgent alert" | Pass |
| The status line says "New alert: Possible disturbance on NNP-IOT-01, Urgent" | Pass |
| Acknowledge: the badge clears, the alert says "Acknowledged by Aina Officer, 1 Nov, 7:49 am", the status line says so, and focus moves to the alert's heading | Pass |
| Resolve: the alert leaves the list, the status line says "Possible disturbance on NNP-IOT-01 resolved.", focus moves to "No open alerts", and it's under "Recently resolved" | Pass |
| Disturbance again straight after a resolve: no new alert and no badge, because of the 60 minute wait | Pass |
| Motion: a new routine alert is announced, and the badge doesn't change because it's routine | Pass |
| Quiet, on a fresh stand-in: an urgent "Node has gone quiet" alert with "Quiet for 20 minutes when this came up (limit 15 minutes)" | Pass |
| A calm reading from that node: the alert closes by itself and the badge clears | Pass |
| With the records page open: a disturbance puts the badge up within one page check. [Item 30](item-30-monitoring-dashboard.md) has the times | Pass |
| Overview: the urgent alert is under "Needs you today" | Pass |
| Botanist and visitor calling `acknowledgeAlert` and `resolveAlert` directly: "Only conservation officers and administrators can do this." | Pass |
| Signed out, calling acknowledge: sent to the sign in page | Pass |

**Fixed on 31 Oct:** one reading that broke the tilt, shock and distance limits said "Seen 3 times".
It now counts once, and there's a test for it. The running website showed this up, not the SQL tests.

## Not tested yet

- A real sensor setting an alert off. The simulator only sends what we think a knock looks like.
- Whether the limits are any good. Nobody knows yet how many false alarms a real node would make,
  in the wind or from animals.
- `iot_raise_quiet_alerts` from a scheduler. Nothing runs it on a timer yet.
- The hosted project, which needs 003 to 017 run first.
- A screen reader. The announcements and focus moves were checked in the page, not with one.

## Known limits

- **The limits are starting values**, as above.
- **Nothing is sent to anyone.** Alerts only show on the dashboard, and there's no email or push to a
  patrol team. Someone has to be looking.
- **A second knock within 60 minutes of a resolve makes no new alert.** It's the same rule that stops
  a dry soil probe coming straight back, but for a disturbance it might be the wrong call, so it's
  worth a talk with the team when tuning.
- **Quiet alerts need something to ask.** If every device has stopped and no staff page is open, a
  quiet alert only comes up when someone opens one. A scheduler such as pg_cron would fix that.
- **There's no form for the limits.** An admin changes them in the `iot_alert_limits` table.
- **A node with a broken sensor can look like a threat, or like nothing.** A soil probe that's come
  loose can read as dry rather than fail.
