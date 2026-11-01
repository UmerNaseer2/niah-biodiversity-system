# IoT plant protection

Owners: Rukman, Bryan

Sensor nodes (ESP32 + sensors) send readings to an edge device in each forest region, which forwards them to Supabase. Supabase stores them and checks them for threats, and officers see the result on the dashboard.
See `docs/architecture/IoT Plant Protection - High-level design.png`.

File and folder names here use kebab case, like the rest of the repo (only `supabase/` is different).

| Folder | What it is |
| --- | --- |
| `sensor-node/` | Tier 1. Reads the sensors and sends to the edge device. No actuators. |
| `edge-device/` | Tier 2, one for each forest region. Basic checks, a buffer for when the internet is down, and HTTPS to Supabase. |
| `node-simulator/` | A script that pretends to be an edge device, so all of this can be tried with no hardware. |
| `testing/` | Bryan's sketches for trying one part at a time, and `testing/notes.md` on each part. |

**How far this has been tested:** both sketches compile for ESP32 Dev Module (arduino-cli 1.5.2-rc.1, esp32 core 3.3.12, DHT sensor library 1.4.7, ArduinoJson 7.4.3). They have not been flashed or run on a board yet. Everything from `iot_add_readings` onward has been tested with the simulator. The MPU 6050, PIR, battery divider and the whole node to edge to Supabase path still need trying on real parts. Fix what comes up, and write what you find in `testing/notes.md`.

## How a reading travels

```
sensor node  --- WiFi, plain HTTP, NODE_SECRET --->  edge device  --- HTTPS, device token --->  Supabase
                                                     (one per region)
```

- The node sends every minute, and straight away if it's knocked, tilted or sees movement.
- The edge device turns away anything without the right `NODE_SECRET` or from a node that isn't on its list, and takes out values no sensor could read. It sends what's waiting every 10 seconds.
- Supabase checks the token, the ranges and that the node is on that device. The threat rules run there, so they work with the website closed. `supabase/017_iot_alerts.sql` has them.
- A reading has its own ID, so sending it twice after a dropped connection doesn't store it twice.

## Wiring the sensor node

The first part is the same as `testing/esp32-thing-standalone`. The expansion board header is G = GND, V = supply, S = signal.

| Part | Pin | Board header | Notes |
| --- | --- | --- | --- |
| DHT11 | + | D21 (V) | voltage jumper on 3.3 V |
| | OUT | D21 (S) | |
| | - | D21 (G) | |
| Soil probe | AO | VP/36 (S) | |
| | VCC | D17 (S) | switched: powered only while sampling |
| | GND | VP/36 (G) | |
| Rain pad | AO | VN/39 (S) | |
| | VCC | D19 (S) | switched: powered only while sampling |
| | GND | VN/39 (G) | |
| HC-SR04 | VCC | 5V pin | |
| | Trig | D5 (S) | |
| | Echo | D16 (S) | through a 1k/2k divider, which is required. The Echo pin puts out 5 V and the ESP32 is rated for 3.3 V. |
| | GND | D16 (G) | |
| MPU 6050 | VCC | 3.3 V | not tried on the board yet |
| | GND | GND | |
| | SDA | D25 (S) | not the usual D21, because the DHT11 is on that |
| | SCL | D26 (S) | |
| PIR | VCC | 5V pin | not tried on the board yet. Check that your module's output is 3.3 V. |
| | OUT | D27 (S) | |
| | GND | D27 (G) | |
| Battery | + | D34 (S) through a 100k/100k divider | not tried on the board yet. Never connect a battery straight to a pin. |

If a node doesn't have the MPU 6050, the PIR or the battery divider, set `HAS_MPU6050`, `HAS_PIR` or `HAS_BATTERY` to 0 at the top of `sensor-node.ino`. That reading is then left out. A soil probe or rain pad that's come loose can read as dry rather than fail, so check them if every node on a region reads 0.

There's no GPS code because we don't have a GPS part yet. `iot_add_readings` already takes `latitude` and `longitude` for when we do. Those stay with officers and admins, and never reach a public page.

The edge device is an ESP32 with nothing wired to it. It only needs power and the region's router.

Zigbee and LoRaWAN are what the proposal prefers for the field. This prototype uses WiFi because that's what we have, and the proposal allows that.

## Setup

