import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ConditionBadge, LatinName } from "@/components/plant-bits";
import { MOST_DOTS, ParkMap, type MapPoint, type MapSensor } from "@/components/park-map";
import { requireStaff } from "@/lib/auth";
import { ifItKeepsHappening, SENSOR_FILES, whatToRun } from "@/lib/setup-hint";
import { ALERT_LEVEL } from "@/lib/alert-level";
import { formatDateTime, formatLongDate, parkNow, parkTime, plural } from "@/lib/format";
import { ALERT_COLUMNS, ALERT_WORDS, alertFromRow, alertOrder } from "@/lib/iot";
import { checkAlerts, sqlIsMissing } from "@/lib/iot-db";
import { recordFromRow, type StaffRecord } from "@/lib/records-staff";
import { tagCode } from "@/lib/tags";
import { createClient } from "@/lib/supabase/server";

// The template in dashboard/layout.tsx only covers the pages below it, so
// this page spells out its whole title to match the other staff pages
export const metadata: Metadata = {
  title: { absolute: "Overview · Staff · Niah Plant Records" },
};

// How many records the latest list shows. The records page has the rest.
const LATEST = 8;

const WAITING_HREF = "/dashboard/records?status=waiting";

// How many sensor alerts the list shows. The sensors page has the rest.
const ALERTS_SHOWN = 5;

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "A", "A and B", "A, B and C" */
function joinNames(names: string[]) {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function plantName(record: Pick<StaffRecord, "commonName" | "speciesName">) {
  return record.commonName || record.speciesName;
}

// How many waiting records the "Needs you today" line names. It counts the rest.
const WAITING_NAMED = 3;

export default async function OverviewPage() {
  const me = await requireStaff();
  if (!me) return null;
  const firstName = me.name.split(" ")[0];
  // Signing in reads the cookies, so this page is drawn for each request and
  // the clock gives today, not the day the site was built
  const now = parkNow();

  // records_staff and species_staff only answer officers and admins
  // (supabase/006 and 007), the same people who can open this page
  const supabase = await createClient();
  // Before the reads, so a node that has just gone quiet is counted on this draw
  await checkAlerts();
  // The database counts the records and sends only the ones this page shows, so the page stays
  // quick with thousands of records (docs/test-results/item-37-performance.md)
  const newestFirst = { ascending: false } as const;
  const [
    latestResult,
    waitingResult,
    publishedResult,
    mapResult,
    speciesResult,
    nodesResult,
    alertsResult,
  ] = await Promise.all([
    supabase
      .from("records_staff")
      .select("*", { count: "exact" })
      .order("recorded_at", newestFirst)
      .order("id")
      .limit(LATEST),
    supabase
      .from("records_staff")
      .select("id, tag_code, species_name, common_name", { count: "exact" })
      .eq("status", "waiting")
      .order("recorded_at", newestFirst)
      .order("id")
      .limit(WAITING_NAMED),
    supabase
      .from("records_staff")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
    // A rejected record isn't a plant we know is there, so the map leaves it off
    supabase
      .from("records_staff")
      .select("id, tag_code, species_name, common_name, gps", { count: "exact" })
      .neq("status", "rejected")
      .not("gps", "is", null)
      .order("recorded_at", newestFirst)
      .order("id")
      .limit(MOST_DOTS),
    supabase.from("species_staff").select("id", { count: "exact", head: true }),
    // Node status with coordinates for GPS mapping (item 32)
    supabase.from("iot_node_status").select("node_id, quiet, last_reading_at, latitude, longitude"),
    // The alerts the badge in the staff menu counts: going on, nobody has picked them up, and not
    // from an edge's backlog (iot_check_alerts in 017). The sensors page has the rest.
    supabase
      .from("iot_alerts")
      .select(ALERT_COLUMNS)
      .eq("status", "open")
      .is("cleared_at", null)
      .eq("from_backlog", false),
  ]);
  const recordsError =
    latestResult.error ?? waitingResult.error ?? publishedResult.error ?? mapResult.error;
  if (recordsError) {
    console.error("Loading the records for the overview failed:", recordsError.message);
  }
  if (speciesResult.error) {
    console.error("Counting the species failed:", speciesResult.error.message);
  }
  const sensorsMissing = sqlIsMissing(nodesResult.error) || sqlIsMissing(alertsResult.error);
  if (!sensorsMissing) {
    if (nodesResult.error) console.error("Loading the sensor nodes failed:", nodesResult.error.code);
    if (alertsResult.error) console.error("Loading the sensor alerts failed:", alertsResult.error.code);
  }
  const recordsFailed = Boolean(recordsError);
  const latest = recordsFailed ? [] : (latestResult.data ?? []).map(recordFromRow);
  const recordCount = latestResult.count ?? 0;
  const waitingCount = waitingResult.count ?? 0;
  const publishedCount = publishedResult.count ?? 0;
  const nodeRows = nodesResult.data ?? [];
  const reporting = nodeRows.filter((n) => n.last_reading_at && !n.quiet).length;
  const openAlerts = (alertsResult.data ?? []).map(alertFromRow).sort(alertOrder);
  const shownAlerts = openAlerts.slice(0, ALERTS_SHOWN);

  const mapped: MapPoint[] = recordsFailed
    ? []
    : (mapResult.data ?? []).flatMap((row) => {
        const gps = row.gps as StaffRecord["gps"];
        if (!gps) return [];
        const tag = row.tag_code ? String(row.tag_code) : tagCode(String(row.id));
        const name = plantName({
          commonName: row.common_name ? String(row.common_name) : null,
          speciesName: String(row.species_name ?? ""),
        });
        return [
          {
            id: String(row.id),
            lat: gps.lat,
            lng: gps.lng,
            label: name || tag,
            link: {
              href: `/dashboard/records/${row.id}/edit`,
              text: `Edit ${tag}, ${name || "no species yet"}`,
            },
          },
        ];
      });
  // Every record with a spot, when the map only has room for the newest
  const mappable = mapResult.count ?? mapped.length;
  const leftOff = mappable > mapped.length;

  const mappedSensors: MapSensor[] = nodeRows
    .filter((n) => n.latitude != null && n.longitude != null)
    .map((n) => {
      const isQuiet = n.quiet === true;
      const hasAlert = openAlerts.some((a) => a.nodeId === n.node_id);
      const state = isQuiet ? "quiet" : hasAlert ? "alert" : "ok";
      return {
        id: String(n.node_id),
        lat: Number(n.latitude),
        lng: Number(n.longitude),
        state,
      };
    });

  const shown = (waitingResult.data ?? []).map((row) => {
    const name = plantName({
      commonName: row.common_name ? String(row.common_name) : null,
      speciesName: String(row.species_name ?? ""),
    });
    const tag = row.tag_code ? String(row.tag_code) : tagCode(String(row.id));
    return `${name || "No species yet"} (${tag})`;
  });
  const others = waitingCount - shown.length;
  const waitingNames = joinNames(others > 0 ? [...shown, plural(others, "other")] : shown);

  const counts: { label: string; value: string | null }[] = [
    {
      label: "Species",
      value: speciesResult.count == null ? null : String(speciesResult.count),
    },
    { label: "Public records", value: recordsFailed ? null : String(publishedCount) },
    { label: "Waiting for review", value: recordsFailed ? null : String(waitingCount) },
    {
      label: "Sensors reporting",
      value: nodesResult.error ? null : `${reporting} of ${nodeRows.length}`,
    },
  ];

  return (
    <div className="space-y-12">
      <header>
        <p className="eyebrow">{formatLongDate(now)}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {greeting(Number(now.slice(11, 13)))}, {firstName}
        </h1>
        <p className="mt-1 text-moss">
          Here’s what needs you today, from the plant records and the sensors.
        </p>
        {recordsFailed && (
          <p
            role="alert"
            className="mt-6 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
          >
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            The plant records didn’t load, so this page leaves them out.
            Refresh the page, and if it keeps happening,{" "}
            {ifItKeepsHappening(me.role)}
          </p>
        )}
      </header>

      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="text-xl font-bold tracking-tight">
          Needs you today
        </h2>
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-sheet">
          {!recordsFailed && (
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-forest-soft text-forest-deep">
                <Icon name={waitingCount ? "inbox" : "check"} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {waitingCount
                    ? `${plural(waitingCount, "record")} waiting for review`
                    : "No records are waiting for review"}
                </p>
                <p className="text-sm text-moss">
                  {waitingCount
                    ? `${waitingNames}, sent in from the mobile app.`
                    : "New records from the mobile app will show up here."}
                </p>
              </div>
              {waitingCount > 0 && (
                <Link href={WAITING_HREF} className="btn btn-primary self-start sm:self-auto">
                  See waiting records
                </Link>
              )}
            </li>
          )}
          {sensorsMissing ? (
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-moss">
                <Icon name="info" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">Sensors aren’t set up in this database yet</p>
                <p className="text-sm text-moss">
                  {me.role === "admin"
                    ? `There’s nothing to show about them yet. ${whatToRun(SENSOR_FILES)}`
                    : "There’s nothing to show about them until an administrator sets them up."}
                </p>
              </div>
            </li>
          ) : alertsResult.error ? (
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bad-soft text-bad">
                <Icon name="alert" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">The sensor alerts didn’t load</p>
                <p className="text-sm text-moss">
                  There could be open alerts you can’t see. Refresh the page, or look
                  on the sensors page.
                </p>
              </div>
              <Link
                href="/dashboard/sensors"
                className="btn btn-secondary self-start sm:self-auto"
              >
                See sensors
              </Link>
            </li>
          ) : null}
          {shownAlerts.map((alert) => (
            <li
              key={alert.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5"
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                  alert.severity === "urgent"
                    ? "bg-bad-soft text-bad"
                    : "bg-paper text-moss"
                }`}
              >
                <Icon name={alert.severity === "urgent" ? "alert" : "sensor"} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
                  <span
                    className={`rounded-full px-2 py-px text-xs font-bold ${ALERT_LEVEL[alert.severity].badge}`}
                  >
                    {ALERT_LEVEL[alert.severity].label}
                  </span>
                  {ALERT_WORDS[alert.type].title}
                </p>
                <p className="text-sm text-moss">
                  {alert.nodeId}, {alert.nodeName}.{" "}
                  {/* A quiet alert starts at the node's last reading, before the silence */}
                  {alert.type === "QUIET" ? "Last reading" : "Started"}{" "}
                  {formatDateTime(parkTime(alert.recordedAt))}.
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
          {openAlerts.length > shownAlerts.length && (
            <li className="p-4 text-sm sm:px-5">
              And {plural(openAlerts.length - shownAlerts.length, "more alert")} on the{" "}
              <Link
                href="/dashboard/sensors"
                className="font-bold underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                sensors page
              </Link>
              .
            </li>
          )}
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
                {count.value ?? (
                  <span className="text-base text-moss">Didn’t load</span>
                )}
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
          The newest records from the mobile app. The records page has all of them.
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
              {latest.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-moss">
                    {recordsFailed
                      ? "The records didn’t load."
                      : "There aren’t any records in the database yet."}
                  </td>
                </tr>
              )}
              {latest.map((record) => (
                <tr key={record.id}>
                  <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-mono font-bold">
                    <Link
                      href={`/dashboard/records/${record.id}/edit`}
                      className="underline decoration-line underline-offset-4 hover:decoration-ink"
                    >
                      {record.tagCode}
                    </Link>
                  </th>
                  <td className="px-4 py-3">
                    {record.commonName ?? <LatinName name={record.speciesName} />}
                    {!record.speciesSlug && (
                      <span className="block text-xs font-bold text-moss">No species yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{record.recordedBy ?? "Not given"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDateTime(record.recordedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <ConditionBadge condition={record.condition} />
                  </td>
                  <td className="px-4 py-3">
                    {record.status === "published" && (
                      <span className="font-bold text-ok">Public</span>
                    )}
                    {record.status === "waiting" && (
                      <Link
                        href={WAITING_HREF}
                        className="font-bold text-warn underline decoration-warn/40 underline-offset-4 hover:decoration-warn"
                      >
                        Waiting
                      </Link>
                    )}
                    {record.status === "rejected" && (
                      <span className="font-bold text-moss">Rejected</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recordCount > LATEST && (
          <p className="mt-3">
            <Link
              href="/dashboard/records"
              className="font-bold underline decoration-line underline-offset-4 hover:decoration-ink"
            >
              See all {plural(recordCount, "record")}
            </Link>
          </p>
        )}
      </section>

      <section aria-labelledby="map-heading">
        <h2 id="map-heading" className="text-xl font-bold tracking-tight">
          Where the plants and sensors are
        </h2>
        <p className="max-w-2xl text-moss">
          {leftOff
            ? `The newest ${mapped.length} of the ${mappable} plant records that haven’t been rejected, at their exact spots, along with active IoT monitoring nodes. The records page has the rest.`
            : "Every plant record that hasn’t been rejected at its exact spot, along with active IoT monitoring nodes."}
        </p>
        <ParkMap
          id="overview-map"
          title="Map of tagged plants and sensor nodes around park HQ"
          description={`A map of the park around park HQ with ${
            leftOff ? `the newest ${mapped.length} of ${mappable} tagged plants` : plural(mapped.length, "tagged plant")
          }${mappedSensors.length > 0 ? ` and ${plural(mappedSensors.length, "sensor node")}` : ""}. Each plant’s dot is a link to its record.`}
          points={mapped}
          sensors={mappedSensors}
          className="mt-8"
        />
      </section>
    </div>
  );
}
