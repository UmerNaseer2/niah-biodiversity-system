// Ecological Data Storage & Analysis Module (item 33).
// Aggregates IoT environmental microclimate sensors, calculates ecological health indices
// (such as Vapor Pressure Deficit, soil hydration index, and thermal stress), and correlates
// microclimatic stability with botanical species in Niah National Park.

import type { NodeStatus, SensorAlert } from "./iot";
import type { StaffRecord } from "./records-staff";

export type MicroclimateRisk = "optimal" | "moderate" | "stress" | "critical";

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
  threats: SensorAlert[];
};

export type EcologicalSummary = {
  overallHealthScore: number;
  monitoredZonesCount: number;
  optimalZonesCount: number;
  stressedZonesCount: number;
  totalSensorReadingsCount: number;
  averageBatteryPercent: number | null;
  anomalies: string[];
};

/**
 * Calculates Saturation Vapor Pressure (in kPa) given temperature in Celsius.
 * Tetens formula: VPsat = 0.61078 * exp((17.27 * T) / (T + 237.3))
 */
export function calculateVpSat(tempC: number): number {
  return 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/**
 * Calculates Vapor Pressure Deficit (VPD in kPa).
 * Measures the atmospheric drying pressure experienced by forest flora.
 * - Under 0.4 kPa: Low transpiration, risk of fungal disease in humid karst gullies.
 * - 0.4 to 1.2 kPa: Optimal lowland tropical rainforest transpiration.
 * - 1.2 to 1.6 kPa: Moderate moisture demand.
 * - Over 1.6 kPa: High drought/transpiration stress (stomata closure).
 */
export function calculateVPD(tempC: number | null, humidityPercent: number | null): number | null {
  if (tempC === null || humidityPercent === null) return null;
  const vpSat = calculateVpSat(tempC);
  const vpActual = vpSat * (Math.max(0, Math.min(100, humidityPercent)) / 100);
  const vpd = vpSat - vpActual;
  return Math.round(vpd * 100) / 100;
}

/** Known ecological habitats and baseline elevations for Niah National Park zones */
export const ZONE_ECOSYSTEMS: Record<string, { ecosystem: string; elevation: string }> = {
  "Pangkalan Lubang Boardwalk": {
    ecosystem: "Riverine & Lowland Alluvial Dipterocarp Forest",
    elevation: "15 – 35 m",
  },
  "Great Cave Path (Gully 3)": {
    ecosystem: "Karst Gully, Shaded Microclimate & Cave Flank",
    elevation: "45 – 90 m",
  },
  "Bukit Kasut Limestone Ridge": {
    ecosystem: "Exposed Limestone Cliff & Karst Peak Ridge",
    elevation: "140 – 210 m",
  },
};

/**
 * Determines ecological microclimate risk based on temperature, soil moisture, and atmospheric moisture.
 */
export function evaluateZoneRisk(
  tempC: number | null,
  humidity: number | null,
  soilMoisture: number | null,
  vpd: number | null,
  threats: SensorAlert[],
): { risk: MicroclimateRisk; reason: string } {
  if (threats.some((t) => t.severity === "urgent" && t.status !== "resolved")) {
    return { risk: "critical", reason: "Active urgent threat alert reported" };
  }
  if (soilMoisture !== null && soilMoisture < 20) {
    return { risk: "stress", reason: "Severe soil moisture deficit (<20%)" };
  }
  if (tempC !== null && tempC > 36) {
    return { risk: "stress", reason: "Elevated canopy thermal stress (>36°C)" };
  }
  if (vpd !== null && vpd > 1.6) {
    return { risk: "stress", reason: "High vapor pressure deficit, dry air stress" };
  }
  if (threats.some((t) => t.severity === "routine" && t.status !== "resolved")) {
    return { risk: "moderate", reason: "Routine environmental alert flagged" };
  }
  if (soilMoisture !== null && (soilMoisture < 35 || soilMoisture > 85)) {
    return { risk: "moderate", reason: "Soil moisture fluctuating outside optimum range" };
  }
  if (tempC !== null && (tempC < 20 || tempC > 32)) {
    return { risk: "moderate", reason: "Sub-optimal temperature deviation" };
  }
  return { risk: "optimal", reason: "Microclimate conditions stable and within safe ecological baseline" };
}

/**
 * Builds zone-level ecological profiles by combining sensor nodes, active alerts, and plant observations.
 */
export function buildZoneEcologies(
  nodes: NodeStatus[],
  records: StaffRecord[],
  alerts: SensorAlert[],
): ZoneEcology[] {
  // Group by zone names found in nodes and default zones
  const zoneNames = Array.from(
    new Set([...nodes.map((n) => n.zone).filter(Boolean), ...Object.keys(ZONE_ECOSYSTEMS)]),
  );

  return zoneNames.map((zoneName) => {
    const meta = ZONE_ECOSYSTEMS[zoneName] ?? {
      ecosystem: "Mixed Lowland Forest",
      elevation: "30 – 100 m",
    };
    const zoneNodes = nodes.filter((n) => n.zone === zoneName);
    const zoneAlerts = alerts.filter((a) => zoneNodes.some((n) => n.nodeId === a.nodeId));

    // Approximate plant association by matching notes or area keywords, or all records in vicinity
    const matchingRecords = records.filter(
      (r) =>
        r.notes?.toLowerCase().includes(zoneName.toLowerCase().split(" ")[0]) ||
        r.speciesName.toLowerCase().includes(zoneName.toLowerCase().split(" ")[0]),
    );

    // Latest readings aggregated across zone nodes
    const activeNodes = zoneNodes.filter((n) => n.temperatureC !== null);
    const latestTempC =
      activeNodes.length > 0
        ? Math.round(
            (activeNodes.reduce((acc, n) => acc + (n.temperatureC ?? 0), 0) / activeNodes.length) * 10,
          ) / 10
        : null;
    const latestHumidityPercent =
      activeNodes.length > 0
        ? Math.round(
            (activeNodes.reduce((acc, n) => acc + (n.humidityPercent ?? 0), 0) / activeNodes.length) * 10,
          ) / 10
        : null;
    const latestSoilMoisturePercent =
      activeNodes.length > 0
        ? Math.round(
            (activeNodes.reduce((acc, n) => acc + (n.soilMoisturePercent ?? 0), 0) / activeNodes.length) * 10,
          ) / 10
        : null;
    const latestRainPercent =
      activeNodes.length > 0
        ? Math.round(
            (activeNodes.reduce((acc, n) => acc + (n.rainPercent ?? 0), 0) / activeNodes.length) * 10,
          ) / 10
        : null;

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

/**
 * Computes overall ecosystem health score (0-100) and aggregates telemetry stats.
 */
export function summarizeEcologicalStatus(
  zones: ZoneEcology[],
  totalReadingsCount: number,
): EcologicalSummary {
  if (zones.length === 0) {
    return {
      overallHealthScore: 100,
      monitoredZonesCount: 0,
      optimalZonesCount: 0,
      stressedZonesCount: 0,
      totalSensorReadingsCount: totalReadingsCount,
      averageBatteryPercent: null,
      anomalies: [],
    };
  }

  let totalScore = 0;
  let optimalCount = 0;
  let stressedCount = 0;
  const anomalies: string[] = [];

  for (const z of zones) {
    if (z.microclimateRisk === "optimal") {
      totalScore += 100;
      optimalCount++;
    } else if (z.microclimateRisk === "moderate") {
      totalScore += 75;
    } else if (z.microclimateRisk === "stress") {
      totalScore += 45;
      stressedCount++;
      anomalies.push(`${z.zone}: ${z.riskReason}`);
    } else if (z.microclimateRisk === "critical") {
      totalScore += 20;
      stressedCount++;
      anomalies.push(`${z.zone}: ${z.riskReason}`);
    }
  }

  const allNodes = zones.flatMap((z) => z.nodes);
  const batteryNodes = allNodes.filter((n) => n.batteryPercent != null);
  const avgBattery =
    batteryNodes.length > 0
      ? Math.round(batteryNodes.reduce((acc, n) => acc + (n.batteryPercent ?? 0), 0) / batteryNodes.length)
      : null;

  return {
    overallHealthScore: Math.round(totalScore / zones.length),
    monitoredZonesCount: zones.length,
    optimalZonesCount: optimalCount,
    stressedZonesCount: stressedCount,
    totalSensorReadingsCount: totalReadingsCount,
    averageBatteryPercent: avgBattery,
    anomalies,
  };
}
