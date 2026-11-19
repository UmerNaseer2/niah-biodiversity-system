import test from "node:test";
import assert from "node:assert/strict";
import { aiCheckFromRow, aiCheckPending, REQUEST_MESSAGE, STUCK_MS } from "./ai-check.ts";

const NOW = Date.parse("2026-11-19T10:00:00Z");
const fmt = (iso) => `at ${iso}`;
const BELIAN = { speciesName: "Eusideroxylon zwageri", commonName: "Belian" };

function row(extra) {
  return {
    record_id: "aaaaaa00-0000-4000-8000-000000000001",
    status: "done",
    verdict: "consistent",
    names_match: "yes",
    photo_shows_plant: "yes",
    photo_matches_name: "yes",
    note: "  The bark and leaves fit Belian.  ",
    problem: null,
    photos_checked: 2,
    checked_species_name: "Eusideroxylon zwageri",
    checked_common_name: "Belian",
    requested_at: "2026-11-19T09:59:00Z",
    checked_at: "2026-11-19T09:59:20Z",
    ...extra,
  };
}

test("a finished check gives its verdict, answers and note", () => {
  const check = aiCheckFromRow(row(), BELIAN, NOW, fmt);
  assert.deepEqual(check, {
    status: "done",
    verdict: "consistent",
    namesMatch: "yes",
    photoShowsPlant: "yes",
    photoMatchesName: "yes",
    note: "The bark and leaves fit Belian.",
    problem: null,
    photosChecked: 2,
    namesChanged: false,
    stuck: false,
    checkedAt: "at 2026-11-19T09:59:20Z",
  });
  assert.equal(aiCheckPending(check), false);
});

test("no row means not checked yet", () => {
  const check = aiCheckFromRow(undefined, BELIAN, NOW, fmt);
  assert.equal(check.status, "not_checked");
  assert.equal(check.verdict, null);
  assert.equal(check.checkedAt, null);
  assert.equal(aiCheckPending(check), false);
});

test("an unknown status counts as not checked", () => {
  assert.equal(aiCheckFromRow(row({ status: "odd" }), BELIAN, NOW, fmt).status, "not_checked");
});

test("changing either name after the check says so", () => {
  const renamed = aiCheckFromRow(row(), { ...BELIAN, speciesName: "Shorea leprosula" }, NOW, fmt);
  assert.equal(renamed.namesChanged, true);
  const newCommon = aiCheckFromRow(row(), { ...BELIAN, commonName: "Ironwood" }, NOW, fmt);
  assert.equal(newCommon.namesChanged, true);
  const dropped = aiCheckFromRow(row(), { ...BELIAN, commonName: null }, NOW, fmt);
  assert.equal(dropped.namesChanged, true);
  const added = aiCheckFromRow(row({ checked_common_name: null }), BELIAN, NOW, fmt);
  assert.equal(added.namesChanged, true);
});

test("spaces and a shortened long name still count as the same names", () => {
  const spaced = { speciesName: "  Eusideroxylon   zwageri ", commonName: "Belian " };
  assert.equal(aiCheckFromRow(row(), spaced, NOW, fmt).namesChanged, false);
  const blank = aiCheckFromRow(row({ checked_common_name: null }), { ...BELIAN, commonName: "  " }, NOW, fmt);
  assert.equal(blank.namesChanged, false);

  const long = `${"word ".repeat(60)}end`;
  const shortened = `${"word ".repeat(38)}word...`;
  assert.equal(shortened.length <= 200, true);
  const check = aiCheckFromRow(
    row({ checked_species_name: shortened }),
    { ...BELIAN, speciesName: long },
    NOW,
    fmt,
  );
  assert.equal(check.namesChanged, false);
});

test("a check being sent is pending until it's been too long", () => {
  const fresh = aiCheckFromRow(
    row({ status: "checking", verdict: null, requested_at: new Date(NOW - 30000).toISOString() }),
    BELIAN,
    NOW,
    fmt,
  );
  assert.equal(fresh.status, "checking");
  assert.equal(fresh.stuck, false);
  assert.equal(fresh.verdict, null);
  assert.equal(fresh.note, null);
  assert.equal(fresh.namesChanged, false);
  assert.equal(aiCheckPending(fresh), true);

  const old = aiCheckFromRow(
    row({ status: "checking", verdict: null, requested_at: new Date(NOW - STUCK_MS - 1).toISOString() }),
    BELIAN,
    NOW,
    fmt,
  );
  assert.equal(old.stuck, true);
  assert.equal(aiCheckPending(old), false);

  const noTime = aiCheckFromRow(row({ status: "checking", verdict: null, requested_at: null }), BELIAN, NOW, fmt);
  assert.equal(noTime.stuck, true);
});

test("waiting for photos is pending", () => {
  const check = aiCheckFromRow(
    row({ status: "waiting_for_photos", verdict: null, requested_at: null, checked_at: null }),
    BELIAN,
    NOW,
    fmt,
  );
  assert.equal(check.status, "waiting_for_photos");
  assert.equal(aiCheckPending(check), true);
  assert.equal(aiCheckPending(null), false);
});

test("a failed check gives its problem and no answers", () => {
  const check = aiCheckFromRow(
    row({ status: "failed", verdict: null, problem: "Gemini is busy right now." }),
    BELIAN,
    NOW,
    fmt,
  );
  assert.equal(check.status, "failed");
  assert.equal(check.problem, "Gemini is busy right now.");
  assert.equal(check.namesMatch, null);
  assert.equal(check.note, null);
  assert.equal(check.photosChecked, 0);
  assert.equal(check.checkedAt, "at 2026-11-19T09:59:20Z");
});

test("bad values from the row are left out", () => {
  const check = aiCheckFromRow(
    row({ names_match: "maybe", photos_checked: "2", note: "   ", checked_at: "not a date" }),
    BELIAN,
    NOW,
    fmt,
  );
  assert.equal(check.namesMatch, null);
  assert.equal(check.photosChecked, 0);
  assert.equal(check.note, null);
  assert.equal(check.checkedAt, null);
});

test("every answer from request_ai_check has a message", () => {
  for (const code of ["checking", "already_checking", "too_soon", "not_waiting", "not_found", "not_set_up"]) {
    assert.ok(code in REQUEST_MESSAGE, code);
  }
  assert.equal(REQUEST_MESSAGE.checking, null);
});
