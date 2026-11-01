# Database design (item 1)

This is how the data for the Smart Ground-Truthing and Digital Biodiversity System is laid out in
Supabase. It goes with the three high-level design diagrams in this folder:

- [Digital Plant Knowledge System][knowledge], the website and the species data
- [Ground-Truthing Platform][ground], the mobile app that records plants in the field
- [IoT Plant Protection][iot], the ESP32 sensor nodes and edge devices (Sprint #2 onwards)

[knowledge]: Digital%20Plant%20Knowledge%20System%20-%20High-level%20design.png
[ground]: Ground-Truthing%20Platform%20-%20High-level%20design.png
[iot]: IoT%20Plant%20Protection%20-%20High-level%20design.png

The SQL that builds all of this is in [`supabase/`](../../supabase/README.md), run in order from 001
to 021. There's no 018 file, because the phone's photos didn't need one. Everything below is what
those files make, so if they change, this page changes too.

## How the parts talk to each other

```mermaid
flowchart LR
  subgraph sb["Supabase"]
    auth["Auth"]
    db[("Postgres with<br/>Row Level Security")]
    files["Storage buckets"]
  end
  phone["Mobile app (Expo)<br/>field teams"] -- "sign in, upload records<br/>and photos" --> sb
  web["Website (Next.js)<br/>public and staff"] -- "sign in, read views,<br/>manage species" --> sb
  esp["ESP32 sensor nodes"] -- "readings over WiFi" --> edge["Edge device<br/>one for each forest region"]
  edge -- "add readings over HTTPS,<br/>with its own token" --> sb
```

- The phone saves records on the device first, so field teams can work without a signal
  (item 9). [sync-design.md](../sync-design.md) has how they upload.
- The website reads through views (below), and staff pages only work for conservation officers
  and admins (items 4 and 15).
- Sensor nodes only talk to the edge device for their region, and only the edge device talks to
  Supabase (items 28 and 29). [`iot/README.md`](../../iot/README.md) has how.
- Nothing reads or changes a table with the service role key. Both apps use the publishable (anon)
  key plus the person's sign in, so Row Level Security decides what each person gets. The website's
  server only uses the service role key for Supabase Auth: inviting, deactivating and listing
  accounts for an administrator (item 2).

## Tables

```mermaid
erDiagram
  auth_users ||--|| profiles : "has one"
  profiles |o--o{ records : "submitted"
  species |o--o{ records : "matched to"
  iot_devices |o--o{ iot_nodes : "sends for"
  iot_devices ||--o{ iot_readings : "delivered"
  iot_nodes ||--o{ iot_readings : "took"
  iot_nodes ||--o{ iot_alerts : "raised"

  auth_users {
    uuid id PK
    text email
  }
  profiles {
    uuid id PK, FK "same as auth.users id"
    text email
    text name
    text role "visitor, researcher, botanist, conservation_officer or admin"
    text agency
    timestamptz created_at
    timestamptz updated_at
  }
  species {
    text id PK "the URL slug, like eusideroxylon-zwageri"
    text slug UK
    text scientific_name
    text family
    text common_names "list"
    text iucn_code "CR, EN, VU, NT, LC, DD or NE"
    boolean sarawak_protected
    boolean rough_area_only "007"
    text summary
    text habitat
    jsonb photos
    timestamptz updated_at "set by a trigger (007)"
  }
  records {
    uuid id PK
    text tag_code UK "NNP-3F2A9C (005)"
    text species_slug FK "empty if not matched yet (005)"
    text species_name "what the field team typed (005)"
    text common_name
    numeric height_m "empty if not measured"
    text condition "healthy, damaged, diseased or dead"
    jsonb gps "lat, lng and accuracyM"
    text notes
    text recorded_by
    timestamptz recorded_at
    text status "waiting, published or rejected"
    text review_notes
    text reviewed_by "filled in by a trigger (006)"
    timestamptz reviewed_at
    uuid submitted_by FK "filled in by a trigger (005)"
    timestamptz uploaded_at
    timestamptz updated_at "set by a trigger when a record is edited (008)"
  }
  iot_nodes {
    text node_id PK
    text name
    text zone
    text edge_device_id FK "the edge device it sends through (016)"
    text status "online, warning, threat_triggered or offline"
    integer battery_percent
    timestamptz last_heartbeat
    numeric temperature_c
    numeric humidity_percent
    numeric soil_moisture_percent
    boolean pir_movement_detected
    boolean tilt_alert
  }
  iot_devices {
    text device_id PK
    text name
    text zone
    boolean enabled
    timestamptz token_made_at
    text token_made_by_name
    timestamptz last_heard_at
  }
  iot_readings {
    bigint id PK
    text device_id FK
    text node_id FK
    text reading_id "unique on its own device"
    timestamptz recorded_at
    timestamptz received_at "set by the server"
    numeric temperature_c
    numeric humidity_percent
    numeric soil_moisture_percent
    numeric rain_percent
    numeric battery_percent
    numeric tilt_degrees
    numeric shock_g
    numeric distance_change_cm
    boolean motion_detected
    numeric latitude "staff only"
    numeric longitude "staff only"
  }
  iot_alerts {
    bigint id PK
    text node_id FK
    text kind
    text severity "urgent or routine"
    text status "open, acknowledged or resolved"
    timestamptz first_seen_at
    timestamptz last_seen_at
    integer repeat_count
    timestamptz acknowledged_at
    uuid acknowledged_by FK
    timestamptz resolved_at
    uuid resolved_by FK
    boolean closed_by_itself
  }
```

The diagram leaves out a few columns the apps don't use yet, and the small `iot_device_tokens`,
`iot_alert_limits` and `role_changes` tables. The SQL files have all of them.

| Table | What it holds | Who can change it (our SQL) |
| --- | --- | --- |
| `profiles` | One row per account, with its role | Nobody changes their own role. Only an admin changes other people's, and the last admin can't be removed (021) |
| `role_changes` | One line for every role change, with who made it, when, and a copy of the person's email and name (021). Admins can read it | Nobody through the API, admins included. A trigger on `profiles` adds each line |
| `species` | The plant knowledge base: names, family, IUCN status, Sarawak protection, text for the public pages | Conservation officers and admins |
| `records` | One row per tagged plant from the field, with its GPS point, condition and review status | Field teams add their own as waiting. Officers and admins review, edit and delete any record |
| `iot_nodes` | Each sensor node and the edge device it sends through. Nothing reads the older status and value columns any more, because 002 filled them with made up numbers | Admins |
| `iot_devices` | Each edge device, and whether it's turned on | Admins |
| `iot_device_tokens` | A hash of each edge device's token, never the token itself | Nobody through the API, admins included. An admin makes a new one with `iot_make_device_token`, which hands the plain token back once |
| `iot_readings` | Every reading from every node | An edge device adds them with `iot_add_readings` and its own token. Nobody changes or removes one |
| `iot_alerts` | One row for each problem on a node, with who acknowledged and resolved it | The threat rules add them. Officers and admins acknowledge and resolve them with `iot_acknowledge_alert` and `iot_resolve_alert` |
| `iot_alert_limits` | One row with the limits the threat rules use. These are starting values to tune | Admins |

Photos aren't stored in the tables. `record-photos` (005) is a private bucket for the photos the
phone uploads with a record. Field staff reach their own while they hold that role, and officers
and admins reach all of them (020). `botanical-photos` (001) is public, because the plant pages
show its species photos, and only officers and admins can add, replace or delete one (006).

## Views

Apps read records through views, so the exact spot of a sensitive plant never goes out to someone
who shouldn't see it.

| View | Who reads it | What it gives |
| --- | --- | --- |
| `species_public` | Anyone, signed in or not | Species for the public pages |
| `records_public` | Anyone, signed in or not | Published records only. The exact spot only for a species that is LC or NT, not protected in Sarawak and not set to rough area only, on a record whose name matches that species. Everyone else gets the middle of a 0.004 degree grid square (about 440 m at Niah) and the day it was recorded, not the time (019) |
| `species_staff` | Conservation officers and admins | Every species column, for the dashboard forms |
| `records_staff` | Conservation officers and admins | Every record with its exact point, for review and reports |
| `iot_node_status` | Conservation officers and admins | Each node's latest reading and whether it's gone quiet, for the Sensors page. It has no coordinates |

The website uses the same rule as `records_public` in `showsExactSpot()`
(`web/src/lib/iucn.ts`) and `recordHidesLocation()` (`web/src/data/species.ts`, which also checks
the name), so a hidden plant is never drawn as an exact dot.

## Why it's laid out like this

- **The species id is its slug.** The plant page URL, the records and the mobile app all use the
  same id, like `eusideroxylon-zwageri`, so it never changes once a species is added.
- **A record can exist without a species.** A field team might not know what a plant is yet. They
  type a name, `species_slug` stays empty and an officer matches it later. Deleting a species
  leaves its records in place with the slug emptied (005).
- **The tag code is unique.** It's printed on the tree tag and in its QR code, so two records can
  never share one (005).
- **The server fills in who and when.** Triggers set `submitted_by`, `uploaded_at`, `reviewed_by`
  and `reviewed_at`, so a phone or a browser can't send someone else's name (005 and 006).
- **GPS is one JSON column.** The phone sends lat, lng and accuracy together, and a check makes
  sure they're numbers inside sensible ranges (005).
- **Roles live in `profiles`, not in sign up data.** A new account is always a visitor, whatever
  the sign up form sent, and only an admin can make someone a botanist, officer or admin.
- **A device token is only kept as a hash.** Each edge device has its own, and it can only add
  readings for that device's nodes, so a copy of the table doesn't give anyone a working token (016).
- **The threat rules run in the database.** A trigger checks each reading as it arrives, so alerts
  come up with the website closed (017).
- **Node coordinates stay with staff.** Nodes sit beside protected plants, so no public view reads
  any IoT table (016 and 017).

## What's planned

- `recorded_by` and `reviewed_by` are text for now. Linking them to `profiles` would make reports
  easier, but the phone's offline records would need a migration first.
- A photos table if one record ends up with lots of photos (item 18, Sprint #2).

All the sample data is made up. The coordinates sit around park HQ, and the real location of a
threatened or protected plant never goes into this repo.
