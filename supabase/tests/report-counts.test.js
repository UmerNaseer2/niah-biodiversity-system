// Checks 012_report_counts.sql: the counts on the Reports page. That they follow the same rules as
// the page and its CSV (web/src/lib/reports.ts), that days are park days, and that only officers
// and admins get anything back.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { addUser, newDatabase, readSql, selectAs, SQL_FILES } from './harness.js';

let db;
let botanist;
let researcher;
let visitor;
let officer;
let admin;

// Test species, one for each way a species can be shown or hidden
const species = [
  { id: 'testus-least', iucn_code: 'LC' },
  { id: 'testus-vulnerable', iucn_code: 'VU' },
  { id: 'testus-protected', iucn_code: 'LC', sarawak_protected: true },
  { id: 'testus-rough', iucn_code: 'NT', rough_area_only: true },
  { id: 'testus-unknown', iucn_code: 'DD' },
];

const gps = { lat: 3.81391, lng: 113.77874, accuracyM: 5 };

// Records in March and April 2031, far from the sample records, with times in UTC
const records = [
  { species: 'testus-least', at: '2031-03-10T02:00:00Z' },
  { species: 'testus-vulnerable', condition: 'damaged', at: '2031-03-11T03:00:00Z' },
  { species: 'testus-protected', gps: null, at: '2031-03-12T04:00:00Z' },
  { species: 'testus-rough', at: '2031-03-15T05:00:00Z' },
  { species: null, condition: 'diseased', at: '2031-03-20T09:15:00Z' },
  { species: 'testus-unknown', condition: 'dead', status: 'waiting', at: '2031-04-02T01:00:00Z' },
  { species: 'testus-vulnerable', status: 'rejected', at: '2031-03-13T01:00:00Z' },
];

const spring = { from_day: '2031-03-01', to_day: '2031-04-30' };

const nothing = {
  total: 0,
  waiting: 0,
  species_count: 0,
  not_matched: 0,
  threatened: 0,
  needs_care: 0,
  hidden_spots: 0,
  first: null,
  last: null,
  by_iucn: {},
  by_condition: {},
  by_species: {},
  by_month: {},
};

/** Adds a record straight to the table as the postgres user, the way 002 adds the samples. */
async function addRecord({
  species: slug,
  condition = 'healthy',
  status = 'published',
  at,
  ...rest
}) {
  await db.query(
    `INSERT INTO public.records
       (species_slug, species_name, condition, gps, recorded_by, recorded_at, status)
     VALUES ($1, $2, $3, $4, 'Test botanist', $5, $6)`,
    [slug, slug ?? 'Unknown fern', condition, 'gps' in rest ? rest.gps : gps, at, status],
  );
}

/** Calls report_counts as a user with only the arguments given, like supabase.rpc() does. */
async function countsFor(user, args = {}) {
  const names = Object.keys(args);
  const list = names.map((name, i) => `${name} => $${i + 1}`).join(', ');
  const [row] = await selectAs(
    db,
    user,
    `SELECT public.report_counts(${list}) AS counts`,
    Object.values(args),
  );
  return row.counts;
}

before(async () => {
  db = await newDatabase();
  botanist = await addUser(db, { role: 'botanist' });
  researcher = await addUser(db, { role: 'researcher' });
  visitor = await addUser(db);
  officer = await addUser(db, { role: 'conservation_officer' });
  admin = await addUser(db, { role: 'admin' });

  for (const row of species) {
    await db.query(
      `INSERT INTO public.species
         (id, slug, scientific_name, family, common_names, iucn_code, sarawak_protected,
          rough_area_only)
       VALUES ($1, $1, $1, 'Testaceae', '{Test plant}', $2, $3, $4)`,
      [row.id, row.iucn_code, row.sarawak_protected ?? false, row.rough_area_only ?? false],
    );
  }
  for (const row of records) await addRecord(row);
});

after(async () => {
  await db.close();
});

