import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth";
import {
  clockNow,
  formatDateTime,
  formatSeconds,
  formatTime,
  parkTime,
  plural,
} from "@/lib/format";
import {
  ALERT_COLUMNS,
  ALERT_WORDS,
  HISTORY_COLUMNS,
  NODE_COLUMNS,
  ageInWords,
  alertFromRow,
  alertOrder,
  alertReading,
  historyFromRow,
  limitsFromRow,
  nodeFromRow,
  shortNumber,
  type AlertLimits,
  type HistoryReading,
  type NodeStatus,
  type SensorAlert,
} from "@/lib/iot";
import { checkAlerts, sqlIsMissing } from "@/lib/iot-db";
import { createClient } from "@/lib/supabase/server";
import { AlertList, type AlertItem } from "./alert-list";
import { AutoRefresh } from "./auto-refresh";
import { Sparkline, type ChartPoint } from "./sparkline";

export const metadata: Metadata = { title: "Sensors" };

// A node sends about once a minute, so this is about the last hour
const HISTORY_READINGS = 60;
const TABLE_READINGS = 10;
const RESOLVED_SHOWN = 10;
// Only for joining up the chart line if the limits didn't load
const FALLBACK_QUIET_MINUTES = 15;

function databaseTime(iso: string) {
  return formatDateTime(parkTime(iso));
}

function alertItem(alert: SensorAlert, now: number): AlertItem {
  const words = ALERT_WORDS[alert.kind];
  const times = alert.repeatCount > 1 ? ` Seen ${plural(alert.repeatCount, "time")}.` : "";
  return {
    id: alert.id,
    nodeId: alert.nodeId,
    nodeName: alert.nodeName,
    severity: alert.severity,
    status: alert.status,
    title: words.title,
    means: words.means,
    todo: words.todo,
    reading: alertReading(alert),
    seen: `Started ${databaseTime(alert.firstSeenAt)}. Last seen ${ageInWords(alert.lastSeenAt, now)}.${times}`,
    handled:
      alert.status === "acknowledged" && alert.acknowledgedAt
        ? `Acknowledged by ${alert.acknowledgedByName ?? "someone"}, ${databaseTime(alert.acknowledgedAt)}`
        : null,
  };
}

type ChartParts = { points: ChartPoint[]; from: string; quietFrom: number | null };

/** Turns one measure's readings into places along the chart, from the first one shown up to now. */
function chartParts(
  history: HistoryReading[],
  value: (reading: HistoryReading) => number | null,
  unit: string,
  node: NodeStatus,
  quietMinutes: number,
  now: number,
): ChartParts | null {
  const readings = history.flatMap((reading) => {
    const number = value(reading);
    return number === null ? [] : [{ ms: Date.parse(reading.recordedAt), iso: reading.recordedAt, number }];
  });
  if (readings.length === 0) return null;

  const start = readings[0].ms;
  const span = Math.max(now - start, 1);
  const at = (ms: number) => Math.min(Math.max((ms - start) / span, 0), 1);
  return {
    points: readings.map((reading, index) => ({
      at: at(reading.ms),
      value: reading.number,
      text: `${formatTime(parkTime(reading.iso))}, ${shortNumber(reading.number)}${unit}`,
      afterGap: index > 0 && reading.ms - readings[index - 1].ms > quietMinutes * 60000,
    })),
    from: formatTime(parkTime(readings[0].iso)),
    quietFrom: node.quiet ? at(readings[readings.length - 1].ms) : null,
  };
}

/** What a screen reader gets instead of the line */
function chartLabel(title: string, nodeId: string, points: ChartPoint[], unit: string) {
  const values = points.map((point) => point.value);
  const number = (value: number) => `${shortNumber(value)}${unit}`;
  return `${title} on ${nodeId}, ${plural(points.length, "reading")}. Lowest ${number(Math.min(...values))}, highest ${number(Math.max(...values))}, latest ${number(values[values.length - 1])}.`;
}

