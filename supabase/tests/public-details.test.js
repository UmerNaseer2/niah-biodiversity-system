// Checks 019_public_record_details.sql: what records_public gives away about a plant whose spot is
// hidden, a record whose name doesn't match its species, and that the Reports page counts follow
// the same rule.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { addUser, newDatabase, readSql, selectAs, SQL_FILES } from './harness.js';

let db;
let officer;

// Made up points. Nothing here is a real plant.
const gps = { lat: 2.12345, lng: 112.54321, accuracyM: 5 };

const exactId = 'd1000000-0000-4000-8000-000000000001';
const hiddenId = 'd2000000-0000-4000-8000-000000000002';
const lateId = 'd3000000-0000-4000-8000-000000000003';

/** Adds a published record straight to the table as the postgres user, and gives back its ID. */
async function addRecord({ id, slug, name, at = '2031-03-10T02:03:04Z', status = 'published' }) {
  const { rows } = await db.query(
    `INSERT INTO public.records
       (id, species_slug, species_name, condition, gps, recorded_by, recorded_at, status)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, 'healthy', $4, 'Test botanist', $5, $6)
     RETURNING id`,
    [id ?? null, slug, name, gps, at, status],
  );
  return rows[0].id;
}

async function publicRow(id) {
  const rows = await selectAs(
    db,
    null,
    'SELECT gps, recorded_at FROM public.records_public WHERE id = $1',
    [id],
  );
  return rows[0];
}

const isExact = (row) => row.gps.lat === gps.lat && row.gps.lng === gps.lng;

before(async () => {
  db = await newDatabase();
  officer = await addUser(db, { role: 'conservation_officer' });
  for (const [id, code] of [
    ['testus-common', 'LC'],
    ['testus-rare', 'VU'],
  ]) {
    await db.query(
      `INSERT INTO public.species (id, slug, scientific_name, family, common_names, iucn_code)
       VALUES ($1, $1, $2, 'Testaceae', '{Test plant}', $3)`,
      [id, `Testus ${id.slice('testus-'.length)}`, code],
    );
  }
  await addRecord({ id: exactId, slug: 'testus-common', name: 'Testus common' });
  await addRecord({ id: hiddenId, slug: 'testus-rare', name: 'Testus rare' });
  // 00:30 on 11 March in the park, which is still 10 March in UTC
  await addRecord({
    id: lateId,
    slug: 'testus-rare',
    name: 'Testus rare',
    at: '2031-03-10T16:30:00Z',
  });
});

after(async () => {
  await db.close();
});

