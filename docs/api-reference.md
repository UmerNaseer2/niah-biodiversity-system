# API reference and developer guide

This page is for a developer joining the team (item 35). It says what each part of the system can
ask for, who is allowed to ask, and how to run and change the code.

Every part talks through Supabase. The phone app and the website never talk to each other, and
neither talks to the sensors. They all read and write the same Supabase project:

| Part | How it reaches Supabase |
| --- | --- |
| Phone app (`mobile/`) | The Supabase JS client with the publishable key, plus the person's sign in |
| Website (`web/`) | The same, from the browser and from the Next.js server |
| Edge device (`iot/edge-device/`) | Only through the `edge-com` Edge Function, with its own device token |
| Sensor nodes (`iot/sensor-node/`) | Never. They send over MQTT to their region's edge device |

The tables and columns are in [architecture/database-design.md](architecture/database-design.md).
This page doesn't repeat them. The SQL itself is in [`supabase/`](../supabase/README.md).

## Roles

Each account gets one row in `profiles` with one of five roles. A new account always starts as a
visitor, whatever the sign up sent (`handle_new_user`). Only an administrator can change a role,
and never their own.

| Role | What it can do |
| --- | --- |
| `visitor` | The same as someone who isn't signed in: the public views and the public photo bucket |
| `researcher` | The same as a visitor for now |
| `botanist` | Field staff. Adds records from the phone as `waiting`, reads their own records and photos, and edits their own records while they're still waiting |
| `conservation_officer` | Field staff, and the staff dashboard. Reads and reviews every record, edits and deletes records, manages species and species photos, reads sensor data, sends node commands and handles alerts |
| `admin` | Everything an officer can do, plus changing other people's roles, inviting and deactivating accounts, managing edge devices and nodes, making device tokens, and reading the role change list and the exact spot download list |

The database decides all of this with Row Level Security, column grants and views. The helper
`has_any_role(required_roles text[])` checks the signed in person's role in `profiles`, and most
policies call it.

### What the dashboard checks

The website checks in two places, and the database checks again under both.

1. `web/src/proxy.ts` runs for `/dashboard/:path*`. It refreshes the session cookie and sends
   anyone who isn't signed in to `/login`. It doesn't look at the role.
2. `web/src/lib/auth.ts` has `DASHBOARD_ROLES = ["conservation_officer", "admin"]`.
   `getSession()` reads `name` and `role` from `profiles` and gives back `signed-out`,
   `unavailable`, `no-access` or `ok`. The dashboard layout and every dashboard page call
   `requireStaff()`.

So a botanist, researcher or visitor who signs in on the website gets a "No access" page. Botanists
use the phone app instead. On top of that, the Users page and the Devices page
(`/dashboard/sensors/devices`) only work for admins, and their server actions check the role again.

The session cookie is httpOnly, `sameSite: lax`, secure in production, and lasts 12 hours
(`SESSION_SECONDS` in `web/src/lib/supabase/config.ts`).

## The Supabase API

### How to reach it

