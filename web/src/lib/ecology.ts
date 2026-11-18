// The Ecology page's maths. It groups the sensor nodes by zone, averages their newest readings,
// works out the vapour pressure deficit from temperature and humidity, rates each zone, and lists
// the plants recorded near it. Nothing here reads the clock or the database.

import { metresBetween } from "./geo.ts";
import type { NodeStatus, SensorAlert } from "./iot.ts";
import type { StaffRecord } from "./records-staff.ts";

export type MicroclimateRisk = "optimal" | "moderate" | "stress" | "critical" | "no_data";

/** What each rating is called on the page and in the CSV */
export const RISK_LABELS: Record<MicroclimateRisk, string> = {
  optimal: "Normal",
  moderate: "Keep an eye on",
  stress: "Under stress",
  critical: "Urgent alert",
  no_data: "No readings",
};

export type ZoneEcology = {
  zone: string;
  ecosystem: string;
  elevation: string;
  nodes: NodeStatus[];
  plantRecords: StaffRecord[];
  plantSpecies: { name: string; slug: string; status: string }[];
  latestTempC: number | null;
  latestHumidityPercent: number | null;
  latestSoilMoisturePercent: number | null;
  latestRainPercent: number | null;
  vpdKPa: number | null;
  microclimateRisk: MicroclimateRisk;
  riskReason: string;
  /** Alerts on this zone's nodes that are still going on: not ended by themselves, not resolved */
  threats: SensorAlert[];
};

export type EcologicalSummary = {
  /** null when no zone has a reading or an alert going on to rate it by */
  overallHealthScore: number | null;
  monitoredZonesCount: number;
  ratedZonesCount: number;
  optimalZonesCount: number;
  stressedZonesCount: number;
  totalSensorReadingsCount: number;
  nodesCount: number;
  nodesReportingCount: number;
  anomalies: string[];
};

