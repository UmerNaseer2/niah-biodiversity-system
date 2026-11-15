import { getSession } from "@/lib/auth";
import { buildZoneEcologies } from "@/lib/ecology";
import { parkNow } from "@/lib/format";
import {
  ALERT_COLUMNS,
  NODE_COLUMNS,
  alertFromRow,
  nodeFromRow,
  type SensorAlert,
} from "@/lib/iot";
import { recordFromRow } from "@/lib/records-staff";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";

function refuse(status: number, message: string) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Protect against CSV injection
  if (/^[\s]*[=+\-@\t\r＝]/.test(text)) {
    text = `'${text}`;
  }
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET() {
  const session = await getSession();
  if (session.status === "unavailable") {
    return refuse(503, "The database isn’t answering. Try the download again in a minute.");
  }
  if (session.status !== "ok") {
    return refuse(
      session.status === "signed-out" ? 401 : 403,
      "Only conservation officers and administrators can download ecological data.",
    );
  }

  const supabase = await createClient();
  const [nodesResult, alertsResult, recordsResult] = await Promise.all([
    supabase.from("iot_node_status").select(NODE_COLUMNS).order("node_id"),
    supabase.from("iot_alerts").select(ALERT_COLUMNS).order("first_seen_at", { ascending: false }),
    readAll((from, to) =>
      supabase
        .from("records_staff")
        .select("*", { count: "exact" })
        .order("recorded_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  if (nodesResult.error) {
    return refuse(500, "Sensor data could not be loaded.");
  }

  const nodes = (nodesResult.data ?? []).map(nodeFromRow);
  const alerts: SensorAlert[] = (alertsResult.data ?? []).map(alertFromRow);
  const records = (recordsResult.data ?? []).map(recordFromRow);

  const zones = buildZoneEcologies(nodes, records, alerts);

  const headers = [
    "Zone",
    "Ecosystem",
    "Elevation",
    "Latest Temperature (°C)",
    "Latest Humidity (%)",
    "Latest Soil Moisture (%)",
    "Latest Rain (%)",
    "Vapor Pressure Deficit (kPa)",
    "Microclimate Risk",
    "Assessment Reason",
    "Active Nodes",
    "Active Threats",
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
    escapeCsvCell(z.microclimateRisk),
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