| What | Address | Used for |
| --- | --- | --- |
| REST (PostgREST) | `https://<project>.supabase.co/rest/v1/<table or view>` | Reading and changing rows |
| RPC | `https://<project>.supabase.co/rest/v1/rpc/<function name>` | Calling a database function with `POST` |
| Auth | `https://<project>.supabase.co/auth/v1/...` | Signing in and out, refreshing the session, invites and passwords |
| Storage | `https://<project>.supabase.co/storage/v1/...` | Photos |
| Edge Functions | `https://<project>.supabase.co/functions/v1/edge-com` | Edge devices only (see [`edge-com`](#edge-com)) |

Every request sends the publishable key as `apikey`. A signed in request also sends
`Authorization: Bearer <access token>`, and that token is what Row Level Security looks at. With
only the publishable key, a request runs as `anon` and can read the public views and nothing else.

The environment variables are:

| Part | Variables |
| --- | --- |
| Website | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and on the server `SITE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) |
| Phone | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SITE_URL` |

The service role key is only on the website's server, in `web/src/lib/supabase/admin.ts`, and it is
only used for Supabase Auth: `inviteUserByEmail`, `updateUserById` with a `ban_duration` to
deactivate (`876000h`) or reactivate (`none`) someone, and `listUsers`. No table is read or changed
with it.

"Field staff" below means botanists, officers and admins. "Staff" means officers and admins.

### Records

| Relation | What it holds | Who reads it | Who changes it | Used by |
| --- | --- | --- | --- | --- |
| `records` (table) | One row per tagged plant from the field | Field staff read their own, staff read all | Field staff add their own as `waiting`. Botanists edit their own while waiting. Staff review, edit and delete any record | Phone uploads and reads back status. Dashboard records and review pages |
| `records_public` (view) | Published records only. The exact spot only for a species that is LC or NT, not protected in Sarawak and not set to rough area only. Other records get the middle of a grid square and the day, not the time (019) | Anyone | Nobody | Public pages, `/tag/<code>`, the phone's visitor download |
| `records_staff` (view) | Every record with its exact point | Staff | Nobody | Most dashboard pages, `report_counts` |
| `deleted_records` (table) | The ID of every deleted record, with who and when | Staff | Only its trigger | No app reads it. The phone reacts to the `deleted_records_pkey` error it causes |
| `record_history` (table) | Every change to a record, with the old and new value of each column | Staff | Only its trigger | The record edit page |

What a phone can send when it adds a record is limited by a column grant: `id, species_name,
species_slug, common_name, height_m, condition, notes, gps, photo_count, recorded_at`. Triggers fill
in the tag code, who sent it and who reviewed it, so nobody can send someone else's name. The phone
inserts without asking for the row back, then reads `id, status, review_notes` for its own records
to show the review status (`mobile/src/sync/supabase-api.ts`).
[sync-design.md](sync-design.md) has the full upload story.

### Species

| Relation | What it holds | Who reads it | Who changes it | Used by |
| --- | --- | --- | --- | --- |
| `species` (table) | The plant knowledge base | Staff | Staff | Dashboard species pages |
| `species_public` (view) | Species for the public pages, without photos | Anyone | Nobody | Public plant pages, `/health`, the phone's species list |
| `species_photos_public` (view) | Each species' `id`, `slug` and `photos` | Anyone | Nobody | Public plant pages, the phone's visitor download |
| `species_staff` (view) | Every species column | Staff | Nobody | Dashboard species forms |
| `species_history` (table) | Every change to a species | Staff | Only its trigger | The species edit page |

A species' id is its URL slug, like `eusideroxylon-zwageri`. `species.photos` is a list, and a
check (`species_photos_ok`) only lets in an outside link or a file in that species' own folder of
`botanical-photos`.

### Photos (Storage)

| Bucket | Public | Limits | Who reads | Who uploads | Who deletes |
| --- | --- | --- | --- | --- | --- |
| `record-photos` | No | 10 MB, JPEG, PNG, WebP or HEIC | A botanist reads their own folder, staff read all | Field staff, only into a folder named with their own user ID | Staff |
| `botanical-photos` | Yes | 10 MB, same types | Anyone | Staff | Staff |

- The phone uploads a record photo to `<user id>/<record id>/<position>.jpg`, with
  `upsert: false` and `contentType: image/jpeg`.
- The website lists a record's folder (the record's `photo_folder`, or `submitted_by` if that's
  empty, then `/<record id>`) and makes signed links that last an hour.
- The website uploads species photos to `species/<slug>/<random id>.jpg`, plus a small copy for
  thumbnails. Anyone can open them at
  `https://<project>.supabase.co/storage/v1/object/public/botanical-photos/<path>`.

### Reports

| Relation | What it holds | Who reads it | Who changes it | Used by |
| --- | --- | --- | --- | --- |
| `exact_location_downloads` (table) | One row for every reports CSV downloaded with the exact spots of threatened and protected plants | Admins | Staff add a row (`scope, from_day, to_day, row_count, exact_count`). A trigger fills in who and when | The reports CSV route and the Reports page |
| `report_counts(scope, from_day, to_day)` (function) | The counts on the Reports page, as JSON | Runs as the caller, so staff get real counts and anyone else gets zeros | Nobody | The Reports page |

`report_counts` takes `scope` (`'all'` adds waiting records, anything else counts published ones
only) and two days in park time, either of which can be null.

### IoT

| Relation | What it holds | Who reads it | Who changes it | Used by |
| --- | --- | --- | --- | --- |
| `iot_devices` (table) | Each edge device and whether it's turned on | Staff | Admins (only `device_id, name, zone, latitude, longitude` when adding, and `enabled, name, zone, latitude, longitude` when editing) | Devices page, `edge-com` |
| `iot_device_tokens` (table) | A SHA-256 hash of each device's token, never the token | Nobody through the API | Only `iot_make_device_token` | `edge-com` |
| `iot_nodes` (table) | Each sensor node, the device it sends through, its calibration and alert settings | Staff | Admins | Sensors and Devices pages, `edge-com` |
| `iot_readings` (table) | Every reading, as raw values | Staff | Only `edge-com` | Sensors pages |
| `iot_boots` (table) | One row each time a node powers up, with its position and its first and last reading | Staff | Only `edge-com` | Sensors pages |
| `iot_alerts` (table) | One row for each problem on a node | Staff | `edge-com` raises them. Staff acknowledge, resolve and send a patrol through the functions below | Sensors pages, the alert count in the dashboard menu |
| `iot_alert_state` (table) | `edge-com`'s working state for each node and condition | Nobody through the API | Only `edge-com` | `edge-com` |
| `iot_commands` (table) | Commands for nodes (locate beep on or off, reset the distance baseline) | Staff | Staff add one with `node_id` and `command`. After that only `edge-com` moves it along | Sensors pages, `edge-com` |
| `iot_node_status` (view) | Each node's latest reading, its soil and rain percent, open alerts and position | Staff | Nobody | Sensors pages, ecology CSV |
| `iot_daily_summary` (view) | Each node's figures for today and the 6 days before | Staff | Nobody | Sensors page node cards |

No public view reads any IoT table, because nodes sit beside protected plants.

### Users and roles

| Relation | What it holds | Who reads it | Who changes it | Used by |
| --- | --- | --- | --- | --- |
| `profiles` (table) | One row per account, with name and role | Everyone reads their own, admins read all | Admins change other people's `role` (that column only) | Website (`lib/auth.ts`, Users page), phone (`state/account-context.tsx`) |
| `role_changes` (table) | One line for every role change, with who made it and when | Admins | Only its trigger | Users page |

Two rules sit on `profiles` (021). Only an admin can take the admin role away from someone, and the
last admin can't be removed or demoted.

On the Auth side, the website signs in with `signInWithPassword`, signs out with `signOut`, and
checks the user with `getUser`. An admin invites someone from the Users page, and that person sets a
password on `/welcome` (`setSession`, then `updateUser({ password })`). Password reset emails use
`resetPasswordForEmail` with the normal client. The login form also limits failed tries
(`web/src/lib/rate-limit.ts`). The phone uses `getSession`, `signInWithPassword`,
`signOut({ scope: 'local' })` and `onAuthStateChange`.

### Functions you can call

All of these are only open to signed in users (`authenticated`). Call them with
`POST /rest/v1/rpc/<name>` and a JSON body of named arguments.

| Function | Who | What it does |
| --- | --- | --- |
| `iot_check_alerts()` | Staff | Raises any QUIET alerts that are due, then returns `{ "urgent": n, "open": n }` for open alerts that haven't cleared and didn't come from a backlog |
| `iot_acknowledge_alert(alert bigint)` | Staff | Marks an alert acknowledged. Returns `{ id, status }`. Doing it twice changes nothing |
| `iot_resolve_alert(alert bigint)` | Staff | Marks an alert resolved and updates the node's status. Returns `{ id, status }` |
| `iot_dispatch_patrol(alert bigint, notes text default null)` | Staff | Records that a patrol was sent, and acknowledges the alert. Notes are cut to 500 characters. Returns `{ ok, message }`, with `ok` false if the alert is gone, resolved or already has a patrol |
| `iot_make_device_token(device text)` | Admins | Makes a new token for an edge device and returns `{ device_id, token, token_made_at }`. The token is only shown this once, and the old one stops working |
| `report_counts(scope, from_day, to_day)` | Anyone signed in, but only staff get real numbers | See [Reports](#reports) |

When the caller isn't allowed, the IoT functions raise error `42501`, except `iot_dispatch_patrol`,
which returns `ok: false`. Acknowledging or resolving an alert that doesn't exist raises "There's no
alert" with its number.

Some functions are only helpers for policies and checks: `has_any_role`, `species_photos_ok` and
`iot_raw_pct` (turns a raw soil or rain value into a percent with the node's calibration).
`iot_raise_quiet_alerts()` and `iot_refresh_node_status(nodes text[])` are called by `edge-com`, not
by the apps.

### Triggers

None of these are called directly. They run when a row changes.

| Table | Trigger function | What it does |
| --- | --- | --- |
| `auth.users` | `handle_new_user` | Makes a `profiles` row with the role `visitor` for every new account |
| `records` | `fill_in_new_record` (005) | Sets the tag code and who sent and recorded it, and empties a species slug that doesn't exist |
| `records` | `check_deleted_record` (010) | Turns down a record whose ID was deleted, with the `deleted_records_pkey` error |
| `records` | `keep_photo_folder` (014) | Keeps the photo folder as the person who uploaded the record |
| `records` | `fill_in_review` (006) | Only lets staff change `status` or `review_notes` (else `42501`), and sets who reviewed it and when |
| `records` | `set_record_updated_at` (008) | Sets `updated_at` on every edit |
| `records` | `remember_record_change` (013) | Adds a line to `record_history` |
| `records` | `remember_deleted_record` (010) | Adds the ID to `deleted_records` |
| `species` | `sync_species_slug` | Keeps `slug` the same as `id` |
| `species` | `keep_species_rough` (015) | A threatened or protected species is always rough area only |
| `species` | `set_species_updated_at` (007) | Sets `updated_at` on every edit |
| `species` | `remember_species_change` (013) | Adds a line to `species_history` |
| `profiles` | `keep_one_admin` (021) | Only an admin can demote an admin, and there must always be one admin left |
| `profiles` | `remember_role_change` (021) | Adds a line to `role_changes` |
| `exact_location_downloads` | `fill_exact_location_download` (011) | Fills in who downloaded the file and when |
| `iot_commands` | `iot_fill_in_command_sender` (025) | Fills in who sent the command and when |
| `iot_nodes` | `iot_nodes_bump_cal_version` | Bumps `cal_version` when a node's calibration or alert settings change, so its edge gets them with the next upload |
| `iot_readings` | `iot_limit_readings` (022) | Turns down a batch that takes a device over 3,600 readings in an hour, with error `PT429` |

### Example requests

Look up a published record by its tag code. This needs no sign in:

```bash
curl "https://<project>.supabase.co/rest/v1/records_public?tag_code=eq.NNP-3F2A9C" \
  -H "apikey: <publishable key>"
```

The reply is a JSON list with one record, or an empty list if there's no published record with that
code.

Sign in as a staff account to get an access token:

```bash
curl -X POST "https://<project>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <publishable key>" \
  -H "Content-Type: application/json" \
  -d '{"email": "<email>", "password": "<password>"}'
```

Then call a function with that token:

```bash
curl -X POST "https://<project>.supabase.co/rest/v1/rpc/iot_check_alerts" \
  -H "apikey: <publishable key>" \
  -H "Authorization: Bearer <access token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

For an officer or admin this returns something like `{"urgent": 1, "open": 3}`. For anyone else it
fails with `42501`.

## `edge-com`

`edge-com` is the only way an edge device reaches Supabase. The code is in
`supabase/functions/edge-com/index.ts`. It checks the device's token, stores the readings, decides
the alerts, keeps each node's status up to date and hands back commands and calibration for that
device's nodes. It connects to the database directly with `SUPABASE_DB_URL`, so Row Level Security
doesn't apply to it.

### Signing in

An edge device has no Supabase account. It sends its own token in the `x-edge-key` header (16 to 200
characters), and `edge-com` checks the SHA-256 of it against `iot_device_tokens`. An admin makes the
token on the Devices page (`iot_make_device_token`).

Because of that, `edge-com` is deployed with **JWT verification turned off**. That's on purpose:
with it on, Supabase would turn down every upload with a 401 before `edge-com` could check the
device token. [hosted-setup.md](hosted-setup.md) and
[the edge setup guide](../iot/Field_Node_Edge-to-Cloud_Setup_Guide.md) say how.

### Request

```text
POST https://<project>.supabase.co/functions/v1/edge-com
x-edge-key: <device token>
Content-Type: application/json
Content-Encoding: gzip        (optional)
```

The body can be gzip compressed or plain JSON. `edge-com` looks at the first two bytes to tell.

```json
{
  "edge_id": "NNP-EDGE-01",
  "nodes": [
    {
      "node_id": "NNP-IOT-01",
      "boot_id": 2840193877,
      "rows": [[1, 1763400000, 4, 27.5, 88, 1900, 4095, 120.4, 120.0, 0, -61, 0]]
    }
  ],
  "boots": [{ "node_id": "NNP-IOT-01", "boot_id": 2840193877, "lat": 3.8141, "lon": 113.7787, "at": "<ISO time>" }],
  "command_updates": [{ "id": "<command uuid>", "status": "done", "at_edge_at": "<ISO time>", "sent_at": "<ISO time>", "done_at": "<ISO time>", "result": "<text>" }],
  "cal_since": 7
}
```

| Field | Meaning |
| --- | --- |
| `edge_id` | The device's `iot_devices.device_id`. 3 to 40 letters, digits or `-` |
| `node_id` | 1 to 32 letters, digits, `-` or `_`. The node must be linked to this device |
| `boot_id` | A whole number from 0 to 4294967295, new each time the node powers up |
| `rows` | Each reading is a list of 12 values in this order: `seq, ts, lag, temp_c, hum_pct, soil_raw, rain_raw, dist_cm, baseline_cm, beep_on, rssi, motion` |
| `ts` | When it was measured, in Unix seconds UTC, from 2020 on |
| `lag` | Seconds from measuring to reaching the edge. `null` means `ts` is the edge's own clock |
| `boots` | Where a node is, sent once per power-up |
| `command_updates` | How far each command has got: its `id` (a uuid), a `status` of `at_edge`, `sent`, `done`, `failed` or `expired`, the times, and an optional `result` text |
| `cal_since` | The newest calibration version the edge already has |

The ranges are the same as the checks on `iot_readings`:

| Value | Range |
| --- | --- |
| `temp_c` | 0 to 50 |
| `hum_pct` | 0 to 100 |
| `soil_raw`, `rain_raw` | 0 to 4095 |
| `dist_cm`, `baseline_cm` | 0 to 1000 |
| `rssi` | -127 to 0 |
| `beep_on`, `motion` | 0 or 1 |

What happens to things that don't fit:

- A value outside its range is stored empty, and the rest of the reading is kept.
- A reading measured more than 5 minutes in the future (a wrong clock) is skipped.
- A reading or boot from a node that isn't linked to this device is skipped.
- A reading that is already stored, with the same `(node_id, boot_id, seq)`, is ignored.

Anything skipped goes in the function's logs, not in the reply.

One request can hold at most 1000 readings, 200 command updates and 100 boots, and at most 4 MB
once it's unzipped. The whole batch is stored in one transaction, so either all of it is kept or
none of it is.

### Responses

| Status | When | Body |
| --- | --- | --- |
| 204 | The batch is stored and there's nothing to send back | None |
| 200 | The batch is stored and there are commands or calibration for this device | `{ "commands": [...], "calibration": [...] }` |
| 400 | The body isn't JSON, or isn't gzip compressed JSON | `{ "error": "body is not valid (gzip-compressed) JSON" }` |
| 401 | `edge_id` or `x-edge-key` is missing or the wrong shape | `{ "error": "missing or malformed edge_id / x-edge-key" }` |
| 401 | Unknown device, wrong token or a device that's turned off. All three get the same answer | `{ "error": "this device can't send readings" }` |
| 405 | Not a `POST` | `{ "error": "use POST" }` |
| 413 | Over 4 MB, or too many readings, updates or boots | `{ "error": ... }` |
| 429 | The device has sent more than 3,600 readings in the last hour. Nothing from the batch is kept | `{ "error": ... }` |
| 500 | Something went wrong on the server | `{ "error": ... }` |

Any 2xx means the whole batch is handled, and the edge marks it as sent. The reply is gzip
compressed when it's 400 bytes or more and the request's `Accept-Encoding` includes `gzip`.

In a 200 reply each key is only there when it has something in it:

- `commands`: up to 50, each `{ id, node_id, command, created_at, expires_at }`.
- `calibration`: one row per node whose calibration changed since `cal_since`, with
  `node_id, soil_dry_raw, soil_wet_raw, soil_flood_pct, soil_dry_pct, rain_dry_raw, rain_wet_raw,
  rain_light_pct, rain_heavy_pct, move_cm, alert_types, alert_confirm_readings,
  motion_confirm_readings, v`.

### Commands and alerts

A command goes `pending`, then `at_edge`, then `sent`, then `done` or `failed`. A command still
pending after an hour becomes `expired`. The status never goes backwards, and only `edge-com`
changes it once it's been added.

Alerts are decided in `edge-com` from the new readings and each node's settings, with the rules
from 017 and the state in `iot_alert_state` (024). The kinds are `SATURATED`, `DRY`, `HEAVY`,
`RAIN`, `TOO_HOT`, `MOVED`, `NO_ECHO`, `MOTION` and `QUIET`. An alert that started more than an
hour before it was opened came from the edge's backlog after an outage, so it's marked
`from_backlog` and doesn't count in the dashboard menu.

### The edge side

`iot/edge-device/cloud-com.py` sends a batch every 60 seconds with `x-edge-key`, gzip and the User
Agent `iot-edge`. If an upload fails it tries again later, waiting longer each time (60, 120, 240,
then 300 seconds). Its settings are in the edge's `secrets.toml` (`supabase_function_url`,
`edge_id`, `edge_key` and others), copied from `secrets.example.toml`.

## Sensor node to edge (MQTT)

### Broker and logins

Each edge device runs Mosquitto on port **1883**, with anonymous logins turned off
(`iot/edge-device/mosquitto/field-node.conf`). `install-edge.sh` makes two logins:

| Username | Used by | Password comes from |
| --- | --- | --- |
| `thing` | The sensor nodes | `NODE_SECRET` in the node's `secrets.h`, the same as `node_secret` in the edge's `secrets.toml` |
| `edge` | `thing-com.py` and `tools/fake-thing.py` on the edge | `mqtt_password` in the edge's `secrets.toml` |

The passwords themselves never go in the repo.

### Topics

Every topic is `field/<node_id>/<name>`.

| Topic | Direction | What's in it |
| --- | --- | --- |
| `field/<node_id>/telemetry` | Node to edge | A 21 byte binary frame (below), QoS 0 |
| `field/<node_id>/status` | Node to edge | `{"online": true, "boot_id": N}`, retained. The node's last will sends `online: false` |
| `field/<node_id>/info` | Node to edge | `{"boot_id": N, "lat": ..., "lon": ...}`, retained, once per power-up |
| `field/<node_id>/ack` | Node to edge | `{"id", "cmd", "ok", "detail", "beep_on", "baseline_cm"}` answering a command |
| `field/<node_id>/cmd` | Edge to node | `{"id": "<command uuid>", "cmd": "beep_on"}`, `"beep_off"` or `"reset_baseline"`. The edge sends it again every 20 seconds until the node answers |

`thing-com.py` subscribes with QoS 1. It ignores a node's telemetry until it has seen a `status`
message with a `boot_id` from that node. `iot-edge watch` prints every message with the frames
decoded, which is the easiest way to see what a node is sending.

### Telemetry frame

21 bytes, little endian, Python struct format `<IIhBHHHHbB`.

| Byte | Field | Type | Notes |
| --- | --- | --- | --- |
| 0 | `seq` | uint32 | Counts up from each power-up |
| 4 | `ts` | uint32 | Unix seconds, 0 if the node's clock isn't set |
| 8 | `temp` | int16 | Tenths of a degree C, -32768 if the sensor failed |
| 10 | `hum` | uint8 | Percent, 255 if the sensor failed |
| 11 | `soil_raw` | uint16 | 0 to 4095 |
| 13 | `rain_raw` | uint16 | 0 to 4095 |
| 15 | `dist` | uint16 | Millimetres, 65535 for no echo |
| 17 | `baseline` | uint16 | Millimetres, 65535 if not set yet |
| 19 | `rssi` | int8 | WiFi signal, 0 for no WiFi |
| 20 | `flags` | uint8 | Bit 0 is the locate beep, bit 1 is motion |

The edge keeps these in SQLite and `cloud-com.py` turns them into the `rows` that `edge-com` takes.
[The edge setup guide](../iot/Field_Node_Edge-to-Cloud_Setup_Guide.md) has the wiring and the rest
of the setup.

## Website routes

The website has two routes that other things call on purpose.

**`GET /health`** (`web/src/app/health/route.ts`) reads one row from `species_public`, with a 5
second time limit.

| Status | Body |
| --- | --- |
| 200 | `{"status": "ok", "checkedAt": "<ISO time>"}` |
| 503 | `{"status": "down", "checkedAt": "<ISO time>"}` |

It sends `Cache-Control: no-store`. The reason it's down only goes to the server log.
[deployment.md](deployment.md) says how we use it.

**`/tag/<code>`** is the public page a tree tag's QR code opens. `/tag` on its own is a lookup form.

- It takes `NNP-3F2A9C`, `nnp-3f2a9c`, `NNP 3F2A9C` or just `3f2a9c`, and redirects other spellings
  to the tidy `NNP-XXXXXX` form.
- It only finds published records, through `records_public`. Anything else is a 404.
- The QR code holds `${SITE_URL}/tag/${code}` when `SITE_URL` is set, otherwise only the code.

The other public pages are `/`, `/plants`, `/plants/<slug>`, `/login`, `/welcome` (setting a
password from an invite) and `/screens` (a list of every screen on the site).

The staff pages are under `/dashboard`: records, review, species, reports, sensors,
sensors/devices, ecology and users. Two of them return files:

| Route | What it gives | Notes |
| --- | --- | --- |
| `GET /dashboard/reports/csv?scope=all&from=YYYY-MM-DD&to=YYYY-MM-DD&exact=1` | The reports CSV, with the same filters as the Reports page | `exact=1` adds the exact spots of threatened and protected plants. That file only downloads from the Reports page itself, and a row goes in `exact_location_downloads` first. 403 for an account that isn't staff, 503 when the database isn't answering |
| `GET /dashboard/ecology/csv` | Each node's status and the open alerts as a CSV | Staff only, same answers as above |

Everything a staff member changes (reviewing a record, editing a species, sending a command, changing
a role) is a Next.js server action, not an API. Those live in the `actions.ts` files next to each
page, and each one checks the session again before it calls Supabase. Don't build anything that
calls them from outside the website.

## Developer guide

### Repo layout

| Folder | What it is |
| --- | --- |
| `mobile/` | The phone app (Expo, React Native, SQLite). [mobile/README.md](../mobile/README.md) |
| `web/` | The website (Next.js on Vercel): public plant pages and the staff dashboard. [web/README.md](../web/README.md) |
| `supabase/` | The SQL files (001 to 027, no 018), the `edge-com` function and the database tests. [supabase/README.md](../supabase/README.md) |
| `iot/` | The ESP32 sketch (`sensor-node/`), the edge software (`edge-device/`) and test sketches. [iot/README.md](../iot/README.md) |
| `docs/` | Design notes, sprint backlogs, the test plan and test results |

### Running each part

You need Node 22 or 24. Copy the `.env.example` file in each part and fill it in. Never commit the
real one.

| Part | Commands | Then |
| --- | --- | --- |
| Website | `cd web`, `npm install`, `cp .env.example .env.local`, `npm run dev` | Open <http://localhost:3000> |
| Phone app | `cd mobile`, `npm install`, `cp .env.example .env`, `npx expo start` | Scan the QR code with Expo Go |
| Stand-in Supabase | `cd supabase/tests`, `npm install`, `npm run stand-in` | It listens on `http://127.0.0.1:54321` |
| Edge device | `install-edge.sh` on the edge VM | [The edge setup guide](../iot/Field_Node_Edge-to-Cloud_Setup_Guide.md) |

The stand-in runs every SQL file in PGlite on your laptop and answers the parts of the Auth, REST
and Storage API the website uses, and runs `edge-com` too. It has a made up account for each role
and made up records and sensor readings, all kept in memory. To point the website at it, set
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=stand-in-anon-key`
and `SUPABASE_SERVICE_ROLE_KEY=stand-in-service-key`.
[Trying sign in without a Supabase project](../web/README.md#trying-sign-in-without-a-supabase-project)
has the account names and the rest. Never put real data in it.

### Tests and CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request, every push to `main`, and
by hand. It uses Node 22 and has three jobs:

| Job | Folder | Steps |
| --- | --- | --- |
| Mobile app | `mobile/` | `npm ci`, `npm audit` (only a warning), lint, typecheck, unit tests, Expo Doctor |
| Web platform | `web/` | `npm ci`, `npm audit` (only a warning), lint, unit tests, build |
| Database | `supabase/tests/` | `npm ci`, then `npm test`, which runs every SQL file in PGlite and the tests against them |

Run the same thing locally before you push: `npm run lint` and `npm test` in `mobile/` and `web/`,
and `npm test` in `supabase/tests/`. [supabase/README.md](../supabase/README.md#tests) and
[mobile/README.md](../mobile/README.md#tests) have more on the tests, and
[test-plan.md](test-plan.md) has the whole plan.

### Adding a SQL file

1. Give it the next number. From 006 on, every file starts by checking the one before it was run,
   and stops with a clear message if not.
2. Make it safe on its own and safe to run again. The SQL editor runs a whole file as one
   transaction, so if anything fails nothing is kept.
3. Revoke first, then grant only what's needed. Only use what Postgres 15 has.
4. Never edit a file that has already been run. Write a new one instead.
5. Add tests in `supabase/tests/*.test.js`, and add the file to `SQL_FILES` in
   `supabase/tests/harness.js` so the tests and the stand-in run it.
6. Add a `{ file, table, column }` entry for it to `FILES` in `supabase/tests/check-hosted.js`.
7. Add it to the table in [supabase/README.md](../supabase/README.md#running-the-sql-files). If it
   uses a part of Supabase the tests don't have yet, add that to `supabase/tests/supabase-stub.sql`.
8. If it changes a table or view, update [architecture/database-design.md](architecture/database-design.md)
   and this page.

[Rules from our design](../supabase/README.md#rules-from-our-design) lists the rules every file has
to keep.

### Branches and pull requests

The full rules are in [CONTRIBUTING.md](../CONTRIBUTING.md). In short:

- Never commit straight to `main`.
- Make one branch per backlog item, named after it, like `item-6-qr-scanner`.
- Commit small and often, with a message that says what you did.
- Open a pull request into `main` with the item number in the title, like `Item 6: QR code scanner`.
- One other teammate reviews and approves it, and CI has to be green before it's merged.
- Follow the Definition of Done in CONTRIBUTING.md.
- Never commit `.env` files, keys, tokens or passwords.
