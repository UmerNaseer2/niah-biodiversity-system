import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { SketchMap } from "@/components/sketch-map";
import { Planned, PlannedTape } from "@/components/tape";
import { sensorAlerts, sensors, type Sensor } from "@/data/sensors";
import { formatDateTime, formatTime, plural } from "@/lib/format";
import { AlertList, type AlertItem } from "./alert-list";

export const metadata: Metadata = { title: "Sensors" };

// Below this the battery bar turns red, same as the battery alert
const LOW_BATTERY = 20;

// One slot per hour. Every sparkline uses the same scale so the plots can be
// compared side by side.
const SLOTS = 24;
const CHART_W = 240;
const CHART_H = 56;
const CHART_PAD = 6;
const MIN_C = 22;
const MAX_C = 34;

function chartX(slot: number) {
  return (slot / (SLOTS - 1)) * CHART_W;
}

function chartY(tempC: number) {
  return (
    CHART_PAD + ((MAX_C - tempC) / (MAX_C - MIN_C)) * (CHART_H - CHART_PAD * 2)
  );
}

function Sparkline({ sensor }: { sensor: Sensor }) {
  const history = sensor.tempHistory;
  const last = history.length - 1;
  const coords = history.map((t, i) => `${chartX(i)},${chartY(t)}`).join(" ");
  const missing = SLOTS - history.length;
  const range = `lowest ${Math.min(...history)} °C, highest ${Math.max(...history)} °C`;
  const label =
    missing > 0
      ? `Temperature for the last day: ${range}. No readings since ${formatTime(sensor.lastReading)}.`
      : `Temperature for the last 24 hours: ${range}, ${sensor.tempC} °C now.`;

  return (
    <figure>
      <svg
        viewBox={`-4 0 ${CHART_W + 8} ${CHART_H}`}
        role="img"
        aria-label={label}
        className="block h-14 w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id={`gap-${sensor.id}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#b3261e" strokeWidth="1.2" strokeOpacity="0.4" />
          </pattern>
        </defs>
        <line x1="0" y1={CHART_H - 1} x2={CHART_W} y2={CHART_H - 1} stroke="#dce3d6" strokeWidth="1" />
        {missing > 0 && (
          <rect
            x={chartX(last)}
            y="0"
            width={CHART_W - chartX(last)}
            height={CHART_H}
            fill={`url(#gap-${sensor.id})`}
          />
        )}
        <polyline
          points={coords}
          fill="none"
          stroke={sensor.online ? "#1f6b3a" : "#7f8d83"}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption
        aria-hidden="true"
        className="mt-1 flex justify-between font-mono text-[0.6875rem] text-pencil"
      >
        <span>24 h ago</span>
        <span className="flex gap-3">
          {missing > 0 && <span className="text-bad">no data</span>}
          <span>now</span>
        </span>
      </figcaption>
    </figure>
  );
}

