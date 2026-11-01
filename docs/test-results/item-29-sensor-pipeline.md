# Item 29 test results: sensor data collection pipeline

These ran on 31 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `item-28-31-iot` branch. The
hosted Supabase project is behind on the SQL files (`supabase/README.md`), so everything ran against
PGlite and the Supabase stand-in in `supabase/tests/stand-in.js`. No hardware was involved. The node
simulator sends through the same call the edge device makes, so everything from `iot_add_readings`
onward has been tested, and everything before it hasn't.

## What it does

```
sensor node  --- WiFi, plain HTTP --->  edge device  --- HTTPS, device token --->  Supabase
```

- **`iot_readings`** (016) keeps every reading, with the device, the node, when it was recorded and
  when it arrived. Nobody can change or remove a reading through the API.
- **`iot_add_readings`** (016) is what an edge device calls with the publishable key, its device ID,
  its token and a list of readings. The answer only has counts: how many were accepted, how many
  were already there, and which were refused and why.
- **The edge device** takes out values no sensor could read and keeps the rest of the reading, so
  one broken probe doesn't lose the tilt. It holds up to 180 readings and sends up to 20 at a time
  every 10 seconds. It only forgets a batch once the server has answered for it, or has turned the
  whole batch down as bad. If the internet is down it waits 5 seconds, doubling up to 5 minutes. With
  nothing to send, it says it's alive every 5 minutes.
- **The node simulator** (`iot/node-simulator/node-simulator.mjs`) is plain Node with no packages.
  It pretends to be an edge device with 11 scenarios, so the dashboard can be shown with no hardware.
  `iot/README.md` says how to run it.
- **The stand-in** serves all of this. It comes with a made up device, `NNP-EDGE-01`, with the nodes
  `NNP-IOT-01` to `03` on it, and `STAND_IN_SQL_THROUGH` leaves out newer SQL to try a page without it.

## Rules

| Rule | Why |
| --- | --- |
| Values have to be something a sensor could read: temperature -20 to 70 C, humidity, soil, rain and battery 0 to 100%, tilt 0 to 180 degrees, shock 0 to 32 g, distance change 0 to 500 cm | Outside that is a broken sensor or a bad message. These are what the parts can measure, not what's normal for the forest. The threat limits are separate (item 31) |
| A batch is at most 100 readings | One request can't tie up the database for long |
| A reading ID is 1 to 64 letters, numbers, `_` or `-`, and only has to be unique on its own device | Sending again after a dropped connection is safe, and one device can't block another's readings by using the same ID |
| Sending a reading again keeps the first one and counts it as already there. It doesn't raise an alert again | The edge device doesn't have to be exact about what got through |
| One bad reading is turned down alone, and the answer says which and why | One broken value doesn't lose a whole batch |
| A reading can be up to 7 days old and up to 5 minutes ahead of the server, and a missing time means now | A buffered reading still counts, and a wrong clock can't put readings far in the future |
| The server sets the device and the arrival time | A device can't say a reading came from somewhere else |
| A reading with only some sensors is fine | A node doesn't need every part |
| An empty batch is fine and adds nothing | That's how an edge device with nothing to send says it's alive |
| Only officers and admins read readings. Nobody reads them with the publishable key | The readings say where nodes are and what's near them |
| Latitude and longitude are only in `iot_readings`. `iot_node_status` has none, and no public view reads any IoT table | Nodes sit beside protected plants, so an exact spot can't reach anything public |
| The simulator only sends to this computer unless told otherwise with `--allow-remote`, always refuses plain `http` to anywhere else, and has no real address or key in it | Made up readings can't reach a real project by accident |

## Automated checks

Run on Umer's Mac on 31 Oct 2026 after the last code change.

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 362 of 362 in 66 suites. 104 are in `iot.test.js` |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Production build | `cd web && npm run build` | Pass |
| Compile the edge device | `arduino-cli compile --fqbn esp32:esp32:esp32` ([item 28](item-28-iot-framework.md) has the details) | Pass, no warnings. Compiled only, not run |

The tests for this item in `supabase/tests/iot.test.js`:

| Group | What it checks |
| --- | --- |
| Adding readings | The right token adds a reading. Each range at both ends. 100 readings go in and 101 don't. Times, reading IDs and coordinates that make no sense are turned down, one bad reading goes alone, sending again adds nothing, and the answer only has counts. Every function has its search path locked and only the grants it needs |
| Who reads and changes what | Only officers and admins read readings, and nobody adds, changes or removes one directly, admins included |
| The status view for the Sensors page | It shows the newest reading even when an older one arrives after it, has no coordinates, and never shows the made up numbers from 002 |
| Nothing from a node reaches the public | Anon reads the same three views as before and no IoT table, the public views have nothing from a node in them, and the only IoT function anon can call is the one that adds readings |
| The node simulator | A calm round, a disturbance on the first node only, sending again, a value no sensor could read, a node that stops sending, stopping at a wrong token, stopping at a database without the SQL and saying what to run, refusing other addresses, and refusing a scenario it doesn't know |

## Manual tests (stand-in, driven by the simulator)

| Test | Result |
| --- | --- |
| Before any reading the Sensors page says "Nodes reporting 0 of 3", with cards saying "Waiting" and no numbers | Pass |
| After the simulator runs: "Nodes reporting 3 of 3", with values and charts from what was sent | Pass |
| The simulator's answer for a round: "added 3, already there 0, turned down 0" | Pass |
| A `disturbance` round puts an urgent alert on the first node only | Pass |
| A `motion` round puts a routine alert on the first node | Pass |
| A `quiet` round on a fresh stand-in leaves that node quiet, and the others keep going | Pass |
| With the sensor SQL left out, the pages say so and show no numbers ([item 30](item-30-monitoring-dashboard.md)) | Pass |
| Anon reading `iot_readings`, `iot_alerts`, `iot_alert_limits` and `iot_node_status` over the API: 401 | Pass |

[Item 28](item-28-iot-framework.md) has the real device flow from the website: making a token, then
sending with it, with an old token, while turned off and for another device's node.

## Not tested yet

- The whole path from a real node through a real edge device. The buffer, the retries and the
  resend after a dropped connection are compiled but have never run. The server's side of a resend
  is tested, the edge device's side isn't.
- The proposal's goal of less than 5% of readings missing over a 24 hour run. That needs a real
  node and a real edge device left running, so we can't say anything about it yet.
- Many devices sending at the same time, or a busy region.
- The hosted project, which needs 003 to 017 run first.

## Known limits

- **The edge device's buffer is in RAM.** It holds 180 readings, which is 3 nodes for an hour, and
  the oldest goes first when it's full. A power cut loses what hasn't been sent.
- **A node doesn't keep a reading it can't deliver.** It tries 3 times, then it's lost.
- **A node can't watch for knocks while it's stuck sending.** With the edge device out of reach,
  `sendReading()` holds things up for about 21 seconds (3 tries of 5 seconds, 2 seconds apart), and
  the 20 ms check for a shock doesn't run in that time, so a knock then isn't seen. Tilt still shows
  in the next reading if the node stays tilted.
- **The edge device does one thing at a time.** A node that sends during a slow HTTPS call has to
  try again.
- **`recorded_at` is when the edge device got the reading.** That's within a second or two of when
  the node took it, because the node has no clock of its own.
- **Readings pile up.** Nothing cleans out old ones yet. A few nodes won't notice for a long time,
  but it'll need a rule before many nodes go in.
- **The numbers in the sketches are starting values.** Soil and rain need calibrating for each
  probe, and nobody has tried them in the field.
