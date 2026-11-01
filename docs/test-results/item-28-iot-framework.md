# Item 28 test results: IoT device integration framework

These ran on 31 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `item-28-31-iot` branch. The
hosted Supabase project is behind on the SQL files (`supabase/README.md`), so nothing here ran
against it. The website ran against the Supabase stand-in in `supabase/tests/stand-in.js`, which
builds the same database as the SQL tests. The sketches were compiled but never flashed, so no
ESP32 has run this code yet.

Items 28 to 31 were built together. [Item 29](item-29-sensor-pipeline.md) has the readings,
[item 30](item-30-monitoring-dashboard.md) has the dashboard and
[item 31](item-31-threat-alerts.md) has the threat rules.

## What it does

This is the three tiers from the proposal: ESP32 sensor nodes, one edge device for each forest
region, and Supabase. `iot/README.md` has the wiring, setup, token handling and flashing.

- **Sensor node** (`iot/sensor-node/sensor-node.ino`). Reads the DHT11, soil probe, rain pad,
  HC-SR04, MPU 6050, PIR and battery, and has no actuators. It sends to the edge device every
  minute, and straight away if it's knocked, tilted or sees movement.
- **Edge device** (`iot/edge-device/edge-device.ino`). Does the basic checks, keeps readings in a
  buffer while the internet is down, and sends them over HTTPS with its own token.
- **Device tokens** (016). `iot_devices` lists the edge devices. Each one has its own token, and
  only a hash of it is kept. `iot_make_device_token` is how an admin makes or replaces one.
- **Devices page** (`/dashboard/sensors/devices`, admins only). Add a device, make a new token,
  turn a device off or on, add a node and link a node to a device.
- **Bryan's test sketches** (`iot/testing/`). Merged with Bryan's authorship kept. On top of that
  the folders are now kebab case, the `esp32_dh11_test` typo is `esp32-dht11-test`, and the HC-SR04
  note says the Echo divider is required. `esp32-thing-standalone` only uses the DHT and Serial and
  sends nothing. The pins and the soil and rain numbers in the real sketches come from it.

## Rules

| Rule | Why |
| --- | --- |
| Tokens belong to edge devices, not nodes | The proposal says each edge device gets its own credentials. A node only talks to its edge device, so a stolen node has the region's `NODE_SECRET` but nothing that opens the database |
| Only a hash of a token is kept, in a table nobody can read through the API, admins included. The plain token is handed back once | A copy of the table doesn't give anyone a working token |
| A wrong token, an unknown device and a device that's turned off all get the same answer | The answer doesn't tell anyone which device IDs exist |
| A token can only add readings, and only for nodes linked to its own device. A node that's on another device and a node that doesn't exist get the same refusal | A device can't touch another device's data or look for other nodes. It can't read anything back either |
| `iot_add_readings` is the only IoT function the publishable key can call, and being signed in doesn't help | There's one way in to check |
| Only admins add devices, make tokens, turn devices off and link nodes. The server action checks, then the database checks again | An officer watches the sensors but doesn't hold the credentials |
| A new token for a device that already has one takes a second press, which says the old one stops working straight away | One slip would take a working device offline until someone flashes it again |
| The token shows once in a read only box. The status line only says it was made, and no live region holds it | A screen reader doesn't read it aloud, and it's gone from the page after "I've copied it" |
| `secrets.h` is gitignored, and only `secrets.example.h` is committed | The token and the WiFi password stay out of a public repo |
| The edge device uses `setCACert()` and never `setInsecure()` | The token goes in that request, so the device has to check who it's talking to |
| 016 stops on its first line if 015 isn't there. Running it again keeps readings and tokens | The hosted project gets files one at a time |

## Automated checks

Run on Umer's Mac on 31 Oct 2026 after the last code change.

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 352 of 352 in 63 suites. 103 are new in `iot.test.js`: 94 on the SQL and through the stand-in, 9 on the simulator |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Production build | `cd web && npm run build` | Pass, with no environment variables and with a made up https address |
| Compile the sensor node | `arduino-cli compile --fqbn esp32:esp32:esp32`, on a copy with `secrets.example.h` as `secrets.h` | Pass, no warnings. 1060984 bytes of program space (80%), 50336 bytes of global memory (15%) |
| Compile the edge device | The same | Pass, no warnings. 1075695 bytes of program space (82%), 108232 bytes of global memory (33%) |
| The firmware's certificate check | Searched `iot/` for `setInsecure` and `setCACert` | `setCACert()` is called once in the edge device. `setInsecure` only appears in comments and the README that say not to use it |

The compile used arduino-cli 1.5.2-rc.1, esp32 core 3.3.12, ArduinoJson 7.4.3, DHT sensor library
1.4.7 and Adafruit Unified Sensor 1.1.15.

The tests for this item in `supabase/tests/iot.test.js`:

