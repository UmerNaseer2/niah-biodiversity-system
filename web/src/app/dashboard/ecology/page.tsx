import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import {
  NEAR_NODE_M,
  RISK_LABELS,
  buildZoneEcologies,
  summarizeEcologicalStatus,
  type MicroclimateRisk,
} from "@/lib/ecology";
import { formatDateTime, parkTime, plural } from "@/lib/format";
import { ALERT_COLUMNS, NODE_COLUMNS, alertFromRow, nodeFromRow } from "@/lib/iot";
import { checkAlerts, sqlIsMissing } from "@/lib/iot-db";
import { recordFromRow } from "@/lib/records-staff";
import { notSetUp, SENSOR_FILES } from "@/lib/setup-hint";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ecology" };

const RECORD_COLUMNS = "id, species_slug, species_name, common_name, gps, condition, recorded_at, status";

const RISK_BADGES: Record<MicroclimateRisk, string> = {
  optimal: "bg-forest-soft text-forest-deep",
  moderate: "bg-pencil/20 text-pencil",
  stress: "bg-warn/15 text-warn",
  critical: "bg-bad/15 text-bad",
  no_data: "bg-line text-moss",
};

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Reading({ label, value, unit, note }: { label: string; value: number | null; unit: string; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-sheet p-3">
      <span className="text-xs font-bold text-moss">{label}</span>
      <p className="mt-1 text-lg font-bold">{value !== null ? `${value}${unit}` : "No reading"}</p>
      <span className="text-[11px] text-moss">{note}</span>
    </div>
  );
}

