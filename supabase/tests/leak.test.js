// The API half of leak-check.js: adds made up hidden plants to the stand-in, reads everything the
// anon key can read and checks none of their exact spots comes back. The website half needs the
// website running, so it's run by hand (see leak-check.js).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { HIDDEN_RECORDS, addHiddenPlants, checkApi, spotPatterns, spotsIn, tagOf } from './leak-check.js';
import { startStandIn } from './stand-in.js';

let standIn;

before(async () => {
  standIn = await startStandIn({ port: 0, log: () => {}, sensorData: false });
  await addHiddenPlants(standIn.db);
});

after(async () => {
  await standIn?.close();
});

test('the patterns find a point written the ways a page could write it', () => {
  const [first] = HIDDEN_RECORDS;
  assert.deepEqual(spotsIn(`at ${first.gps.lat.toFixed(5)}° N`)[0].record, tagOf(first.id));
  assert.equal(spotsIn(`{"lng":${first.gps.lng}}`).length, 1);
  // The rough area the public gets is never one of them
  for (const r of HIDDEN_RECORDS) {
    const rough = (n) => String(Math.round((Math.floor(n / 0.004) + 0.5) * 0.004 * 1000) / 1000);
    const text = `${rough(r.gps.lat)} ${rough(r.gps.lng)}`;
    assert.deepEqual(spotPatterns(r.gps).filter((p) => text.includes(p)), [], text);
  }
});

test('the hidden plants are in the database with their exact spots', async () => {
  const { rows } = await standIn.db.query(
    'SELECT count(*)::int AS n FROM public.records WHERE id = ANY($1::uuid[])',
    [HIDDEN_RECORDS.map((r) => r.id)],
  );
  assert.equal(rows[0].n, HIDDEN_RECORDS.length);
});

test('nothing a signed out person can read through the API has an exact spot', async () => {
  const lines = await checkApi(standIn.url, standIn.db);
  assert.ok(lines.length > 20, `only ${lines.length} reads`);
  // records_public is readable and has the published hidden plants, rough area only
  const view = lines.find((l) => l.what === 'table records_public');
  assert.equal(view.status, 200);
  const leaks = lines.filter((l) => l.spots.length > 0);
  assert.deepEqual(leaks, []);
});
