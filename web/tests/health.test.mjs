import test from "node:test";
import assert from "node:assert/strict";
import { databaseState } from "../src/lib/health.ts";

test("the database is ok when the read worked", () => {
  assert.equal(databaseState(true, null), "ok");
  assert.equal(databaseState(true, undefined), "ok");
});

test("a missing view or column means the SQL is behind, not down", () => {
  assert.equal(databaseState(true, { code: "PGRST205" }), "behind");
  assert.equal(databaseState(true, { code: "42703" }), "behind");
});

test("anything else that went wrong counts as down", () => {
  assert.equal(databaseState(true, { code: "" }), "down");
  assert.equal(databaseState(true, { code: "no answer" }), "down");
  assert.equal(databaseState(true, { code: "57014" }), "down");
});

test("a site with no Supabase settings isn't set up, even with no error", () => {
  assert.equal(databaseState(false, null), "not set up");
});
