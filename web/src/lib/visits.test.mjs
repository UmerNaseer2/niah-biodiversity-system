import test from "node:test";
import assert from "node:assert/strict";
import { newestVisitsFirst, plantsPerSpecies, visitIds, withoutVisits } from "./visits.ts";

const A = "aaaaaa00-0000-4000-8000-000000000001";
const B = "bbbbbb00-0000-4000-8000-000000000002";
const C = "cccccc00-0000-4000-8000-000000000003";
const D = "dddddd00-0000-4000-8000-000000000004";
const BELIAN = "eusideroxylon-zwageri";
const PITCHER = "nepenthes-ampullaria";

test("visitIds gives each record ID once", () => {
  assert.deepEqual(visitIds([{ id: A }, { id: B }, { id: A }]), [A, B]);
});

test("visitIds skips rows with no ID", () => {
  assert.deepEqual(visitIds([{ id: null }, {}, { id: "" }, { id: 5 }, { id: B }]), [B]);
});

test("visitIds is empty for no rows", () => {
  assert.deepEqual(visitIds(null), []);
  assert.deepEqual(visitIds(undefined), []);
  assert.deepEqual(visitIds([]), []);
});

test("newestVisitsFirst puts the newest visit first", () => {
  const older = { id: A, recordedAt: "2026-10-01T09:00:00" };
  const newer = { id: B, recordedAt: "2026-10-15T09:00:00" };
  assert.deepEqual(newestVisitsFirst([older, newer]), [newer, older]);
});

test("newestVisitsFirst sorts visits from the same moment by ID", () => {
  const one = { id: B, recordedAt: "2026-10-15T00:00:00" };
  const two = { id: A, recordedAt: "2026-10-15T00:00:00" };
  assert.deepEqual(newestVisitsFirst([one, two]), [two, one]);
});

test("newestVisitsFirst doesn't change the list it's given", () => {
  const list = [
    { id: A, recordedAt: "2026-10-01T09:00:00" },
    { id: B, recordedAt: "2026-10-15T09:00:00" },
  ];
  const copy = [...list];
  newestVisitsFirst(list);
  assert.deepEqual(list, copy);
});

test("withoutVisits leaves out the visits and keeps the order", () => {
  const records = [{ id: C }, { id: A }, { id: B }];
  assert.deepEqual(withoutVisits(records, new Set([A])), [{ id: C }, { id: B }]);
});

test("withoutVisits keeps everything when there are no visits", () => {
  const records = [{ id: A }, { id: B }];
  assert.deepEqual(withoutVisits(records, new Set()), records);
  assert.notEqual(withoutVisits(records, new Set()), records);
});

test("plantsPerSpecies counts a plant and its visits once", () => {
  const rows = [
    { id: A, species_slug: BELIAN },
    // B is a later visit to A
    { id: B, species_slug: BELIAN },
    { id: C, species_slug: BELIAN },
    { id: D, species_slug: PITCHER },
  ];
  assert.deepEqual(plantsPerSpecies(rows, new Set([B])), { [BELIAN]: 2, [PITCHER]: 1 });
  assert.deepEqual(plantsPerSpecies(rows, new Set()), { [BELIAN]: 3, [PITCHER]: 1 });
});

test("plantsPerSpecies skips plants with no species yet", () => {
  const rows = [
    { id: A, species_slug: null },
    { id: B, species_slug: "" },
    { id: C },
    { id: D, species_slug: BELIAN },
  ];
  assert.deepEqual(plantsPerSpecies(rows, new Set()), { [BELIAN]: 1 });
});

test("plantsPerSpecies gives no species for no rows", () => {
  assert.deepEqual(plantsPerSpecies([], new Set([A])), {});
});
