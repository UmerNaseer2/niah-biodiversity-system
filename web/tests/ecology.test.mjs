import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateVpSat,
  calculateVPD,
  evaluateZoneRisk,
  buildZoneEcologies,
  recordsNear,
  summarizeEcologicalStatus,
  NEAR_NODE_M,
} from "../src/lib/ecology.ts";
import { metresBetween } from "../src/lib/geo.ts";

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
    deviceId: "NNP-EDGE-01",
    type: "MOVED",
    severity: "urgent",
    status: "open",
    recordedAt: "2026-11-15T00:30:00Z",
    confirmedAt: "2026-11-15T00:30:05Z",
    fromBacklog: false,
    clearedRecordedAt: null,
    clearedAt: null,
    acknowledgedAt: null,
    acknowledgedByName: null,
    resolvedAt: null,
    resolvedByName: null,
    dispatchedAt: null,
    dispatchedByName: null,
    patrolNotes: null,
  };
  const critical = evaluateZoneRisk(26, 80, 60, 0.7, [urgentAlert]);
  assert.equal(critical.risk, "critical");

  // A resolved alert doesn't count
  const resolved = evaluateZoneRisk(26, 80, 60, 0.7, [{ ...urgentAlert, status: "resolved" }]);
  assert.equal(resolved.risk, "optimal");

  // Nor does one that has ended by itself, even before someone resolves it
  const ended = evaluateZoneRisk(26, 80, 60, 0.7, [
    { ...urgentAlert, clearedRecordedAt: "2026-11-15T01:00:00Z", clearedAt: "2026-11-15T01:00:05Z" },
  ]);
  assert.equal(ended.risk, "optimal");

  // Nothing to go on
  const nothing = evaluateZoneRisk(null, null, null, null, []);
  assert.equal(nothing.risk, "no_data");
});

test("buildZoneEcologies aggregates microclimate metrics across nodes and flora", () => {
  const node = {
    nodeId: "NNP-IOT-01",
    name: "Boardwalk West Sensor Node",
    zone: "Pangkalan Lubang Boardwalk",
    edgeDeviceId: "NNP-EDGE-01",
    health: "online",
    lastReadingAt: "2026-11-15T02:00:00Z",
    tempC: 27.5,
    tempState: null,
    humPct: 86.0,
    soilPct: 64.0,
    soilState: "MOIST",
    rainPct: 0,
    rainState: "DRY",
    distCm: 120,
    baselineCm: 120,
    distState: "OK",
    motion: false,
    beepOn: false,
    rssi: -70,
    quiet: false,
    openAlerts: 0,
    urgentAlerts: 0,
    latitude: 3.8152,
    longitude: 113.7775,
  };
  // A second node with no humidity reading: the average leaves it out instead of counting it as 0.
  const nodes = [node, { ...node, nodeId: "NNP-IOT-04", tempC: 28.5, humPct: null, quiet: true }];

  const belian = {
    id: "rec-1",
    tagCode: "NNP-3F2A9C",
    speciesSlug: "eusideroxylon-zwageri",
    speciesName: "Eusideroxylon zwageri",
    commonName: "Belian",
    heightM: 18.5,
    condition: "healthy",
    // About 105 m from the node
    gps: { lat: 3.816, lng: 113.778, accuracyM: 6 },
    notes: "Riverbank, alluvial soil",
    recordedBy: "daniel",
    recordedAt: "2026-10-02T10:24:00Z",
    status: "published",
    version: 1,
  };
  const records = [
    belian,
    // About 245 m from the node. Its notes name the zone, which used to be enough, but it's too far.
    {
      ...belian,
      id: "rec-2",
      speciesSlug: "shorea-macrophylla",
      speciesName: "Shorea macrophylla",
      commonName: "Engkabang",
      gps: { lat: 3.81488, lng: 113.77968, accuracyM: 6 },
      notes: "Pangkalan Lubang riverbank",
    },
    // No GPS, so it can't be near anything
    { ...belian, id: "rec-3", speciesSlug: "nepenthes-ampullaria", gps: null },
  ];

  const zones = buildZoneEcologies(nodes, records, []);
  assert.ok(zones.length >= 3);

  const boardwalk = zones.find((z) => z.zone === "Pangkalan Lubang Boardwalk");
  assert.ok(boardwalk);
  assert.equal(boardwalk.latestTempC, 28);
  assert.equal(boardwalk.latestHumidityPercent, 86.0);
  assert.equal(boardwalk.nodes.length, 2);
  assert.deepEqual(
    boardwalk.plantRecords.map((r) => r.id),
    ["rec-1"],
  );
  assert.equal(boardwalk.plantSpecies.length, 1);
  assert.equal(boardwalk.plantSpecies[0].slug, "eusideroxylon-zwageri");

  // The zones with no nodes can't have plants near them
  for (const zone of zones.filter((z) => z.nodes.length === 0)) {
    assert.equal(zone.plantRecords.length, 0);
  }

  // The other two known zones have no nodes, so they aren't rated and the score is the boardwalk's.
  const summary = summarizeEcologicalStatus(zones, 1500);
  assert.equal(summary.ratedZonesCount, 1);
  assert.equal(summary.overallHealthScore, 100);
  assert.equal(summary.totalSensorReadingsCount, 1500);
  assert.equal(summary.nodesCount, 2);
  assert.equal(summary.nodesReportingCount, 1);
});

