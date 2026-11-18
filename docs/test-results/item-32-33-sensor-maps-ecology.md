# Items 32 & 33 test results: IoT Device Tracking & GPS Mapping, and Ecological Data Storage & Analysis Module

These tests ran on 15 Nov 2026 on Windows (Node v24.14.0) on branch `feat/web-sensors-map-and-ecology`.
The SQL for these items is `supabase/026_iot_gps_mapping.sql`. Andy ran it on his own Supabase project to test. It still has to be run on the team's hosted project, after 025.

---

## 1. Item 32: IoT Device Tracking & GPS Mapping

### What it does

1. **GPS Coordinates on IoT Nodes (`iot_nodes` table & `iot_node_status` view)**
   - Added `latitude NUMERIC(9,6)` and `longitude NUMERIC(9,6)` columns to `public.iot_nodes` with range checks:
     `-90 <= latitude AND latitude <= 90` and `-180 <= longitude AND longitude <= 180`.
   - Updated the `public.iot_node_status` view so that every active sensor node provides its coordinates along with current environmental telemetry, status (`reporting`, `quiet`, `waiting`), and timestamp.
   - Seeded initial real GPS coordinates for Niah National Park nodes:
     - `NNP-IOT-01` (3.8152°N, 113.7775°E) - Great Cave Entryway
     - `NNP-IOT-02` (3.8175°N, 113.7812°E) - Painted Cave Corridor
     - `NNP-IOT-03` (3.8215°N, 113.7762°E) - Subis River Lowlands

2. **Interactive GPS Mapping on Dashboard Overview & Sensors Page**
   - **Overview page (`/dashboard`)**: The map section now displays both plant observation records and active IoT sensor nodes simultaneously under the heading *"Where the plants and sensors are"*. Sensors are distinguished with node icons, node status indicators, and live environmental telemetry.
   - **Sensors page (`/dashboard/sensors`)**: Replaced the previous planned placeholder stub with a full interactive `ParkMap` showing the spatial distribution of monitoring nodes across Niah National Park.
   - **Leaflet Integration**: Safe client-only rendering preventing SSR window crashes, custom sensor node SVG markers with state badges.

3. **Patrol Team Dispatch for Urgent Environmental & Physical Alerts**
   - Extended `public.iot_alerts` table with `dispatched_at TIMESTAMPTZ`, `dispatched_by UUID REFERENCES auth.users(id)`, `dispatched_by_name TEXT`, and `patrol_notes TEXT`.
   - Added stored procedure `public.iot_dispatch_patrol(alert_id, notes)` with row security: conservation officers and admins can dispatch ranger patrol teams directly from the alert list.
   - Server action `dispatchPatrol(alertId, notes)` validates credentials and updates dispatch status without exposing service keys.

4. **IoT Device Management Form Coordinates**
   - Updated `/dashboard/sensors/devices` to accept and validate optional `latitude` and `longitude` fields when registering new edge devices or microclimate sensor nodes.

---

## 2. Item 33: Ecological Data Storage & Analysis Module

### What it does

1. **Microclimate & Vapor Pressure Deficit (VPD) Calculations**
   - Implemented standard Tetens formula in `web/src/lib/ecology.ts` for saturation vapor pressure:
     $$e_s(T) = 0.61078 \times \exp\left(\frac{17.27 \times T}{T + 237.3}\right) \text{ kPa}$$
     $$\text{VPD} = e_s \times \left(1 - \frac{\text{RH}}{100}\right) \text{ kPa}$$
   - Evaluates microclimate risks per habitat zone:
     - **Optimal**: $0.4 \le \text{VPD} \le 1.25\text{ kPa}$, temperature $22\text{--}31^\circ\text{C}$, humidity $65\text{--}95\%$, soil moisture $\ge 30\%$.
     - **Moderate**: minor deviations in transpiration stress or soil moisture.
     - **Stress**: elevated transpiration deficit ($> 1.6\text{ kPa}$), extreme heat ($> 34^\circ\text{C}$), or dry soil ($< 20\%$).
     - **Critical**: high heat and extreme VPD ($> 2.0\text{ kPa}$) or prolonged drought indicators.

2. **Ecological Health Dashboard (`/dashboard/ecology`)**
   - Displays aggregated **Ecosystem Stability Score (%)** based on the ratio of optimal zones to total monitored zones.
   - Provides summary metrics: Optimal Zones, Microclimate Alerts, Average Park Temperature, Average Park Humidity, and Average VPD.
   - Features a **Zone Microclimate & Flora Analysis** grid correlating sensor node microclimate data with documented botanical species in each zone.
   - Includes microclimate thresholds and reference ranges based on tropical karst and lowland dipterocarp rainforest benchmarks.

3. **Secure CSV Export Route (`/dashboard/ecology/csv`)**
   - Allows conservation officers and park administrators to export current ecological and microclimatic zone profiles as CSV.
   - Enforces RBAC checks (requires officer or admin session).
   - Sanitizes cell values against CSV formula injection (neutralizing `=`, `+`, `-`, `@`, `\t`, `\r`).

4. **Navigation & Accessibility**
   - Added **Ecology** tab in the staff dashboard navigation (`/dashboard/staff-nav.tsx`) with droplet icon.
   - Registered `/dashboard/ecology` in `web/src/data/screens.ts`.

---

## 3. Automated Unit Tests

Two dedicated test suites were implemented in `web/tests/`:
1. `tests/ecology.test.mjs`:
   - `calculateVpSat`: validates saturation vapor pressure against known physical values at 20°C, 25°C, 30°C.
   - `calculateVPD`: validates Vapor Pressure Deficit across varying relative humidity ranges.
   - `evaluateZoneRisk`: verifies classification into `optimal`, `moderate`, `stress`, and `critical` risk bands.
   - `buildZoneEcologies`: tests cross-zone aggregation of telemetry, flora species association, and threat mapping.
2. `tests/iot-gps.test.mjs`:
   - `checkNewNode`: validates coordinate range checks (latitude/longitude boundaries) and input structure.
   - `nodeFromRow`: tests parsing of database rows into typed status records with coordinates.
   - `alertFromRow`: tests patrol dispatch metadata deserialization.
   - `geo utilities`: tests coordinate translation, rough area calculations, and distance to Park HQ.

### Test Execution Output:

```
> web@0.1.0 test
> node --test tests/*.test.mjs

✔ calculateVpSat computes saturation vapor pressure correctly (2.7734ms)
✔ calculateVPD computes Vapor Pressure Deficit across humidity ranges (0.7601ms)
✔ evaluateZoneRisk identifies optimal vs stressed conditions (6.3148ms)
✔ buildZoneEcologies aggregates microclimate metrics across nodes and flora (1.0102ms)
✔ checkNewNode validates node IDs, names, zones, and GPS coordinates (3.917ms)
✔ nodeFromRow parses node coordinates and telemetry (1.1416ms)
✔ alertFromRow parses patrol dispatch metadata (0.6906ms)
✔ geo utilities calculate rough grid areas and distances from HQ (0.8962ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

---

## 4. Build and Lint Verification

- **Lint**: `npm run lint` completed with 0 errors and 0 warnings.
- **Build**: `npm run build -- --webpack` compiled all 26 Next.js routes, generated static pages (21/21), and type-checked cleanly with TypeScript 5.