describe('a hidden plant in records_public', () => {
  test('a plant that shows its spot keeps its full time', async () => {
    const row = await publicRow(exactId);
    assert.ok(isExact(row));
    assert.equal(row.recorded_at.toISOString(), '2031-03-10T02:03:04.000Z');
  });

  test('a hidden plant only gets the day, in park time', async () => {
    const row = await publicRow(hiddenId);
    assert.equal(isExact(row), false);
    // Midnight at the start of 10 March in the park
    assert.equal(row.recorded_at.toISOString(), '2031-03-09T16:00:00.000Z');
  });

  test('a day is a park day, not a UTC day', async () => {
    const row = await publicRow(lateId);
    assert.equal(row.recorded_at.toISOString(), '2031-03-10T16:00:00.000Z');
  });

  test('a plant with no species only gets the day too', async () => {
    const id = await addRecord({ slug: null, name: 'Unknown fern' });
    const row = await publicRow(id);
    assert.equal(isExact(row), false);
    assert.equal(row.recorded_at.toISOString(), '2031-03-09T16:00:00.000Z');
  });

  test('sorting by time no longer puts a hidden plant between its neighbours', async () => {
    const first = await addRecord({
      slug: 'testus-common',
      name: 'Testus common',
      at: '2031-05-01T02:00:00Z',
    });
    const hidden = await addRecord({
      slug: 'testus-rare',
      name: 'Testus rare',
      at: '2031-05-01T02:03:00Z',
    });
    const last = await addRecord({
      slug: 'testus-common',
      name: 'Testus common',
      at: '2031-05-01T02:06:00Z',
    });
    const rows = await selectAs(
      db,
      null,
      `SELECT id FROM public.records_public
       WHERE id = ANY($1::uuid[])
       ORDER BY recorded_at, id`,
      [[first, hidden, last]],
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      [hidden, first, last],
    );
  });

  test('a read with no order comes back by ID, not in the order rows were saved', async () => {
    const rows = await selectAs(db, null, 'SELECT id FROM public.records_public');
    const ids = rows.map((row) => row.id);
    assert.ok(ids.length > 3);
    assert.deepEqual(ids, [...ids].sort());
  });

  test('the view keeps its columns, in the same order', async () => {
    const { rows } = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'records_public'
       ORDER BY ordinal_position`,
    );
    assert.deepEqual(
      rows.map((row) => row.column_name),
      [
        'id',
        'tag_code',
        'species_slug',
        'species_name',
        'common_name',
        'height_m',
        'condition',
        'photo_count',
        'recorded_at',
        'status',
        'gps',
      ],
    );
  });

  test('anyone can still read it, and staff still get the full time', async () => {
    const [mine] = await selectAs(
      db,
      officer,
      'SELECT recorded_at, gps FROM public.records_staff WHERE id = $1',
      [hiddenId],
    );
    assert.equal(mine.recorded_at.toISOString(), '2031-03-10T02:03:04.000Z');
    assert.ok(isExact(mine));
  });
});

describe('a name that disagrees with the species', () => {
  test('a different name stays hidden, and only gets the day', async () => {
    const id = await addRecord({ slug: 'testus-common', name: 'Testus rare' });
    const row = await publicRow(id);
    assert.equal(isExact(row), false);
    assert.equal(row.gps.accuracyM, 440);
    assert.equal(row.recorded_at.toISOString(), '2031-03-09T16:00:00.000Z');
  });

  test('capitals and extra spaces still count as the same name', async () => {
    const id = await addRecord({ slug: 'testus-common', name: '  TESTUS   common ' });
    const row = await publicRow(id);
    assert.ok(isExact(row));
    assert.equal(row.recorded_at.toISOString(), '2031-03-10T02:03:04.000Z');
  });

  test('renaming a species hides its records until they are corrected', async () => {
    await db.query(
      `INSERT INTO public.species (id, slug, scientific_name, family, common_names, iucn_code)
       VALUES ('testus-moved', 'testus-moved', 'Testus moved', 'Testaceae', '{Test plant}', 'LC')`,
    );
    const id = await addRecord({ slug: 'testus-moved', name: 'Testus moved' });
    assert.ok(isExact(await publicRow(id)));
    await db.query(
      "UPDATE public.species SET scientific_name = 'Testus newer' WHERE id = 'testus-moved'",
    );
    assert.equal(isExact(await publicRow(id)), false);
  });

  test('the Reports page counts it as hidden as well', async () => {
    const counted = async () => {
      const [row] = await selectAs(
        db,
        officer,
        `SELECT public.report_counts(from_day => '2031-07-01', to_day => '2031-07-31') AS counts`,
      );
      return row.counts;
    };
    const at = '2031-07-01T02:00:00Z';
    await addRecord({ slug: 'testus-common', name: 'Testus common', at });
    assert.equal((await counted()).total, 1);
    assert.equal((await counted()).hidden_spots, 0);
    await addRecord({ slug: 'testus-common', name: 'Testus rare', at });
    assert.equal((await counted()).total, 2);
    assert.equal((await counted()).hidden_spots, 1);
  });
});

describe('running 019', () => {
  test('running 019 again keeps it working', async () => {
    await db.exec(readSql('019_public_record_details.sql'));
    assert.equal((await publicRow(hiddenId)).recorded_at.toISOString(), '2031-03-09T16:00:00.000Z');
    await assert.rejects(selectAs(db, null, 'SELECT public.report_counts()'), { code: '42501' });
  });

  test("019 stops and changes nothing if 017 hasn't been run", async () => {
    const without017 = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('017_iot_alerts.sql')),
    );
    try {
      await assert.rejects(without017.exec(readSql('019_public_record_details.sql')), {
        message: /019 needs 017_iot_alerts\.sql to be run first/,
      });
      const { rows } = await without017.query(
        `SELECT pg_get_viewdef('public.records_public'::regclass) AS definition`,
      );
      assert.doesNotMatch(rows[0].definition, /exact/);
    } finally {
      await without017.close();
    }
  });
});