export default async function EcologyPage() {
  const me = await requireStaff();
  if (!me) return null;

  const supabase = await createClient();
  await checkAlerts();

  const [nodesResult, alertsResult, recordsResult, readingsCountResult] = await Promise.all([
    supabase.from("iot_node_status").select(NODE_COLUMNS).order("node_id"),
    supabase
      .from("iot_alerts")
      .select(ALERT_COLUMNS)
      .neq("status", "resolved")
      .order("recorded_at", { ascending: false }),
    // Only the columns buildZoneEcologies looks at. Reading every column of every record made this
    // page slow with 10,000 records (docs/test-results/item-37-performance.md). A rejected record
    // was a mistake, so it doesn't count as a plant growing near a zone.
    readAll((from, to) =>
      supabase
        .from("records_staff")
        .select(RECORD_COLUMNS, { count: "exact" })
        .neq("status", "rejected")
        .order("recorded_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    supabase.from("iot_readings").select("id", { count: "exact", head: true }),
  ]);

  const header = (
    <PageHeader
      eyebrow="Monitoring"
      title="Ecology"
      description="How each zone of the park is doing, from the newest sensor readings, the alerts going on and the plants recorded there."
      aside={
        <a href="/dashboard/ecology/csv" className="btn btn-secondary" download>
          <Icon name="download" className="size-4" />
          Download CSV
        </a>
      }
    />
  );

  if (sqlIsMissing(nodesResult.error)) {
    return (
      <div className="space-y-12">
        {header}
        <Problem>
          The sensor tables aren’t on this database yet, so there are no zones to show.{" "}
          {notSetUp(me.role, SENSOR_FILES)}
        </Problem>
      </div>
    );
  }

  const failed = [nodesResult.error, alertsResult.error, recordsResult.error, readingsCountResult.error].filter(
    (error) => error !== null,
  );
  for (const error of failed) console.error("Loading the ecology page failed:", error.code);

  const nodes = (nodesResult.data ?? []).map(nodeFromRow);
  const alerts = (alertsResult.data ?? []).map(alertFromRow);
  const records = (recordsResult.data ?? []).map(recordFromRow);
  const totalReadings = readingsCountResult.count ?? 0;

  const zones = buildZoneEcologies(nodes, records, alerts);
  const summary = summarizeEcologicalStatus(zones, totalReadings);

  return (
    <div className="space-y-12">
      {header}

      {failed.length > 0 && (
        <Problem>Some of the data didn’t load, so this page may be missing readings or alerts. Reload to try again.</Problem>
      )}

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="card p-5">
            <dt className="text-sm font-bold text-moss">Park score</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight text-forest">
              {summary.overallHealthScore !== null ? (
                <>
                  {summary.overallHealthScore}
                  <span className="text-lg font-normal text-moss"> / 100</span>
                </>
              ) : (
                "No readings"
              )}
            </dd>
            <dd className="mt-1 text-xs text-moss">Average of the zone ratings below</dd>
          </div>
          <div className="card p-5">
            <dt className="text-sm font-bold text-moss">Zones</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight">{summary.monitoredZonesCount}</dd>
            <dd className="mt-1 text-xs text-moss">{summary.optimalZonesCount} rated normal</dd>
          </div>
          <div className="card p-5">
            <dt className="text-sm font-bold text-moss">Readings stored</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight">{totalReadings.toLocaleString("en-MY")}</dd>
            <dd className="mt-1 text-xs text-moss">From every node since it was set up</dd>
          </div>
          <div className="card p-5">
            <dt className="text-sm font-bold text-moss">Nodes sending</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight">
              {summary.nodesReportingCount}
              <span className="text-lg font-normal text-moss"> of {summary.nodesCount}</span>
            </dd>
            <dd className="mt-1 text-xs text-moss">The rest have gone quiet or haven’t sent yet</dd>
          </div>
        </dl>
      </section>

      {summary.anomalies.length > 0 && (
        <section aria-labelledby="anomalies-heading">
          <div className="rounded-xl border border-warn/30 bg-warn/10 p-5">
            <h2 id="anomalies-heading" className="flex items-center gap-2 font-bold text-warn">
              <Icon name="alert" className="size-5 shrink-0" />
              {plural(summary.anomalies.length, "zone needs", "zones need")} a look
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
              {summary.anomalies.map((anomaly) => (
                <li key={anomaly}>{anomaly}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="zones-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 id="zones-heading" className="text-xl font-bold tracking-tight">
            Zones
          </h2>
          <p className="text-sm text-moss">{plural(zones.length, "zone")}</p>
        </div>
        <p className="mt-1 max-w-2xl text-moss">
          Each zone shows the average of its nodes’ newest readings, the plants recorded near it, and a
          rating from the table at the bottom of the page. A plant counts as near a zone when it was
          recorded within {NEAR_NODE_M} m of one of the zone’s nodes. Nodes with no GPS spot are left out
          of this.
        </p>

        <div className="mt-6 space-y-6">
          {zones.map((zone) => {
            const risk = zone.microclimateRisk;
            return (
              <article key={zone.zone} className="card overflow-hidden border border-line">
                <div className="flex flex-col gap-2 border-b border-line bg-sheet/40 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-moss">
                      {zone.elevation} • {zone.ecosystem}
                    </span>
                    <h3 className="text-lg font-bold">{zone.zone}</h3>
                  </div>
                  <span className={`self-start rounded-full px-3 py-1 text-xs font-bold sm:self-auto ${RISK_BADGES[risk]}`}>
                    {RISK_LABELS[risk]}
                  </span>
                </div>

                <div className="p-5">
                  <p className="text-sm text-moss">
                    <span className="font-bold text-ink">Why: </span>
                    {zone.riskReason}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <Reading label="Temperature" value={zone.latestTempC} unit=" °C" note="Air under the trees" />
                    <Reading label="Humidity" value={zone.latestHumidityPercent} unit="%" note="Air under the trees" />
                    <Reading label="Soil moisture" value={zone.latestSoilMoisturePercent} unit="%" note="Around the roots" />
                    <Reading label="Rain" value={zone.latestRainPercent} unit="%" note="How wet the rain pad is" />
                    <Reading label="Vapour pressure deficit" value={zone.vpdKPa} unit=" kPa" note="How dry the air is" />
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-line p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-moss">
                        Nodes ({zone.nodes.length})
                      </h4>
                      {zone.nodes.length === 0 ? (
                        <p className="mt-2 text-sm text-moss">No node in this zone yet.</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-line text-sm">
                          {zone.nodes.map((node) => (
                            <li key={node.nodeId} className="flex items-center justify-between gap-3 py-1.5">
                              <span className="font-mono font-bold">{node.nodeId}</span>
                              <span className="text-right text-xs text-moss">
                                {node.lastReadingAt
                                  ? `${node.quiet ? "Quiet, last heard" : "Heard"} ${formatDateTime(parkTime(node.lastReadingAt))}`
                                  : "Hasn’t sent a reading yet"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-lg border border-line p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-moss">
                        Plants recorded near here ({zone.plantSpecies.length})
                      </h4>
                      {zone.plantSpecies.length === 0 ? (
                        <p className="mt-2 text-sm text-moss">
                          {zone.nodes.length === 0
                            ? "This zone has no nodes yet, so no plants can be matched to it."
                            : zone.nodes.some((n) => n.latitude !== null && n.longitude !== null)
                              ? `No plants recorded within ${NEAR_NODE_M} m of a node here yet.`
                              : "None of the nodes here has a GPS spot yet, so no plants can be matched to this zone."}
                        </p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                          {zone.plantSpecies.map((plant) => (
                            <li key={plant.slug}>
                              <Link
                                href={`/plants/${plant.slug}`}
                                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sheet px-3 py-1 text-xs font-bold text-forest hover:border-forest"
                              >
                                {plant.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="rating-heading">
        <h2 id="rating-heading" className="text-xl font-bold tracking-tight">
          How a zone is rated
        </h2>
        <p className="mt-1 max-w-2xl text-moss">
          The page checks these from the top down and stops at the first one that fits. A zone with no
          readings and no alerts going on isn’t rated and is left out of the park score.
        </p>

        <div className="card relative mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-sheet text-moss">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold">Rating</th>
                <th scope="col" className="px-4 py-3 font-bold">When</th>
                <th scope="col" className="px-4 py-3 font-bold">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <th scope="row" className="px-4 py-3 font-bold">Urgent alert</th>
                <td className="px-4 py-3">An urgent alert is going on at one of the zone’s nodes</td>
                <td className="px-4 py-3">20</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-bold">Under stress</th>
                <td className="px-4 py-3">
                  Soil under 20%, air over 36 °C, or a vapour pressure deficit over 1.6 kPa (air dry
                  enough that plants close up to save water)
                </td>
                <td className="px-4 py-3">45</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-bold">Keep an eye on</th>
                <td className="px-4 py-3">
                  A routine alert is going on, soil is outside 35 to 85%, or air is outside 20 to 32 °C
                </td>
                <td className="px-4 py-3">75</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-bold">Normal</th>
                <td className="px-4 py-3">None of the above</td>
                <td className="px-4 py-3">100</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