function SensorCard({ sensor }: { sensor: Sensor }) {
  const low = sensor.battery < LOW_BATTERY;
  const readings = [
    { label: "Temperature", value: `${sensor.tempC} °C` },
    { label: "Humidity", value: `${sensor.humidity}%` },
    { label: "Soil moisture", value: `${sensor.soilMoisture}%` },
    {
      label: "Movement, last hour",
      value:
        sensor.movementLastHour === 0
          ? "None"
          : plural(sensor.movementLastHour, "time"),
    },
  ];

  return (
    <article aria-labelledby={`sensor-${sensor.id}`} className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`sensor-${sensor.id}`} className="font-mono text-lg font-bold">
            {sensor.id}
          </h3>
          <p className="text-sm text-moss">{sensor.plot}</p>
        </div>
        {sensor.online ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok">
            <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
            Online
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-bad-soft px-2.5 py-0.5 text-xs font-bold text-bad">
            <Icon name="offline" className="size-3.5" />
            Offline
          </span>
        )}
      </div>

      <p className={`mt-3 flex items-center gap-1.5 text-sm ${sensor.online ? "text-moss" : "font-bold text-bad"}`}>
        <Icon name="clock" className="size-4" />
        {sensor.online
          ? `Last reading at ${formatTime(sensor.lastReading)}`
          : `No data since ${formatTime(sensor.lastReading)}`}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {readings.map((reading) => (
          <div key={reading.label}>
            <dt className="text-moss">{reading.label}</dt>
            <dd className={`text-lg font-bold ${sensor.online ? "" : "text-moss"}`}>
              {reading.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 border-t border-line pt-4">
        <Sparkline sensor={sensor} />
      </div>

      <div className="mt-4">
        <p className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1.5 text-moss">
            <Icon name="battery" className="size-4" />
            Battery
          </span>
          <span className={`font-bold ${low ? "text-bad" : ""}`}>
            {sensor.battery}%{low && <span className="sr-only">, low</span>}
          </span>
        </p>
        <div
          aria-hidden="true"
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper ring-1 ring-line ring-inset"
        >
          <div
            className={`h-full rounded-full ${low ? "bg-bad" : "bg-forest"}`}
            style={{ width: `${sensor.battery}%` }}
          />
        </div>
      </div>
    </article>
  );
}

export default function SensorsPage() {
  const alerts: AlertItem[] = [...sensorAlerts]
    .sort(
      (a, b) =>
        Number(b.level === "urgent") - Number(a.level === "urgent") ||
        b.at.localeCompare(a.at),
    )
    .map((alert) => {
      const sensor = sensors.find((s) => s.id === alert.sensorId);
      if (!sensor) throw new Error(`Alert points at a missing sensor: ${alert.sensorId}`);
      return {
        id: alert.id,
        sensorId: alert.sensorId,
        plot: sensor.plot,
        level: alert.level,
        title: alert.title,
        detail: alert.detail,
        at: formatDateTime(alert.at),
      };
    });
  const offline = sensors.filter((s) => !s.online);

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Monitoring"
        title="Sensors"
        description="Five sensor nodes sit in the study plots. They measure temperature, humidity, soil moisture and movement, and raise an alert when something looks off."
        aside={<PlannedTape items={[30, 31, 32]} />}
      />

      <section aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="text-xl font-bold tracking-tight">
          Alerts
        </h2>
        <p className="max-w-2xl text-moss">
          Urgent ones first. Acknowledging only lasts until you refresh the
          page. Saving it and sending alerts to the patrol team is item 31.
        </p>
        <AlertList alerts={alerts} />
      </section>

      <section aria-labelledby="nodes-heading">
        <h2 id="nodes-heading" className="text-xl font-bold tracking-tight">
          Sensor nodes
        </h2>
        <p className="max-w-2xl text-moss">
          Each node sends a reading every hour.{" "}
          {offline.length > 0 &&
            `${offline.map((s) => s.id).join(" and ")} ${offline.length === 1 ? "is" : "are"} offline, so ${offline.length === 1 ? "its" : "their"} numbers are the last ones we got.`}
        </p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sensors.map((sensor) => (
            <li key={sensor.id}>
              <SensorCard sensor={sensor} />
            </li>
          ))}
          <li>
            <Planned items={[28, 29]} title="Live readings" className="h-full">
              <p>
                Every number on this page is made up. Getting real readings
                from the ESP32 nodes into the database is items 28 and 29.
              </p>
            </Planned>
          </li>
        </ul>
      </section>

      <section aria-labelledby="sensor-map-heading">
        <h2 id="sensor-map-heading" className="text-xl font-bold tracking-tight">
          Where the sensors are
        </h2>
        <p className="max-w-2xl text-moss">
          The positions are made up, like the rest of the demo.
        </p>
        <SketchMap
          id="sensor-map"
          title="Sketch map of the sensor nodes around park HQ"
          description={[
            `A sketch map around park HQ with ${plural(sensors.length, "sensor")}.`,
            ...offline.map((s) => `${s.id} is drawn hollow because it is offline.`),
            "Sensors with an alert today are circled.",
          ].join(" ")}
          sensors={sensors.map((s) => ({
            id: s.id,
            lat: s.position.lat,
            lng: s.position.lng,
            online: s.online,
            alert: sensorAlerts.some((a) => a.sensorId === s.id),
          }))}
          planned={[32]}
          className="mt-8"
        />
      </section>
    </div>
  );
}
