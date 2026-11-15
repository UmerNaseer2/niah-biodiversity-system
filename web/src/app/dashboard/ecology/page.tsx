import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import {
  buildZoneEcologies,
  summarizeEcologicalStatus,
  type MicroclimateRisk,
} from "@/lib/ecology";
import { formatDateTime, parkTime, plural } from "@/lib/format";
import {
  ALERT_COLUMNS,
  NODE_COLUMNS,
  alertFromRow,
  nodeFromRow,
  type SensorAlert,
} from "@/lib/iot";
import { checkAlerts, sqlIsMissing } from "@/lib/iot-db";
import { recordFromRow } from "@/lib/records-staff";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ecological Analysis" };

const RISK_BADGES: Record<MicroclimateRisk, { label: string; badge: string }> = {
  optimal: { label: "Optimal", badge: "bg-forest-soft text-forest-deep" },
  moderate: { label: "Moderate Risk", badge: "bg-pencil/20 text-pencil" },
  stress: { label: "Microclimate Stress", badge: "bg-warn/15 text-warn" },
  critical: { label: "Critical Threat", badge: "bg-bad/15 text-bad" },
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

export default async function EcologyPage() {
  const me = await requireStaff();
  if (!me) return null;

  const supabase = await createClient();
  await checkAlerts();

  const [nodesResult, alertsResult, recordsResult, readingsCountResult] = await Promise.all([
    supabase.from("iot_node_status").select(NODE_COLUMNS).order("node_id"),
    supabase.from("iot_alerts").select(ALERT_COLUMNS).order("first_seen_at", { ascending: false }),
    readAll((from, to) =>
      supabase
        .from("records_staff")
        .select("*", { count: "exact" })
        .order("recorded_at", { ascending: false })
        .range(from, to),
    ),
    supabase.from("iot_readings").select("id", { count: "exact", head: true }),
  ]);

  const header = (
    <PageHeader
      eyebrow="Monitoring & Ecology"
      title="Ecological Analysis"
      description="Microclimate sensor integration and habitat condition analysis across Niah National Park (item 33)."
      aside={
        <a
          href="/dashboard/ecology/csv"
          className="btn btn-secondary"
          download
        >
          <Icon name="download" className="size-4" />
          Export ecology CSV
        </a>
      }
    />
  );

  if (sqlIsMissing(nodesResult.error)) {
    return (
      <div className="space-y-12">
        {header}
        <Problem>
          Sensor tables haven’t been initialized on this database yet. Run the sensor migrations in supabase/README.md first.
        </Problem>
      </div>
    );
  }

  const nodes = (nodesResult.data ?? []).map(nodeFromRow);
  const alerts: SensorAlert[] = (alertsResult.data ?? []).map(alertFromRow);
  const records = (recordsResult.data ?? []).map(recordFromRow);
  const totalReadings = readingsCountResult.count ?? 0;

  const zones = buildZoneEcologies(nodes, records, alerts);
  const summary = summarizeEcologicalStatus(zones, totalReadings);

  return (
    <div className="space-y-12">
      {header}

      {/* Summary KPI Tiles */}
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          Ecosystem health summary
        </h2>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="card p-5">
            <dt className="text-sm font-bold text-moss">Ecosystem Stability Index</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight text-forest">
              {summary.overallHealthScore}
              <span className="text-lg font-normal text-moss"> / 100</span>
            </dd>
            <dd className="mt-1 text-xs text-moss">Weighted cross-zone microclimate score</dd>
          </div>
          <div className="card p-5">
            <dt className="text-sm font-bold text-moss">Monitored Forest Zones</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight">
              {summary.monitoredZonesCount}
            </dd>
            <dd className="mt-1 text-xs text-moss">{summary.optimalZonesCount} within optimal thresholds</dd>
          </div>
          <div className="card p-5">
            <dt className="text-sm font-bold text-moss">Stored Sensor Readings</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight">
              {totalReadings.toLocaleString()}
            </dd>
            <dd className="mt-1 text-xs text-moss">Logged in iot_readings telemetry table</dd>
          </div>
          <div className="card p-5">
            <dt className="text-sm font-bold text-moss">Sensor Network Battery</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight">
              {summary.averageBatteryPercent !== null ? `${summary.averageBatteryPercent}%` : "No data"}
            </dd>
            <dd className="mt-1 text-xs text-moss">Average active node power reserve</dd>
          </div>
        </dl>
      </section>

      {/* Active Anomalies Alert Bar (if any) */}
      {summary.anomalies.length > 0 && (
        <section aria-labelledby="anomalies-heading">
          <div className="rounded-xl border border-warn/30 bg-warn/10 p-5">
            <h3 id="anomalies-heading" className="flex items-center gap-2 font-bold text-warn">
              <Icon name="alert" className="size-5 shrink-0" />
              Microclimate Stress Anomalies Detected ({summary.anomalies.length})
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
              {summary.anomalies.map((anomaly, idx) => (
                <li key={idx}>{anomaly}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Zone-by-Zone Ecological Analysis */}
      <section aria-labelledby="zones-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 id="zones-heading" className="text-xl font-bold tracking-tight">
            Zone Microclimate & Habitat Profiles
          </h2>
          <p className="text-sm text-moss">
            {plural(zones.length, "ecological zone")} evaluated
          </p>
        </div>
        <p className="mt-1 max-w-2xl text-moss">
          Combines live sensor microclimate metrics with ground-truthed plant observations to evaluate micro-habitat health.
        </p>

        <div className="mt-6 space-y-6">
          {zones.map((zone) => {
            const riskInfo = RISK_BADGES[zone.microclimateRisk];
            return (
              <article
                key={zone.zone}
                className="card overflow-hidden border border-line"
              >
                <div className="flex flex-col gap-2 border-b border-line bg-sheet/40 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-moss">
                      {zone.elevation} • {zone.ecosystem}
                    </span>
                    <h3 className="text-lg font-bold">{zone.zone}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${riskInfo.badge}`}>
                      {riskInfo.label}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <p className="text-sm text-moss">
                    <span className="font-bold text-ink">Assessment: </span>
                    {zone.riskReason}
                  </p>

                  {/* Microclimate Telemetry Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="rounded-lg border border-line bg-sheet p-3">
                      <span className="text-xs font-bold text-moss">Temperature</span>
                      <p className="mt-1 text-lg font-bold">
                        {zone.latestTempC !== null ? `${zone.latestTempC} °C` : "—"}
                      </p>
                      <span className="text-[11px] text-moss">Canopy ambient</span>
                    </div>

                    <div className="rounded-lg border border-line bg-sheet p-3">
                      <span className="text-xs font-bold text-moss">Relative Humidity</span>
                      <p className="mt-1 text-lg font-bold">
                        {zone.latestHumidityPercent !== null ? `${zone.latestHumidityPercent}%` : "—"}
                      </p>
                      <span className="text-[11px] text-moss">Understorey air</span>
                    </div>

                    <div className="rounded-lg border border-line bg-sheet p-3">
                      <span className="text-xs font-bold text-moss">Soil Moisture</span>
                      <p className="mt-1 text-lg font-bold">
                        {zone.latestSoilMoisturePercent !== null ? `${zone.latestSoilMoisturePercent}%` : "—"}
                      </p>
                      <span className="text-[11px] text-moss">Root zone saturation</span>
                    </div>

                    <div className="rounded-lg border border-line bg-sheet p-3">
                      <span className="text-xs font-bold text-moss">Rainfall Detection</span>
                      <p className="mt-1 text-lg font-bold">
                        {zone.latestRainPercent !== null ? `${zone.latestRainPercent}%` : "—"}
                      </p>
                      <span className="text-[11px] text-moss">Precipitation pad</span>
                    </div>

                    <div className="rounded-lg border border-line bg-sheet p-3">
                      <span className="text-xs font-bold text-moss">Vapor Pressure Deficit</span>
                      <p className="mt-1 text-lg font-bold">
                        {zone.vpdKPa !== null ? `${zone.vpdKPa} kPa` : "—"}
                      </p>
                      <span className="text-[11px] text-moss">Transpiration demand</span>
                    </div>
                  </div>

                  {/* Nodes & Plants in this zone */}
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-line p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-moss">
                        Monitoring Nodes in Zone ({zone.nodes.length})
                      </h4>
                      {zone.nodes.length === 0 ? (
                        <p className="mt-2 text-sm text-moss">No node linked to this zone yet.</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-line text-sm">
                          {zone.nodes.map((node) => (
                            <li key={node.nodeId} className="py-1.5 flex items-center justify-between">
                              <span className="font-mono font-bold">{node.nodeId}</span>
                              <span className="text-xs text-moss">
                                {node.lastReadingAt
                                  ? `Heard ${formatDateTime(parkTime(node.lastReadingAt))}`
                                  : "Waiting for reading"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-lg border border-line p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-moss">
                        Flora in Sector ({zone.plantSpecies.length} recorded species)
                      </h4>
                      {zone.plantSpecies.length === 0 ? (
                        <p className="mt-2 text-sm text-moss">No field records registered in this sector yet.</p>
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

      {/* Ecological Benchmarks & Thresholds Table */}
      <section aria-labelledby="benchmarks-heading">
        <h2 id="benchmarks-heading" className="text-xl font-bold tracking-tight">
          Ecological Microclimate Benchmarks
        </h2>
        <p className="mt-1 max-w-2xl text-moss">
          Standard physiological thresholds for Southeast Asian lowland rainforest and limestone karst ecosystems.
        </p>

        <div className="card mt-4 overflow-x-auto relative">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-sheet text-moss">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold">Metric</th>
                <th scope="col" className="px-4 py-3 font-bold">Optimal Range</th>
                <th scope="col" className="px-4 py-3 font-bold">Stress Threshold</th>
                <th scope="col" className="px-4 py-3 font-bold">Ecological Significance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <th scope="row" className="px-4 py-3 font-bold">Temperature</th>
                <td className="px-4 py-3">22 – 32 °C</td>
                <td className="px-4 py-3">&gt; 35 °C or &lt; 18 °C</td>
                <td className="px-4 py-3 text-moss">Affects photosynthetic enzyme activity and respiration.</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-bold">Relative Humidity</th>
                <td className="px-4 py-3">75 – 95%</td>
                <td className="px-4 py-3">&lt; 60%</td>
                <td className="px-4 py-3 text-moss">Prevents desiccation in shade-adapted cave margin and understorey herbs.</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-bold">Soil Moisture</th>
                <td className="px-4 py-3">45 – 75%</td>
                <td className="px-4 py-3">&lt; 25% or persistent &gt; 90%</td>
                <td className="px-4 py-3 text-moss">Ensures root hydration while avoiding hypoxic waterlogging.</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-bold">Vapor Pressure Deficit (VPD)</th>
                <td className="px-4 py-3">0.4 – 1.2 kPa</td>
                <td className="px-4 py-3">&gt; 1.6 kPa</td>
                <td className="px-4 py-3 text-moss">Driving force for transpiration; high VPD induces stomatal closure and wilt.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
