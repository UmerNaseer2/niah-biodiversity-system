import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateVpSat,
  calculateVPD,
  evaluateZoneRisk,
  buildZoneEcologies,
  summarizeEcologicalStatus,
} from "../src/lib/ecology.ts";

test("calculateVpSat computes saturation vapor pressure correctly", () => {
  // At 25°C, VPsat is approximately 3.17 kPa
  const vpsat25 = calculateVpSat(25);
  assert.ok(vpsat25 > 3.1 && vpsat25 < 3.25, `Expected ~3.17, got ${vpsat25}`);

  // At 30°C, VPsat is approximately 4.24 kPa
  const vpsat30 = calculateVpSat(30);
  assert.ok(vpsat30 > 4.2 && vpsat30 < 4.3, `Expected ~4.24, got ${vpsat30}`);
});

test("calculateVPD computes Vapor Pressure Deficit across humidity ranges", () => {
  // At 30°C and 80% humidity: VPD should be around 0.85 kPa (optimal range)
  const vpdOptimal = calculateVPD(30, 80);
  assert.ok(vpdOptimal !== null && vpdOptimal >= 0.8 && vpdOptimal <= 0.9);

  // At 35°C and 40% humidity: VPD should be elevated (> 3.0 kPa) indicating severe dry air stress
  const vpdHigh = calculateVPD(35, 40);
  assert.ok(vpdHigh !== null && vpdHigh > 3.0);

  // Null input handling
  assert.equal(calculateVPD(null, 80), null);
  assert.equal(calculateVPD(30, null), null);
});

test("evaluateZoneRisk identifies optimal vs stressed conditions", () => {
  // Optimal conditions
  const optimal = evaluateZoneRisk(27, 85, 65, 0.6, []);
  assert.equal(optimal.risk, "optimal");

  // Severe drought / soil moisture deficit
  const drySoil = evaluateZoneRisk(28, 70, 15, 1.1, []);
  assert.equal(drySoil.risk, "stress");
  assert.match(drySoil.reason, /soil moisture deficit/i);

  // Urgent threat alert in zone
  const urgentAlert = {
    id: 1,
    nodeId: "NNP-IOT-01",
    nodeName: "Boardwalk Node",
    kind: "disturbance",
    severity: "urgent",
    status: "open",
    readingField: "tilt_degrees",
    readingValue: 70,
    limitValue: 45,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    repeatCount: 1,
    acknowledgedAt: null,
    acknowledgedByName: null,
    resolvedAt: null,
    resolvedByName: null,
    closedByItself: false,
    dispatchedAt: null,
    dispatchedByName: null,
    patrolNotes: null,
  };
  const critical = evaluateZoneRisk(26, 80, 60, 0.7, [urgentAlert]);
  assert.equal(critical.risk, "critical");
});

test("buildZoneEcologies aggregates microclimate metrics across nodes and flora", () => {
  const nodes = [
    {
      nodeId: "NNP-IOT-01",
      name: "Boardwalk West Sensor Node",
      zone: "Pangkalan Lubang Boardwalk",
      edgeDeviceId: "NNP-EDGE-01",
      lastReadingAt: "2026-11-15T02:00:00Z",
      temperatureC: 27.5,
      humidityPercent: 86.0,
      soilMoisturePercent: 64.0,
      rainPercent: 0,
      batteryPercent: 92,
      tiltDegrees: 1.2,
      motionDetected: false,
      quiet: false,
      latitude: 3.8152,
      longitude: 113.7775,
    },
  ];

  const records = [
    {
      id: "rec-1",
      tagCode: "NNP-3F2A9C",
      speciesSlug: "eusideroxylon-zwageri",
      speciesName: "Eusideroxylon zwageri",
      commonName: "Belian",
      heightM: 18.5,
      condition: "healthy",
      gps: { lat: 3.81488, lng: 113.77968 },
      notes: "Pangkalan Lubang riverbank alluvial soil",
      recordedBy: "daniel",
      recordedAt: "2026-10-02T10:24:00Z",
      status: "published",
      version: 1,
    },
  ];

  const zones = buildZoneEcologies(nodes, records, []);
  assert.ok(zones.length >= 3);

  const boardwalk = zones.find((z) => z.zone === "Pangkalan Lubang Boardwalk");
  assert.ok(boardwalk);
  assert.equal(boardwalk.latestTempC, 27.5);
  assert.equal(boardwalk.latestHumidityPercent, 86.0);
  assert.equal(boardwalk.nodes.length, 1);
  assert.equal(boardwalk.plantSpecies.length, 1);
  assert.equal(boardwalk.plantSpecies[0].slug, "eusideroxylon-zwageri");

  const summary = summarizeEcologicalStatus(zones, 1500);
  assert.ok(summary.overallHealthScore > 70);
  assert.equal(summary.totalSensorReadingsCount, 1500);
  assert.equal(summary.averageBatteryPercent, 92);
});
