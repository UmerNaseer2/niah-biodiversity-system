// Checks the made up data the stand-in adds for the load test (load-data.js), with a small amount
// so it runs quickly. The page times in docs/test-results/item-37-performance.md only mean
// something if the data looks like a real park's: mostly published records with some waiting and
// rejected, every one with its own tag code, and old readings that don't fill up 022's hourly limit.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ANON_KEY, startStandIn, TEST_DEVICE_ID } from './stand-in.js';

const RECORDS = 300;
const READING_DAYS = 1;
// The stand-in's own day of readings uses boot IDs from a billion up and load-data.js uses small
// ones, so this tells them apart. Going by time doesn't work, because the stand-in's first reading
// turns a day old while the tests run.
const STAND_IN_BOOTS = 1_000_000_000;

let standIn;
let db;

before(async () => {
  standIn = await startStandIn({
    port: 0,
    log: () => {},
    loadRecords: RECORDS,
    loadReadingDays: READING_DAYS,
  });
  db = standIn.db;
});

after(() => standIn.close());

describe('load test records', () => {
  test('adds the records with a mix of statuses, like a real park', async () => {
    const { rows } = await db.query(
      `SELECT status, count(*)::int AS n FROM public.records
       WHERE recorded_by = 'Load test' GROUP BY status ORDER BY status`,
    );
    // Every 25th is waiting and every 40th (from the first) is rejected. None is both up to 300.
    assert.deepEqual(rows, [
      { status: 'published', n: 280 },
      { status: 'rejected', n: 8 },
      { status: 'waiting', n: 12 },
    ]);
  });

  test('gives every record its own tag code, so the server takes them all', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n, count(DISTINCT tag_code)::int AS codes,
         min(tag_code) AS first, max(tag_code) AS last
       FROM public.records WHERE recorded_by = 'Load test'`,
    );
    assert.deepEqual(rows[0], { n: RECORDS, codes: RECORDS, first: 'NNP-A00001', last: 'NNP-A0012C' });
  });

  test('leaves every 13th without a species and spreads the rest over the species', async () => {
    const { rows } = await db.query(
      `SELECT count(*) FILTER (WHERE species_slug IS NULL)::int AS no_species,
         count(DISTINCT species_slug)::int AS species,
         (SELECT count(*)::int FROM public.species) AS all_species
       FROM public.records WHERE recorded_by = 'Load test'`,
    );
    assert.equal(rows[0].no_species, Math.floor(RECORDS / 13));
    assert.equal(rows[0].species, rows[0].all_species);
  });

  test('puts every record at a spot near park HQ, within the last year', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM public.records
       WHERE recorded_by = 'Load test'
         AND (gps->>'lat')::numeric BETWEEN 3.805 AND 3.83
         AND (gps->>'lng')::numeric BETWEEN 113.765 AND 113.795
         AND recorded_at BETWEEN now() - interval '366 days' AND now()`,
    );
    assert.equal(rows[0].n, RECORDS);
  });

  test('shows visitors only the published ones', async () => {
    const response = await fetch(
      `${standIn.url}/rest/v1/records_public?select=status&tag_code=like.NNP-A*`,
      { headers: { apikey: ANON_KEY } },
    );
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.equal(rows.length, 280);
    assert.ok(rows.every((row) => row.status === 'published'));
  });
});

describe('load test readings', () => {
  test('adds a reading a minute from every node, all from before the last day', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n, count(DISTINCT node_id)::int AS nodes,
         bool_and(recorded_at < now() - interval '1 day') AS all_old
       FROM public.iot_readings
       WHERE device_id = $1 AND boot_id < $2`,
      [TEST_DEVICE_ID, STAND_IN_BOOTS],
    );
    const nodes = await db.query('SELECT count(*)::int AS n FROM public.iot_nodes');
    assert.equal(rows[0].nodes, nodes.rows[0].n);
    assert.equal(rows[0].n, nodes.rows[0].n * READING_DAYS * 1440);
    assert.equal(rows[0].all_old, true);
  });

  test("doesn't count toward the device's hourly limit from 022", async () => {
    // 022 counts readings by when they were stored. The load test's are stored with the time they
    // were taken, so an edge device can still send its own readings straight after.
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM public.iot_readings
       WHERE device_id = $1 AND boot_id < $2
         AND inserted_at > now() - interval '1 hour'`,
      [TEST_DEVICE_ID, STAND_IN_BOOTS],
    );
    assert.equal(rows[0].n, 0);
  });
});