test("summarizeEcologicalStatus has no score when nothing has readings", () => {
  const zones = buildZoneEcologies([], [], []);
  const summary = summarizeEcologicalStatus(zones, 0);
  assert.equal(summary.overallHealthScore, null);
  assert.equal(summary.anomalies.length, 0);
});

test("metresBetween gives the distance along the ground", () => {
  const node = { lat: 3.8152, lng: 113.7775 };
  assert.equal(metresBetween(node, node), 0);
  // 0.001 degrees of latitude is about 111 m anywhere
  assert.ok(Math.abs(metresBetween(node, { lat: 3.8162, lng: 113.7775 }) - 111.2) < 0.5);
  // The same both ways
  const far = { lat: 3.81488, lng: 113.77968 };
  assert.equal(metresBetween(node, far), metresBetween(far, node));
  assert.ok(Math.abs(metresBetween(node, far) - 244.5) < 1);
});

test("recordsNear counts records within 200 m of any node and skips nodes with no GPS", () => {
  const record = (id, gps) => ({ id, speciesName: "Belian", notes: null, gps });
  const near = record("near", { lat: 3.8169, lng: 113.7775, accuracyM: 5 }); // about 189 m
  const edge = record("edge", { lat: 3.8171, lng: 113.7775, accuracyM: 5 }); // about 211 m
  const noGps = record("no-gps", null);
  const nodePoint = { lat: 3.8152, lng: 113.7775 };

  assert.equal(NEAR_NODE_M, 200);
  assert.deepEqual(
    recordsNear([near, edge, noGps], [nodePoint]).map((r) => r.id),
    ["near"],
  );
  // A second node next to the far record brings it in
  assert.deepEqual(
    recordsNear([near, edge], [nodePoint, { lat: 3.8175, lng: 113.7775 }]).map((r) => r.id),
    ["near", "edge"],
  );
  // No points, no records
  assert.deepEqual(recordsNear([near, edge], []), []);

  // A zone whose only node has no GPS gets no plants, even with a record right where it would be
  const node = {
    nodeId: "NNP-IOT-09",
    name: "Ridge node",
    zone: "Bukit Kasut Limestone Ridge",
    tempC: 27,
    humPct: 80,
    soilPct: 60,
    rainPct: 0,
    quiet: false,
    lastReadingAt: "2026-11-15T02:00:00Z",
    latitude: null,
    longitude: null,
  };
  const onRidge = record("on-ridge", { lat: 3.8152, lng: 113.7775, accuracyM: 5 });
  const ridge = buildZoneEcologies([node], [onRidge], []).find(
    (z) => z.zone === "Bukit Kasut Limestone Ridge",
  );
  assert.equal(ridge.nodes.length, 1);
  assert.equal(ridge.plantRecords.length, 0);
});