describe('report counts', () => {
  test('officers and admins get the published records the Reports page shows', async () => {
    for (const user of [officer, admin]) {
      assert.deepEqual(await countsFor(user, spring), {
        total: 5,
        waiting: 0,
        species_count: 4,
        not_matched: 1,
        // The Vulnerable one and the one protected in Sarawak
        threatened: 2,
        needs_care: 2,
        // The protected one has no GPS point, so its row says No GPS point instead
        hidden_spots: 3,
        // Park time, 8 hours ahead of UTC
        first: '2031-03-10T10:00',
        last: '2031-03-20T17:15',
        by_iucn: { LC: 2, VU: 1, NT: 1, none: 1 },
        by_condition: { healthy: 3, damaged: 1, diseased: 1 },
        by_species: {
          'testus-least': 1,
          'testus-vulnerable': 1,
          'testus-protected': 1,
          'testus-rough': 1,
          none: 1,
        },
        by_month: { '2031-03': { healthy: 3, damaged: 1, diseased: 1 } },
      });
    }
  });

  test('scope all counts records waiting for review too, but never rejected ones', async () => {
    const counts = await countsFor(officer, { scope: 'all', ...spring });
    assert.equal(counts.total, 6);
    assert.equal(counts.waiting, 1);
    assert.equal(counts.species_count, 5);
    assert.equal(counts.needs_care, 3);
    assert.equal(counts.hidden_spots, 4);
    assert.equal(counts.last, '2031-04-02T09:00');
    assert.deepEqual(counts.by_iucn, { LC: 2, VU: 1, NT: 1, DD: 1, none: 1 });
    assert.deepEqual(counts.by_month['2031-04'], { dead: 1 });
    // The rejected Vulnerable record would make it 2
    assert.equal(counts.by_species['testus-vulnerable'], 1);

    // Any other scope counts published records only, like the website's filters
    assert.equal((await countsFor(officer, { scope: 'everything', ...spring })).total, 5);
  });

  test('days are park days, so a record late at night lands on the day it was made', async () => {
    // 23:30 on 1 May in the park, then 00:30 on 2 May, then 00:30 on 1 June
    for (const at of ['2031-05-01T15:30:00Z', '2031-05-01T16:30:00Z', '2031-05-31T16:30:00Z']) {
      await addRecord({ species: 'testus-least', at });
    }
    const first = await countsFor(officer, { from_day: '2031-05-01', to_day: '2031-05-01' });
    assert.equal(first.total, 1);
    assert.equal(first.first, '2031-05-01T23:30');
    const second = await countsFor(officer, { from_day: '2031-05-02', to_day: '2031-05-02' });
    assert.equal(second.total, 1);
    assert.equal(second.first, '2031-05-02T00:30');

    const months = await countsFor(officer, { from_day: '2031-05-01' });
    assert.deepEqual(months.by_month, { '2031-05': { healthy: 2 }, '2031-06': { healthy: 1 } });
  });

  test('either day can be left out, and days the wrong way round count nothing', async () => {
    const all = await countsFor(officer, { scope: 'all' });
    const upTo = await countsFor(officer, { scope: 'all', to_day: '2031-04-30' });
    const from = await countsFor(officer, { scope: 'all', from_day: '2031-05-01' });
    assert.equal(upTo.total + from.total, all.total);
    assert.equal(from.total, 3);
    // The website swaps them before it asks, so this only happens if someone calls it themselves
    assert.deepEqual(
      await countsFor(officer, { from_day: '2031-04-30', to_day: '2031-03-01' }),
      nothing,
    );
  });

  test('botanists, researchers and visitors get zeros, because the staff views give them nothing', async () => {
    for (const user of [botanist, researcher, visitor]) {
      assert.deepEqual(await countsFor(user, { scope: 'all' }), nothing, user.role);
    }
  });

  test("people who aren't signed in can't call it", async () => {
    await assert.rejects(countsFor(null), {
      code: '42501',
      message: /permission denied for function report_counts/,
    });
  });

  test('running 012 again keeps it working', async () => {
    await db.exec(readSql('012_report_counts.sql'));
    assert.equal((await countsFor(officer, spring)).total, 5);
    await assert.rejects(countsFor(null), { code: '42501' });
  });

  test("012 stops and changes nothing if 011 hasn't been run", async () => {
    const without011 = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('011_exact_location_downloads.sql')),
    );
    try {
      await assert.rejects(without011.exec(readSql('012_report_counts.sql')), {
        message: /012 needs 011_exact_location_downloads\.sql to be run first/,
      });
      const { rows } = await without011.query(
        "SELECT to_regprocedure('public.report_counts(text, date, date)') AS made",
      );
      assert.deepEqual(rows, [{ made: null }]);
    } finally {
      await without011.close();
    }
  });
});