1. Install the [Arduino IDE](https://www.arduino.cc/en/software) and the ESP32 core (Boards Manager, `esp32` by Espressif Systems, 3.3.12). Pick the board `ESP32 Dev Module`.
2. Install these libraries in Library Manager: `DHT sensor library`, `Adafruit Unified Sensor` and `ArduinoJson`.
3. In the database, run `supabase/016_iot_readings.sql` and `017_iot_alerts.sql` after the files before them. `supabase/README.md` says how.

### Make a device token

An admin does this on the dashboard, under **Sensors**, then **Devices**:

1. Add the edge device for the region, with an ID like `NNP-EDGE-01`.
2. Add its nodes, or link the ones that are already there.
3. Press **Make a token**. Copy it straight away. It's shown once, and only a hash of it is stored, so nobody can look it up later.

Handling the token:

- It only goes in `edge-device/secrets.h`. Never in a commit, a chat, a screenshot or a doc.
- Each edge device has its own. A token can only add readings for that device's own nodes. It can't read anything.
- If it's lost or gets out, press **Make a new token**. The old one stops working straight away, then you put the new one in `secrets.h` and flash again.
- To stop a device straight away, turn it off on the same page. Its readings are turned down until it's turned back on.

### Fill in `secrets.h`

Each sketch has a `secrets.example.h`. Copy it to `secrets.h` in the same folder and fill it in. `secrets.h` is gitignored, so please don't force it.

For the edge device you also need the root certificate, so the device can check it's really talking to your project. Run this, using your project's address:

```
openssl s_client -showcerts -connect your-project.supabase.co:443 </dev/null
```

Paste the last certificate it prints into `SUPABASE_ROOT_CA`. It has to be the top of the chain, not the first one printed, which changes often. The sketch uses `setCACert()`. Never swap that for `setInsecure()`, because the token goes in that request and anyone in the middle could read it. If the certificate changes one day, sends fail until you update it and flash again. That's a pain, but it's the safe way to fail.

`NODE_SECRET` is one made up string for the region. Put the same one in the edge device and its nodes.

### Flash and check

1. Flash the edge device first and open the Serial Monitor at 115200. It prints the address the nodes should send to. Give it a fixed address on the router, and put that in `EDGE_URL` in the node's `secrets.h`.
2. Flash each node with its own `NODE_ID`, which also has to be in `ALLOWED_NODES` on the edge device.
3. Watch the Serial Monitor. The edge device prints the database's answer for each batch, like `{"accepted":3,"duplicates":0,"refused":[]}`.
4. Check the node shows up on the Sensors page within about a minute.

| What the edge device prints | What it means |
| --- | --- |
| `The database turned this device down` | Wrong `DEVICE_ID` or `DEVICE_TOKEN`, or an admin turned it off. It tries again every 5 minutes. |
| `Couldn't send` | No internet, a wrong certificate, or Supabase is down. It keeps the readings and tries again, waiting longer each time. |
| `Buffer is full` | It's been offline a long time. The oldest reading goes first. |
| `refused` with `node_not_on_this_device` in the answer | Link that node to this device on the Devices page. |

## Known limits

- The buffer on the edge device is in RAM and holds 180 readings, which is 3 nodes for an hour. A power cut loses what hasn't been sent.
- The node doesn't keep a reading it can't deliver. It tries 3 times, then it's lost.
- The link from node to edge is plain HTTP on the region's own WiFi, with one shared secret for the region. Someone on that WiFi could read it. The HTTPS part, with the device token, is only from the edge device to Supabase.
- The edge device does one thing at a time, so a node that sends during a slow HTTPS call has to try again.
- The numbers in the sketches and in `iot_alert_limits` are starting values. Nobody has tried them in the field. Soil and rain need calibrating for each probe. Admins can change the alert limits in the `iot_alert_limits` table.

## Run the simulator

You don't need any hardware for this. It sends made up readings through `iot_add_readings`, the same call the edge device makes.

```
cd supabase/tests && npm install && npm run stand-in     # in one terminal
node iot/node-simulator/node-simulator.mjs               # in another, from the repo root
```

The stand-in comes with a made up device, `NNP-EDGE-01`, with the nodes `NNP-IOT-01` to `03` on it. Those are the simulator's defaults, so there's nothing to set up. If the stand-in is on another port, set `IOT_SUPABASE_URL=http://127.0.0.1:54331`.

| Option | What it does |
| --- | --- |
| `--scenario <name>` | What happens on the first node. The others stay calm. |
| `--count <n>` | How many rounds to send. |
| `--interval <secs>` | Seconds between rounds. Without `--count` it keeps going until you stop it. |
| `--allow-remote` | Let it send somewhere that isn't this computer. It always refuses plain `http` there. |

| Scenario | What it does | What should happen |
| --- | --- | --- |
| `normal` | All calm | No alerts |
| `disturbance` | Knocked over: big tilt, shock and distance change | An urgent alert |
| `motion` | Something moves near it | A routine alert |
| `dry`, `wet` | Soil out of range | A routine alert |
| `hot`, `cold` | Temperature out of range | A routine alert |
| `low-battery` | Battery low | A routine alert |
| `quiet` | Sends one reading dated 20 minutes ago, then stops. Run it first on a fresh stand-in, because a newer reading from that node wins. | An urgent alert at the next check, or a routine one if its battery was low |
| `resend` | Each round is sent twice | The second one counts as already there |
| `bad-value` | A value no sensor could read | That reading is turned down, the others go in |

To keep the page moving during a demo, leave this running:

```
node iot/node-simulator/node-simulator.mjs --interval 10
```

To point it at a real project you'd set `IOT_SUPABASE_URL`, `IOT_ANON_KEY`, `IOT_DEVICE_ID`, `IOT_DEVICE_TOKEN` and `IOT_NODE_IDS` and add `--allow-remote`. Only do that with a test project, because these readings are made up and they'd show up as real ones, and could raise real alerts.

`npm test` in `supabase/tests` runs the simulator as well, so it stays in step with the SQL.
