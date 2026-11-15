import test from "node:test";
import assert from "node:assert/strict";
import { checkNewNode, nodeFromRow, alertFromRow } from "../src/lib/iot.ts";
import { roughArea, fromHq, PARK_HQ } from "../src/lib/geo.ts";

test("checkNewNode validates node IDs, names, zones, and GPS coordinates", () => {
  // Valid node with coordinates
  const valid = checkNewNode({
    nodeId: "NNP-IOT-04",
    name: "Subis River Basin Node",
    zone: "Subis River Lowlands",
    deviceId: "NNP-EDGE-01",
    latitude: 3.816,
    longitude: 113.78,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.nodeId, "NNP-IOT-04");
    assert.equal(valid.value.latitude, 3.816);
    assert.equal(valid.value.longitude, 113.78);
  }

  // Valid node without coordinates (optional)
  const noCoords = checkNewNode({
    nodeId: "NNP-IOT-05",
    name: "Ridge Node",
    zone: "Bukit Kasut",
    deviceId: null,
  });
  assert.equal(noCoords.ok, true);

  // Invalid coordinates: out of range
  const invalidLat = checkNewNode({
    nodeId: "NNP-IOT-06",
    name: "Bad Lat",
    zone: "Zone",
    deviceId: null,
    latitude: 95.5,
    longitude: 113.78,
  });
  assert.equal(invalidLat.ok, false);
  assert.match(invalidLat.message, /latitude/i);

  // Missing one coordinate when other is given
  const halfCoords = checkNewNode({
    nodeId: "NNP-IOT-07",
    name: "Half",
    zone: "Zone",
    deviceId: null,
    latitude: 3.815,
  });
  assert.equal(halfCoords.ok, false);
  assert.match(halfCoords.message, /both latitude and longitude/i);
});

test("nodeFromRow parses node coordinates and telemetry", () => {
  const row = {
    node_id: "NNP-IOT-01",
    name: "Boardwalk Node",
    zone: "Boardwalk",
    edge_device_id: "NNP-EDGE-01",
    last_reading_at: "2026-11-15T01:00:00Z",
    temperature_c: "27.80",
    humidity_percent: "86.40",
    soil_moisture_percent: "62.10",
    rain_percent: "0.00",
    battery_percent: 94,
    tilt_degrees: "1.20",
    motion_detected: false,
    quiet: false,
    latitude: "3.815200",
    longitude: "113.777500",
  };
  const node = nodeFromRow(row);
  assert.equal(node.nodeId, "NNP-IOT-01");
  assert.equal(node.temperatureC, 27.8);
  assert.equal(node.latitude, 3.8152);
  assert.equal(node.longitude, 113.7775);
  assert.equal(node.quiet, false);
});

test("alertFromRow parses patrol dispatch metadata", () => {
  const row = {
    id: "42",
    node_id: "NNP-IOT-02",
    node_name: "Great Cave Trail",
    kind: "disturbance",
    severity: "urgent",
    status: "acknowledged",
    reading_field: "tilt_degrees",
    reading_value: "68.5",
    limit_value: "45.0",
    first_seen_at: "2026-11-15T00:30:00Z",
    last_seen_at: "2026-11-15T00:45:00Z",
    repeat_count: "3",
    acknowledged_at: "2026-11-15T00:35:00Z",
    acknowledged_by_name: "Daniel Officer",
    resolved_at: null,
    resolved_by_name: null,
    closed_by_itself: false,
    dispatched_at: "2026-11-15T00:36:00Z",
    dispatched_by_name: "Daniel Officer",
    patrol_notes: "Patrol ranger dispatched to verify trail barrier",
  };
  const alert = alertFromRow(row);
  assert.equal(alert.id, 42);
  assert.equal(alert.severity, "urgent");
  assert.equal(alert.dispatchedByName, "Daniel Officer");
  assert.equal(alert.patrolNotes, "Patrol ranger dispatched to verify trail barrier");
});

test("geo utilities calculate rough grid areas and distances from HQ", () => {
  const area = roughArea(PARK_HQ.lat, PARK_HQ.lng);
  assert.ok(area.north > area.south);
  assert.ok(area.east > area.west);
  assert.equal(Math.round((area.north - area.south) * 1000) / 1000, 0.004);

  // A point 100 m north
  const northPoint = fromHq(PARK_HQ.lat + 0.001, PARK_HQ.lng);
  assert.match(northPoint, /north of park HQ/i);
});
