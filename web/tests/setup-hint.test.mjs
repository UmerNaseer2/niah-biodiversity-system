import test from "node:test";
import assert from "node:assert/strict";
import {
  NOT_SET_UP,
  SENSOR_FILES,
  ifItKeepsHappening,
  notSetUp,
  whatToRun,
} from "../src/lib/setup-hint.ts";

const FILE_NAME = /\.sql|README/;

test("staff get plain wording with no file names", () => {
  for (const role of ["officer", "botanist", "researcher", null, undefined]) {
    assert.equal(notSetUp(role, ["007_species_fixes.sql"]), NOT_SET_UP);
    assert.doesNotMatch(notSetUp(role, SENSOR_FILES), FILE_NAME);
    assert.equal(ifItKeepsHappening(role, ["013_edit_history.sql"]), "ask an administrator.");
    assert.doesNotMatch(ifItKeepsHappening(role), FILE_NAME);
  }
});

test("administrators are told which file to run", () => {
  assert.equal(
    notSetUp("admin", ["007_species_fixes.sql"]),
    "This part of the database isn’t set up yet. Run 007_species_fixes.sql on this database, as supabase/README.md says.",
  );
  assert.match(notSetUp("admin", SENSOR_FILES), /Run 016_1 to 027 on this database/);
  assert.equal(
    ifItKeepsHappening("admin", ["013_edit_history.sql"]),
    "check 013_edit_history.sql has been run on this database, as supabase/README.md says.",
  );
});

test("with no file named, administrators are pointed at the whole README", () => {
  assert.equal(
    ifItKeepsHappening("admin"),
    "check every file in supabase/README.md has been run on this database.",
  );
  assert.equal(whatToRun(), "Check every file in supabase/README.md has been run on this database.");
});

test("several files are listed with commas and and", () => {
  assert.equal(
    whatToRun(["a.sql", "b.sql", "c.sql"]),
    "Run a.sql, b.sql and c.sql on this database, as supabase/README.md says.",
  );
  assert.equal(whatToRun(["a.sql", "b.sql"]), "Run a.sql and b.sql on this database, as supabase/README.md says.");
});
