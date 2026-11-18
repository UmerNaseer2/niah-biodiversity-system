import test from "node:test";
import assert from "node:assert/strict";
import {
  NEARBY_READ_LIMIT,
  boxAround,
  metresBetween,
  nearbyFromRead,
  nearestPlants,
  pointFrom,
} from "../src/lib/nearby-plants.ts";

const NODE = { latitude: 3.8152, longitude: 113.7775 };

/** A record this many metres north and east of the node */
function plant(id, northM, eastM, extra = {}) {
  const lat = NODE.latitude + northM / 111_320;
  const lng = NODE.longitude + eastM / (111_320 * Math.cos((NODE.latitude * Math.PI) / 180));
  return {
    id,
    tag_code: `NNP-${id.slice(0, 6).toUpperCase()}`,
    species_name: "Shorea macrophylla",
    common_name: null,
    status: "published",
    gps: { lat, lng, accuracyM: 5 },
    ...extra,
  };
}

test("metresBetween gives real distances", () => {
  assert.equal(metresBetween(NODE, NODE), 0);
  // One thousandth of a degree north is about 111 m anywhere
  const north = metresBetween(NODE, { latitude: NODE.latitude + 0.001, longitude: NODE.longitude });
  assert.ok(Math.abs(north - 111.2) < 0.5, `got ${north}`);
  // Near the equator a degree of longitude is about the same
  const east = metresBetween(NODE, { latitude: NODE.latitude, longitude: NODE.longitude + 0.001 });
  assert.ok(Math.abs(east - 111.0) < 0.5, `got ${east}`);
  // Same both ways
  const a = { latitude: 3.81, longitude: 113.77 };
  const b = { latitude: 3.82, longitude: 113.79 };
  assert.equal(metresBetween(a, b), metresBetween(b, a));
});

test("boxAround holds every point in the circle", () => {
  const box = boxAround(NODE, 100);
  assert.ok(box.south < NODE.latitude && NODE.latitude < box.north);
  assert.ok(box.west < NODE.longitude && NODE.longitude < box.east);
  for (const [north, east] of [[100, 0], [-100, 0], [0, 100], [0, -100], [70, 70], [-70, -70]]) {
    const p = plant("aaaaaa", north, east).gps;
    assert.ok(p.lat >= box.south && p.lat <= box.north, `lat for ${north},${east}`);
    assert.ok(p.lng >= box.west && p.lng <= box.east, `lng for ${north},${east}`);
  }
  // And not much more than it, so the read stays small
  assert.ok(box.north - box.south < (2 * 110) / 111_320);
});

test("nearestPlants keeps the 3 nearest within 100 m, nearest first", () => {
  const rows = [
    plant("c00000-1", 0, 60),
    plant("a00000-1", 10, 0),
    plant("d00000-1", 0, 90),
    plant("b00000-1", -30, 0),
    plant("e00000-1", 0, 150),
  ];
  const near = nearestPlants(NODE, rows);
  assert.deepEqual(
    near.map((p) => [p.tagCode, p.distanceM]),
    [
      ["NNP-A00000", 10],
      ["NNP-B00000", 30],
      ["NNP-C00000", 60],
    ],
  );
});

test("nearestPlants leaves out rejected records and ones with no usable spot", () => {
  const rows = [
    plant("aaaaaa-1", 5, 0, { status: "rejected" }),
    plant("bbbbbb-1", 5, 0, { gps: null }),
    plant("cccccc-1", 5, 0, { gps: { lat: "3.8", lng: 113.7 } }),
    plant("dddddd-1", 5, 0, { gps: { lat: 95, lng: 113.7 } }),
    { ...plant("eeeeee-1", 5, 0), id: "" },
    plant("ffffff-1", 20, 0, { status: "waiting" }),
  ];
  const near = nearestPlants(NODE, rows);
  assert.equal(near.length, 1);
  assert.equal(near[0].id, "ffffff-1");
  assert.equal(near[0].waiting, true);
});

test("nearestPlants fills in the tag code and a missing name", () => {
  const [one] = nearestPlants(NODE, [plant("3f2a9c11", 1, 0, { tag_code: null, species_name: " " })]);
  assert.equal(one.tagCode, "NNP-3F2A9C");
  assert.equal(one.speciesName, "Not named yet");
  assert.equal(one.waiting, false);
  assert.equal(one.commonName, null);
});

test("a plant right on 100 m counts and one just past it doesn't", () => {
  const near = nearestPlants(NODE, [plant("aaaaaa", 99.5, 0), plant("bbbbbb", 101, 0)]);
  assert.deepEqual(near.map((p) => p.id), ["aaaaaa"]);
});

test("nearbyFromRead says why there's no list", () => {
  assert.deepEqual(nearbyFromRead(null, { rows: [], failed: false }), { kind: "no-position" });
  assert.deepEqual(nearbyFromRead(NODE, { rows: null, failed: true }), { kind: "failed" });
  assert.deepEqual(nearbyFromRead(NODE, { rows: [], failed: false }), {
    kind: "found",
    plants: [],
    maybeMore: false,
  });
  const full = Array.from({ length: NEARBY_READ_LIMIT }, (_, i) => plant(`p${String(i).padStart(5, "0")}`, 500, 0));
  const answer = nearbyFromRead(NODE, { rows: full, failed: false });
  assert.equal(answer.kind, "found");
  assert.equal(answer.maybeMore, true);
});

test("pointFrom only takes numbers that could be on Earth", () => {
  assert.deepEqual(pointFrom(3.8, 113.7), { latitude: 3.8, longitude: 113.7 });
  assert.equal(pointFrom(null, 113.7), null);
  assert.equal(pointFrom(3.8, Number.NaN), null);
  assert.equal(pointFrom(91, 113.7), null);
  assert.equal(pointFrom(3.8, -181), null);
});