/** Saturation vapour pressure in kPa at a temperature in °C (Tetens formula). */
export function calculateVpSat(tempC: number): number {
  return 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/**
 * Vapour pressure deficit in kPa: how much more water the air could hold. Under 0.4 the air is so
 * wet that plants hardly lose water, 0.4 to 1.2 is normal for lowland rainforest, and over 1.6 the
 * air is dry enough that plants start closing up to save water.
 */
export function calculateVPD(tempC: number | null, humidityPercent: number | null): number | null {
  if (tempC === null || humidityPercent === null) return null;
  const vpSat = calculateVpSat(tempC);
  const vpActual = vpSat * (Math.max(0, Math.min(100, humidityPercent)) / 100);
  return Math.round((vpSat - vpActual) * 100) / 100;
}

/** The habitat and rough height of each zone the seed nodes are in */
export const ZONE_ECOSYSTEMS: Record<string, { ecosystem: string; elevation: string }> = {
  "Pangkalan Lubang Boardwalk": {
    ecosystem: "Riverside lowland forest",
    elevation: "15 to 35 m",
  },
  "Great Cave Path (Gully 3)": {
    ecosystem: "Shaded limestone gully by the cave",
    elevation: "45 to 90 m",
  },
  "Bukit Kasut Limestone Ridge": {
    ecosystem: "Open limestone ridge",
    elevation: "140 to 210 m",
  },
};

const OTHER_ZONE = { ecosystem: "Mixed lowland forest", elevation: "Height not set" };

/** A plant counts as near a zone when it was recorded this close to one of the zone's nodes */
export const NEAR_NODE_M = 200;

type Point = { lat: number; lng: number };

function isPoint(point: { lat?: unknown; lng?: unknown } | null | undefined): point is Point {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

/** The records within NEAR_NODE_M of any of these points. A record with no GPS is never near. */
export function recordsNear(records: StaffRecord[], points: Point[]): StaffRecord[] {
  if (points.length === 0) return [];
  return records.filter((r) => {
    const gps = r.gps;
    return isPoint(gps) && points.some((point) => metresBetween(gps, point) <= NEAR_NODE_M);
  });
}

/** Rates a zone from its averaged readings and the alerts going on there, worst first. */
export function evaluateZoneRisk(
  tempC: number | null,
  humidity: number | null,
  soilMoisture: number | null,
  vpd: number | null,
  threats: SensorAlert[],
): { risk: MicroclimateRisk; reason: string } {
  const open = threats.filter((t) => t.status !== "resolved" && t.clearedAt === null);
  if (open.some((t) => t.severity === "urgent")) {
    return { risk: "critical", reason: "An urgent alert is going on at a node here." };
  }
  if (soilMoisture !== null && soilMoisture < 20) {
    return { risk: "stress", reason: "Soil moisture deficit: the soil is under 20%." };
  }
  if (tempC !== null && tempC > 36) {
    return { risk: "stress", reason: "Too hot: the air is over 36 °C." };
  }
  if (vpd !== null && vpd > 1.6) {
    return { risk: "stress", reason: "The air is very dry (vapour pressure deficit over 1.6 kPa)." };
  }
  if (open.some((t) => t.severity === "routine")) {
    return { risk: "moderate", reason: "A routine alert is going on at a node here." };
  }
  if (soilMoisture !== null && (soilMoisture < 35 || soilMoisture > 85)) {
    return { risk: "moderate", reason: "Soil moisture is outside 35 to 85%." };
  }
  if (tempC !== null && (tempC < 20 || tempC > 32)) {
    return { risk: "moderate", reason: "Temperature is outside 20 to 32 °C." };
  }
  if (tempC === null && humidity === null && soilMoisture === null) {
    return { risk: "no_data", reason: "No readings from this zone yet." };
  }
  return { risk: "optimal", reason: "Readings are within the normal range." };
}

/** The mean of the values that are there, to one decimal place, or null if none are. */
function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return Math.round((present.reduce((sum, v) => sum + v, 0) / present.length) * 10) / 10;
}

/** One profile per zone: the zones the nodes are in, plus the three known ones. */
export function buildZoneEcologies(
  nodes: NodeStatus[],
  records: StaffRecord[],
  alerts: SensorAlert[],
): ZoneEcology[] {
  const zoneNames = Array.from(
    new Set([...nodes.map((n) => n.zone).filter(Boolean), ...Object.keys(ZONE_ECOSYSTEMS)]),
  );

  return zoneNames.map((zoneName) => {
    const meta = ZONE_ECOSYSTEMS[zoneName] ?? OTHER_ZONE;
    const zoneNodes = nodes.filter((n) => n.zone === zoneName);
    const zoneAlerts = alerts.filter(
      (a) =>
        a.status !== "resolved" &&
        a.clearedAt === null &&
        zoneNodes.some((n) => n.nodeId === a.nodeId),
    );

    // Records don't store a zone, so a record counts as near the zone when it was recorded within
    // NEAR_NODE_M of one of the zone's nodes. Nodes that haven't been given a GPS spot are skipped.
    const nodePoints = zoneNodes
      .map((n) => ({ lat: n.latitude, lng: n.longitude }))
      .filter(isPoint);
    const matchingRecords = recordsNear(records, nodePoints);

    // Each node's newest reading. A quiet node's one can be old, which the page shows next to it.
    const latestTempC = average(zoneNodes.map((n) => n.tempC));
    const latestHumidityPercent = average(zoneNodes.map((n) => n.humPct));
    const latestSoilMoisturePercent = average(zoneNodes.map((n) => n.soilPct));
    const latestRainPercent = average(zoneNodes.map((n) => n.rainPct));

    const vpd = calculateVPD(latestTempC, latestHumidityPercent);
    const { risk, reason } = evaluateZoneRisk(
      latestTempC,
      latestHumidityPercent,
      latestSoilMoisturePercent,
      vpd,
      zoneAlerts,
    );

    const speciesMap = new Map<string, { name: string; slug: string; status: string }>();
    for (const r of matchingRecords) {
      if (r.speciesSlug && !speciesMap.has(r.speciesSlug)) {
        speciesMap.set(r.speciesSlug, {
          name: r.commonName || r.speciesName,
          slug: r.speciesSlug,
          status: r.condition,
        });
      }
    }

    return {
      zone: zoneName,
      ecosystem: meta.ecosystem,
      elevation: meta.elevation,
      nodes: zoneNodes,
      plantRecords: matchingRecords,
      plantSpecies: Array.from(speciesMap.values()),
      latestTempC,
      latestHumidityPercent,
      latestSoilMoisturePercent,
      latestRainPercent,
      vpdKPa: vpd,
      microclimateRisk: risk,
      riskReason: reason,
      threats: zoneAlerts,
    };
  });
}

const RISK_SCORE: Record<Exclude<MicroclimateRisk, "no_data">, number> = {
  optimal: 100,
  moderate: 75,
  stress: 45,
  critical: 20,
};

/** The park score (0 to 100) is the mean of the zone scores, leaving out zones with no readings. */
export function summarizeEcologicalStatus(
  zones: ZoneEcology[],
  totalReadingsCount: number,
): EcologicalSummary {
  const rated = zones.filter((z) => z.microclimateRisk !== "no_data");
  const anomalies = zones
    .filter((z) => z.microclimateRisk === "stress" || z.microclimateRisk === "critical")
    .map((z) => `${z.zone}: ${z.riskReason}`);
  const allNodes = zones.flatMap((z) => z.nodes);

  let total = 0;
  for (const z of rated) total += RISK_SCORE[z.microclimateRisk as keyof typeof RISK_SCORE];

  return {
    overallHealthScore: rated.length > 0 ? Math.round(total / rated.length) : null,
    monitoredZonesCount: zones.length,
    ratedZonesCount: rated.length,
    optimalZonesCount: zones.filter((z) => z.microclimateRisk === "optimal").length,
    stressedZonesCount: anomalies.length,
    totalSensorReadingsCount: totalReadingsCount,
    nodesCount: allNodes.length,
    nodesReportingCount: allNodes.filter((n) => !n.quiet && n.lastReadingAt !== null).length,
    anomalies,
  };
}
