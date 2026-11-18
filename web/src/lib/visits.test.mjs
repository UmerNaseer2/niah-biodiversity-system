import test from "node:test";
import assert from "node:assert/strict";
import { newestVisitsFirst, visitIds } from "./visits.ts";

const A = "aaaaaa00-0000-4000-8000-000000000001";
const B = "bbbbbb00-0000-4000-8000-000000000002";

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
