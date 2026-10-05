import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ConditionBadge } from "@/components/plant-bits";
import { SketchMap } from "@/components/sketch-map";
import { DEMO_USER_ID, getPerson } from "@/data/people";
import { records } from "@/data/records";
import { sensorAlerts, sensors } from "@/data/sensors";
import { getSpecies, species } from "@/data/species";
import { ALERT_LEVEL } from "@/lib/alert-level";
import { formatDateTime, MOCK_TODAY_LABEL, plural } from "@/lib/format";
import { tagCode } from "@/lib/tags";

// The template in dashboard/layout.tsx only covers the pages below it, so
// this page spells out its whole title to match the other staff pages
export const metadata: Metadata = {
  title: { absolute: "Overview · Staff · Niah Plant Records" },
};

function speciesName(slug: string) {
  const found = getSpecies(slug);
  if (!found) throw new Error(`Record points at a missing species: ${slug}`);
  return found.commonNames[0];
}

export default function OverviewPage() {
  const me = getPerson(DEMO_USER_ID);
  const waiting = records.filter((r) => r.status === "waiting");
  const published = records.filter((r) => r.status === "published");
  const online = sensors.filter((s) => s.online).length;
  const latest = [...records].sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt),
  );

  const counts = [
    { label: "Species", value: String(species.length) },
    { label: "Public records", value: String(published.length) },
    { label: "Waiting for review", value: String(waiting.length) },
    { label: "Sensors online", value: `${online} of ${sensors.length}` },
  ];

  return (
    <div className="space-y-12">
      <header>
        <p className="eyebrow">{MOCK_TODAY_LABEL}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Good morning, {me.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-moss">
          Here’s what needs you today. Everything on this dashboard is mock
          data.
        </p>
      </header>

      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="text-xl font-bold tracking-tight">
          Needs you today
        </h2>
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-sheet">
          <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-forest-soft text-forest-deep">
              <Icon name="inbox" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {plural(waiting.length, "new record")} to review
              </p>
              <p className="text-sm text-moss">
                {waiting
                  .map((r) => `${speciesName(r.speciesSlug)} (${tagCode(r.id)})`)
                  .join(" and ")}
                , sent in from the mobile app.
              </p>
            </div>
            <Link
              href="/dashboard/review"
              className="btn btn-primary self-start sm:self-auto"
            >
              Open the review queue
            </Link>
          </li>
          {sensorAlerts.map((alert) => (
            <li
              key={alert.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5"
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                  alert.level === "urgent"
                    ? "bg-bad-soft text-bad"
                    : "bg-paper text-moss"
                }`}
              >
                <Icon name={alert.level === "urgent" ? "alert" : "sensor"} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
                  <span
                    className={`rounded-full px-2 py-px text-xs font-bold ${ALERT_LEVEL[alert.level].badge}`}
                  >
                    {ALERT_LEVEL[alert.level].label}
                  </span>
                  {alert.title}
                </p>
                <p className="text-sm text-moss">
                  {formatDateTime(alert.at)} · {alert.detail}
                </p>
              </div>
              <Link
                href="/dashboard/sensors"
                className="btn btn-secondary self-start sm:self-auto"
              >
                See sensors
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="counts-heading">
        <h2 id="counts-heading" className="sr-only">
          Counts
        </h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
          {counts.map((count) => (
            <div key={count.label} className="flex flex-col bg-sheet p-4 sm:p-5">
              <dt className="text-sm text-moss">{count.label}</dt>
              <dd className="order-first text-2xl font-bold tracking-tight">
                {count.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="latest-heading">
        <h2 id="latest-heading" className="text-xl font-bold tracking-tight">
          Latest records
        </h2>
        <p className="text-moss">
          Everything that came in from the mobile app, newest first.
        </p>
        <div
          role="region"
          aria-labelledby="latest-heading"
          tabIndex={0}
          className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-sheet"
        >
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line bg-paper/60 text-moss">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-bold">Tag</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Species</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Recorded by</th>
                <th scope="col" className="px-4 py-2.5 font-bold">When</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Condition</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {latest.map((record) => (
                <tr key={record.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-bold">
                    {tagCode(record.id)}
                  </td>
                  <td className="px-4 py-3">{speciesName(record.speciesSlug)}</td>
                  <td className="px-4 py-3">{getPerson(record.recordedBy).name}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDateTime(record.recordedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <ConditionBadge condition={record.condition} />
                  </td>
                  <td className="px-4 py-3">
                    {record.status === "published" ? (
                      <span className="font-bold text-ok">Public</span>
                    ) : (
                      <Link
                        href="/dashboard/review"
                        className="font-bold text-warn underline decoration-warn/40 underline-offset-4 hover:decoration-warn"
                      >
                        Waiting
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="map-heading">
        <h2 id="map-heading" className="text-xl font-bold tracking-tight">
          Plants and sensors
        </h2>
        <p className="max-w-2xl text-moss">
          Staff see the exact points, including threatened plants. Every point
          here is made up, so the demo can’t give away a real location.
        </p>
        <SketchMap
          id="overview-map"
          title="Sketch map of tagged plants and sensors around park HQ"
          description={`A sketch map around park HQ with ${plural(
            records.filter((r) => r.gps).length,
            "tagged plant",
          )} and ${plural(sensors.length, "sensor")}. Sensors with an alert are circled.`}
          points={records.flatMap((r) =>
            r.gps
              ? [
                  {
                    id: r.id,
                    lat: r.gps.lat,
                    lng: r.gps.lng,
                    label: speciesName(r.speciesSlug),
                  },
                ]
              : [],
          )}
          sensors={sensors.map((s) => ({
            id: s.id,
            lat: s.position.lat,
            lng: s.position.lng,
            online: s.online,
            alert: sensorAlerts.some((a) => a.sensorId === s.id),
          }))}
          planned={[20, 32]}
          className="mt-8"
        />
      </section>
    </div>
  );
}