function NodeChart({
  id,
  title,
  unit,
  node,
  parts,
  floor,
  ceiling,
  limits,
}: {
  id: string;
  title: string;
  unit: string;
  node: NodeStatus;
  parts: ChartParts | null;
  floor: number;
  ceiling: number;
  limits: number[];
}) {
  if (!parts) {
    return (
      <p className="text-sm text-moss">
        {title}: no readings to draw yet.
      </p>
    );
  }
  return (
    <Sparkline
      id={id}
      title={title}
      label={chartLabel(title, node.nodeId, parts.points, unit)}
      points={parts.points}
      floor={floor}
      ceiling={ceiling}
      limits={limits}
      quietFrom={parts.quietFrom}
      from={parts.from}
    />
  );
}

function reading(value: number | null, unit: string) {
  return value === null ? "Not sent" : `${shortNumber(value)}${unit}`;
}

function NodeCard({
  node,
  limits,
  history,
  now,
}: {
  node: NodeStatus;
  limits: AlertLimits | null;
  /** Oldest first, or null if it didn't load */
  history: HistoryReading[] | null;
  now: number;
}) {
  const headingId = `node-${node.nodeId}`;
  const noReadings = !node.lastReadingAt;
  const stale = node.quiet;
  const valueClass = `text-lg font-bold ${stale ? "text-moss" : ""}`;
  const batteryLow =
    limits !== null && node.batteryPercent !== null && node.batteryPercent < limits.batteryMinPercent;
  const quietMinutes = limits?.quietMinutes ?? FALLBACK_QUIET_MINUTES;

  const soil = history
    ? chartParts(history, (r) => r.soilMoisturePercent, "%", node, quietMinutes, now)
    : null;
  const temperature = history
    ? chartParts(history, (r) => r.temperatureC, " °C", node, quietMinutes, now)
    : null;
  const temperatures = temperature?.points.map((point) => point.value) ?? [];
  const lowestShown = Math.min(limits?.temperatureMinC ?? 15, ...temperatures);
  const highestShown = Math.max(limits?.temperatureMaxC ?? 40, ...temperatures);
  const recent = (history ?? []).slice(-TABLE_READINGS).reverse();

  return (
    <article
      aria-labelledby={headingId}
      className={`card p-4 sm:p-5 ${stale ? "border-l-4 border-l-bad" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="font-mono text-lg font-bold">
            {node.nodeId}
          </h3>
          <p className="text-sm text-moss">
            {node.name}
            {node.zone && `, ${node.zone}`}
          </p>
        </div>
        {noReadings ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs font-bold text-moss">
            <Icon name="info" className="size-3.5" />
            Waiting
          </span>
        ) : stale ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bad-soft px-2.5 py-0.5 text-xs font-bold text-bad">
            <Icon name="offline" className="size-3.5" />
            Quiet
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok">
            <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
            Reporting
          </span>
        )}
      </div>

      {!node.lastReadingAt ? (
        <p className="mt-3 text-sm text-moss">
          Nothing has come in from this node yet. This fills in when its first reading arrives.
        </p>
      ) : (
        <>
          <p className={`mt-3 flex items-start gap-1.5 text-sm ${stale ? "font-bold text-bad" : "text-moss"}`}>
            <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
            <span>
              {stale
                ? `Last reading ${ageInWords(node.lastReadingAt, now)} (${databaseTime(node.lastReadingAt)}). These are its last values, not what’s happening now.`
                : `Last reading ${ageInWords(node.lastReadingAt, now)} (${databaseTime(node.lastReadingAt)})`}
            </span>
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-moss">Temperature</dt>
              <dd className={valueClass}>{reading(node.temperatureC, " °C")}</dd>
            </div>
            <div>
              <dt className="text-moss">Humidity</dt>
              <dd className={valueClass}>{reading(node.humidityPercent, "%")}</dd>
            </div>
            <div>
              <dt className="text-moss">Soil moisture</dt>
              <dd className={valueClass}>{reading(node.soilMoisturePercent, "%")}</dd>
            </div>
            <div>
              <dt className="text-moss">Rain</dt>
              <dd className={valueClass}>{reading(node.rainPercent, "%")}</dd>
            </div>
            <div>
              <dt className="text-moss">Tilt</dt>
              <dd className={valueClass}>{reading(node.tiltDegrees, "°")}</dd>
            </div>
            <div>
              <dt className="text-moss">Movement</dt>
              <dd className={valueClass}>
                {node.motionDetected === null ? "Not sent" : node.motionDetected ? "Yes" : "None"}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <p className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-moss">
                <Icon name="battery" className="size-4" />
                Battery
              </span>
              <span className={`font-bold ${batteryLow ? "text-bad" : ""}`}>
                {reading(node.batteryPercent, "%")}
                {batteryLow && <span className="sr-only">, low</span>}
              </span>
            </p>
            {node.batteryPercent !== null && (
              <div
                aria-hidden="true"
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper ring-1 ring-line ring-inset"
              >
                <div
                  className={`h-full rounded-full ${batteryLow ? "bg-bad" : "bg-forest"}`}
                  style={{ width: `${node.batteryPercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="mt-4 space-y-4 border-t border-line pt-4">
            {history === null ? (
              <p className="flex items-start gap-1.5 text-sm font-bold text-bad">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                The history for this node didn’t load, so there’s no chart right now.
              </p>
            ) : (
              <>
                <NodeChart
                  id={`${node.nodeId}-soil`}
                  title="Soil moisture"
                  unit="%"
                  node={node}
                  parts={soil}
                  floor={0}
                  ceiling={100}
                  limits={limits ? [limits.soilMoistureMin, limits.soilMoistureMax] : []}
                />
                <NodeChart
                  id={`${node.nodeId}-temperature`}
                  title="Temperature"
                  unit=" °C"
                  node={node}
                  parts={temperature}
                  floor={lowestShown - 2}
                  ceiling={highestShown + 2}
                  limits={limits ? [limits.temperatureMinC, limits.temperatureMaxC] : []}
                />
              </>
            )}
          </div>

          {recent.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-bold">
                Last {plural(recent.length, "reading")}
              </summary>
              <div className="relative mt-2 overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left">
                  <thead className="border-b border-line bg-paper/60 text-moss">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-bold">When</th>
                      <th scope="col" className="px-3 py-2 font-bold">Temperature</th>
                      <th scope="col" className="px-3 py-2 font-bold">Soil moisture</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {recent.map((row) => (
                      <tr key={row.recordedAt}>
                        <td className="whitespace-nowrap px-3 py-2">{databaseTime(row.recordedAt)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{reading(row.temperatureC, " °C")}</td>
                        <td className="whitespace-nowrap px-3 py-2">{reading(row.soilMoisturePercent, "%")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </article>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Quiet ones first because those need someone, then the ones that haven't started, then by ID. */
function nodeRank(node: NodeStatus) {
  if (node.quiet) return 0;
  return node.lastReadingAt ? 2 : 1;
}

export default async function SensorsPage() {
  const me = await requireStaff();
  if (!me) return null;

  // Before the reads, so a node that has just gone quiet shows up on this draw and not the next
  await checkAlerts();

  const now = clockNow();
  const supabase = await createClient();
  const [nodesResult, alertsResult, resolvedResult, limitsResult] = await Promise.all([
    supabase.from("iot_node_status").select(NODE_COLUMNS),
    supabase.from("iot_alerts").select(ALERT_COLUMNS).neq("status", "resolved"),
    supabase
      .from("iot_alerts")
      .select(ALERT_COLUMNS)
      .eq("status", "resolved")
      .order("resolved_at", { ascending: false })
      .limit(RESOLVED_SHOWN),
    supabase.from("iot_alert_limits").select("*").limit(1),
  ]);

  const results = [nodesResult, alertsResult, resolvedResult, limitsResult];
  const missing = results.some((result) => sqlIsMissing(result.error));
  if (!missing) {
    for (const { error } of results) {
      if (error) console.error("Loading the sensors page failed:", error.code);
    }
  }

  const header = (aside?: React.ReactNode, status?: React.ReactNode) => (
    <PageHeader
      eyebrow="Monitoring"
      title="Sensors"
      description={
        <>
          <p>
            Readings from the sensor nodes beside tagged plants, and the alerts they’ve raised. The
            database checks every reading as it arrives, so alerts come up with this page closed too.
          </p>
          {status && <div className="mt-3">{status}</div>}
        </>
      }
      aside={aside}
    />
  );

  if (missing) {
    return (
      <div className="space-y-12">
        {header()}
        <Problem>
          This database hasn’t been set up for sensors yet, so there’s nothing to show here. The other
          pages aren’t affected. Ask an administrator to run the sensor steps in supabase/README.md.
        </Problem>
      </div>
    );
  }

  const nodes = nodesResult.error
    ? null
    : (nodesResult.data ?? [])
        .map(nodeFromRow)
        .sort((a, b) => nodeRank(a) - nodeRank(b) || a.nodeId.localeCompare(b.nodeId));
  const alerts = alertsResult.error ? null : (alertsResult.data ?? []).map(alertFromRow).sort(alertOrder);
  const resolved = resolvedResult.error ? null : (resolvedResult.data ?? []).map(alertFromRow);
  const limitsRow = limitsResult.error ? undefined : limitsResult.data?.[0];
  const limits = limitsRow ? limitsFromRow(limitsRow) : null;

  // One query for each node. That's fine for a few nodes, and it stops one busy node using up a
  // shared limit and leaving the others with short charts.
  const histories = await Promise.all(
    (nodes ?? []).map(async (node): Promise<[string, HistoryReading[] | null]> => {
      if (!node.lastReadingAt) return [node.nodeId, []];
      const { data, error } = await supabase
        .from("iot_readings")
        .select(HISTORY_COLUMNS)
        .eq("node_id", node.nodeId)
        .order("recorded_at", { ascending: false })
        .limit(HISTORY_READINGS);
      if (error) {
        console.error("Loading a node’s history failed:", error.code);
        return [node.nodeId, null];
      }
      return [node.nodeId, (data ?? []).map(historyFromRow).reverse()];
    }),
  );
  const historyFor = new Map(histories);

  const reporting = nodes?.filter((node) => node.lastReadingAt && !node.quiet).length ?? null;
  const quiet = nodes?.filter((node) => node.quiet).length ?? null;
  const open = alerts?.filter((alert) => alert.status === "open") ?? null;
  const tiles: { label: string; value: string | null }[] = [
    { label: "Nodes reporting", value: nodes ? `${reporting} of ${nodes.length}` : null },
    { label: "Nodes gone quiet", value: quiet === null ? null : String(quiet) },
    {
      label: "Urgent, not acknowledged",
      value: open ? String(open.filter((alert) => alert.severity === "urgent").length) : null,
    },
    { label: "Alerts not resolved", value: alerts ? String(alerts.length) : null },
  ];

  return (
    <div className="space-y-12">
      {header(
        me.role === "admin" ? (
          <Link href="/dashboard/sensors/devices" className="btn btn-secondary">
            <Icon name="sensor" className="size-4" />
            Devices
          </Link>
        ) : undefined,
        <AutoRefresh updatedAt={formatSeconds(now)} />,
      )}

      <section aria-labelledby="sensor-counts-heading">
        <h2 id="sensor-counts-heading" className="sr-only">
          Counts
        </h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="flex flex-col bg-sheet p-4 sm:p-5">
              <dt className="text-sm text-moss">{tile.label}</dt>
              <dd className="order-first text-2xl font-bold tracking-tight">
                {tile.value ?? <span className="text-base text-moss">Didn’t load</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="text-xl font-bold tracking-tight">
          Alerts
        </h2>
        <p className="max-w-2xl text-moss">
          Acknowledge one to say you’ve seen it and someone is on it. It stays here until you resolve
          it, and the red number in the menu only counts urgent ones nobody has acknowledged.
        </p>
        {alerts ? (
          <AlertList alerts={alerts.map((alert) => alertItem(alert, now))} />
        ) : (
          <Problem>
            The alerts didn’t load. There could be open alerts you can’t see. This page tries again by
            itself. If it keeps happening, ask an administrator to check the database.
          </Problem>
        )}
      </section>

      <section aria-labelledby="nodes-heading">
        <h2 id="nodes-heading" className="text-xl font-bold tracking-tight">
          Sensor nodes
        </h2>
        <p className="max-w-2xl text-moss">
          Any node that has gone quiet comes first. On the charts, the dashed lines are the alert
          limits. Hover over or tap a chart to read a value, and each node has a table of its latest
          readings.
        </p>
        {!nodes ? (
          <Problem>
            The sensor nodes didn’t load, so their readings aren’t shown. This page tries again by
            itself. If it keeps happening, ask an administrator to check the database.
          </Problem>
        ) : nodes.length === 0 ? (
          <p className="card mt-4 p-5 text-moss">
            There aren’t any sensor nodes in the database yet. An administrator can add them on the
            Devices page.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {nodes.map((node) => (
              <li key={node.nodeId}>
                <NodeCard
                  node={node}
                  limits={limits}
                  history={historyFor.get(node.nodeId) ?? null}
                  now={now}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="text-xl font-bold tracking-tight">
          What raises an alert
        </h2>
        {limits ? (
          <>
            <div
              role="region"
              aria-labelledby="rules-heading"
              tabIndex={0}
              className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-sheet"
            >
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-line bg-paper/60 text-moss">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-bold">Alert</th>
                    <th scope="col" className="px-4 py-2.5 font-bold">When</th>
                    <th scope="col" className="px-4 py-2.5 font-bold">Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <th scope="row" className="px-4 py-3 font-bold">{ALERT_WORDS.disturbance.title}</th>
                    <td className="px-4 py-3">
                      Tilt over {shortNumber(limits.tiltDegreesMax)}°, a shock over{" "}
                      {shortNumber(limits.shockGMax)} g, or moved more than{" "}
                      {shortNumber(limits.distanceChangeCmMax)} cm
                    </td>
                    <td className="px-4 py-3">Urgent</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 font-bold">{ALERT_WORDS.movement.title}</th>
                    <td className="px-4 py-3">The motion sensor sees something</td>
                    <td className="px-4 py-3">Routine</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 font-bold">Soil very dry or very wet</th>
                    <td className="px-4 py-3">
                      Under {shortNumber(limits.soilMoistureMin)}% or over{" "}
                      {shortNumber(limits.soilMoistureMax)}%
                    </td>
                    <td className="px-4 py-3">Routine</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 font-bold">Too hot or too cold</th>
                    <td className="px-4 py-3">
                      Over {shortNumber(limits.temperatureMaxC)} °C or under{" "}
                      {shortNumber(limits.temperatureMinC)} °C
                    </td>
                    <td className="px-4 py-3">Routine</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 font-bold">{ALERT_WORDS.battery_low.title}</th>
                    <td className="px-4 py-3">Under {shortNumber(limits.batteryMinPercent)}%</td>
                    <td className="px-4 py-3">Routine</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 font-bold">{ALERT_WORDS.quiet.title}</th>
                    <td className="px-4 py-3">Nothing for {plural(limits.quietMinutes, "minute")}</td>
                    <td className="px-4 py-3">Urgent, or routine if its battery was low</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="mt-3 max-w-2xl list-disc space-y-1 pl-5 text-sm text-moss">
              <li>A problem that keeps going stays as one alert, and counts how many times it’s been seen.</li>
              <li>
                After you resolve a routine alert, that kind of alert stays silent on that node for{" "}
                {plural(limits.reraiseMinutes, "minute")}, even if it happens again. If you’re not sure
                it’s over, acknowledge it instead.
              </li>
              <li>
                An urgent alert doesn’t wait. If it happens again after you resolve it, it comes
                straight back, so a node that’s still tilted keeps coming back until someone sets it
                straight.
              </li>
            </ul>
          </>
        ) : (
          <p className="mt-2 max-w-2xl text-moss">
            The limits didn’t load, so they aren’t shown here and the charts and batteries are drawn
            without them. Alerts are still raised by the database.
          </p>
        )}
      </section>

      {resolved && resolved.length > 0 && (
        <section aria-labelledby="resolved-heading">
          <h2 id="resolved-heading" className="text-xl font-bold tracking-tight">
            Recently resolved
          </h2>
          <details className="mt-2">
            <summary className="cursor-pointer font-bold">
              Show the last {plural(resolved.length, "alert")}
            </summary>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-sheet text-sm">
              {resolved.map((alert) => (
                <li key={alert.id} className="p-4">
                  <p>
                    <span className="font-mono font-bold">{alert.nodeId}</span>{" "}
                    <span className="font-bold">{ALERT_WORDS[alert.kind].title}</span>
                  </p>
                  <p className="text-moss">
                    {alert.closedByItself
                      ? "Closed by itself when readings came back"
                      : `Resolved by ${alert.resolvedByName ?? "someone"}`}
                    {alert.resolvedAt && `, ${databaseTime(alert.resolvedAt)}`}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