| Group | What it checks |
| --- | --- |
| Device tokens | Only admins make one, only the hash is kept, two are never the same, a new one stops the old one straight away, and nobody reads the hashes through the API |
| Adding readings | The same answer for a wrong token, an unknown device and a device turned off, and no readings for another device's node |
| Who reads and changes what | Only admins see and manage devices, and only admins link a node. A device or node with history can't be removed. Row Level Security is on for every IoT table |
| The order the files run in | 016 and 017 stop on their first line if the file before isn't there |
| Running 016 and 017 again | Ends up the same, and keeps the readings, the tokens and any tuned limits |
| Through the stand-in | An admin adds a device, links a node and makes a token over the API, then the publishable key adds readings with that token and reads nothing back |

## Manual tests (stand-in, signed in as the test admin)

These called the website's own server actions, then sent readings with `iot_add_readings`. The token
was never printed.

| Test | Result |
| --- | --- |
| Add a device, then add the same one again: "There's already a device called NNP-EDGE-02." | Pass |
| Add a device with a bad ID: "An ID is 3 to 40 letters, numbers or hyphens, like NNP-EDGE-01." | Pass |
| Add a node, then add the same one again: "There's already a node called NNP-IOT-21." | Pass |
| Send before the device has a token: 401 | Pass |
| Make a token and send with it: 200, 1 accepted | Pass |
| Send for another device's node: 200, refused with `node_not_on_this_device` | Pass |
| Make a new token. The old one gets 401 and the new one is accepted | Pass |
| Turn the device off and send: 401. Turn it on and send: accepted | Pass |
| Unlink the node and send: refused with `node_not_on_this_device`. Link it back and send: accepted | Pass |
| Link a node to a device that isn't there: "That device isn't in the database any more. Reload the page." | Pass |
| Make a token for or turn off a device that isn't there: "This device isn't in the database any more. Reload the page." | Pass |
| After a reload, the token isn't on the page | Pass |
| The token isn't in the website's or the stand-in's log (searched both, 0 matches) | Pass |

And in the browser, on the Devices page:

| Test | Result |
| --- | --- |
| Make a new token asks first, in red, with focus on the confirm button and "Keep the old one" beside it | Pass |
| The token panel: read only box, focused and fully selected, autocomplete off, with the label "The token for NNP-EDGE-02. Copy it now, because it isn't shown again." | Pass |
| The status line only says "New token made for NNP-EDGE-02." | Pass |
| "I've copied it" closes the panel, takes the token out of the page and puts focus on "Make a new token" | Pass |
| A bad ID shows the error line and says it in the status region. A good one adds the device, clears the form and says "NNP-EDGE-09 added. It can't send anything until you make it a token." | Pass |
| Turn off asks first, then shows an Off badge with an icon and a bar on the side of the card, so it isn't colour alone. Turn on puts it back | Pass |
| Focus after Turn off, Turn on and linking a node stays on the matching control | Pass |
| Officer: "Only administrators can manage sensor devices" and no devices shown | Pass |
| Botanist, researcher, visitor and an account with no profile: no sensor data | Pass |
| Signed out: sent to the sign in page | Pass |
| Botanist, visitor and officer calling the admin server actions directly: "Only administrators can manage sensor devices." | Pass |
| Anon reading `iot_devices` over the API: 401 | Pass |
| 375 px wide: nothing wider than the screen | Pass |

**Fixed on 31 Oct:** after Turn off or a change of node, focus fell back to the top of the page,
because the button was still disabled when the page asked to focus it. It now waits until the save
has finished.

## Not tested yet

- Anything on a real board. Neither sketch has been flashed. The MPU 6050, the PIR and the battery
  divider have never been tried on a board, and only Bryan's sketches have run on real parts.
- A real HTTPS connection from the edge device. The compile shows `setCACert()` builds, not that the
  certificate check works.
- The hosted project, which needs 003 to 017 run first.
- A screen reader on the Devices page.
- The rest of check 7 in `docs/security/vulnerability-assessment-plan.md`, which is planned for
  items 25 and 27.

## Known limits

- **The link from node to edge is plain HTTP on the region's own WiFi.** It has one shared secret
  for the region, and someone on that WiFi could read it. Only the edge device to Supabase part is
  HTTPS.
- **A new token means flashing the edge device again.** There's no way to send one over the air.
- **Nothing limits how often someone can call `iot_add_readings`.** A token is too long and random
  to guess by trying, but item 25 should look at this.
- **WiFi, not Zigbee or LoRaWAN.** The proposal prefers those for the field and allows WiFi for the
  prototype, which is what we have parts for.
- **No GPS code.** We don't have a GPS part yet. `iot_add_readings` already takes a latitude and
  longitude for when we do.
- **The stand-in's made up device says "No token yet".** Its hash is set directly so the simulator
  works with nothing to set up. This only happens on the stand-in.
