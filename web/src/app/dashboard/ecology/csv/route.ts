import { getSession } from "@/lib/auth";
import { RISK_LABELS, buildZoneEcologies } from "@/lib/ecology";
import { parkNow } from "@/lib/format";
import {
  ALERT_COLUMNS,
  NODE_COLUMNS,
  alertFromRow,
  nodeFromRow,
  type SensorAlert,
} from "@/lib/iot";
import { refuse, refuseUnlessStaff } from "@/lib/staff-download";
import { createClient } from "@/lib/supabase/server";

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // A cell starting with = + - or @ could run as a formula in a spreadsheet, so it gets a ' first.
  if (/^[\s]*[=+\-@\t\r＝]/.test(text)) {
    text = `'${text}`;
  }
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET() {
  // The proxy already sends anyone signed out to the sign in page
  const notStaff = refuseUnlessStaff(await getSession(), "ecological data");
  if (notStaff) return notStaff;

  const supabase = await createClient();
  const [nodesResult, alertsResult] = await Promise.all([
    supabase.from("iot_node_status").select(NODE_COLUMNS).order("node_id"),
    supabase
      .from("iot_alerts")
      .select(ALERT_COLUMNS)
      .neq("status", "resolved")
      .order("recorded_at", { ascending: false }),
  ]);

  // A file with some of the data missing would look complete, so any failure stops the download.
  const failed = [nodesResult.error, alertsResult.error].find((error) => error !== null);
  if (failed) {
    console.error("Making the ecology CSV failed:", failed.code);
    return refuse(500, "The sensor data didn’t load. Try the download again in a minute.");
  }

  const nodes = (nodesResult.data ?? []).map(nodeFromRow);
  const alerts: SensorAlert[] = (alertsResult.data ?? []).map(alertFromRow);
  // None of the columns in the file are about plants, so it doesn't read the records. Reading every
  // one of them made the download take seconds with 10,000 records
  // (docs/test-results/item-37-performance.md).
  const zones = buildZoneEcologies(nodes, [], alerts);

  const headers = [
    "Zone",
    "Habitat",
    "Height",
    "Temperature (°C)",
    "Humidity (%)",
    "Soil moisture (%)",
    "Rain (%)",
    "Vapour pressure deficit (kPa)",
    "Rating",
    "Why",
    "Nodes",
    "Alerts going on",
  ];

  const rows = zones.map((z) => [
    escapeCsvCell(z.zone),
    escapeCsvCell(z.ecosystem),
    escapeCsvCell(z.elevation),
    escapeCsvCell(z.latestTempC),
    escapeCsvCell(z.latestHumidityPercent),
    escapeCsvCell(z.latestSoilMoisturePercent),
    escapeCsvCell(z.latestRainPercent),
    escapeCsvCell(z.vpdKPa),
    escapeCsvCell(RISK_LABELS[z.microclimateRisk]),
    escapeCsvCell(z.riskReason),
    escapeCsvCell(z.nodes.length),
    escapeCsvCell(z.threats.length),
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  const today = parkNow().slice(0, 10);
  const filename = `niah-ecological-summary-${today}.csv`;

  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
