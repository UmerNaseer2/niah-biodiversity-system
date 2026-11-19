// Checks 030_spot_unless_threatened.sql: a plant shows its exact spot unless its species is VU, EN
// or CR, protected, rough area only, or not the plant's name. Data Deficient and Not Evaluated
// species that the old rule kept rough go back to showing their spot, and that shows in their
// history. roles.test.js, report-counts.test.js and species-rough.test.js check the rule on the
// full set of files as well.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { SQL_FILES, addUser, asUser, newDatabase, readSql, selectAs } from './harness.js';

const upTo029 = SQL_FILES.slice(0, SQL_FILES.indexOf('030_spot_unless_threatened.sql'));

const gps = { lat: 3.81391, lng: 113.77874, accuracyM: 5 };

// Each species from before 030, with what rough_area_only should be after it
const species = {
  dd: { iucn: 'DD', protected: false, rough: false, after: false },
  ne: { iucn: 'NE', protected: false, rough: false, after: false },
  ddProtected: { iucn: 'DD', protected: true, rough: false, after: true },
  vu: { iucn: 'VU', protected: false, rough: false, after: true },
  marked: { iucn: 'LC', protected: false, rough: true, after: true },
  plain: { iucn: 'LC', protected: false, rough: false, after: false },
};

let db;
let officer;
const records = {};
let publicBefore;
const roughBefore = {};

function nameOf(key) {
  return `Testus ${key.toLowerCase()}`;
}

async function stored(id) {
  const { rows } = await db.query('SELECT * FROM public.species WHERE id = $1', [id]);
  return rows[0];
}

async function historyOf(id) {
  const { rows } = await db.query(
    'SELECT changes FROM public.species_history WHERE species_id = $1 ORDER BY id',
    [id],
  );
  return rows.map((row) => row.changes);
}

/** Adds a published record straight to the table as the postgres user, like 002 does. */
async function addRecord(slug, { name = nameOf(slug), visitOf = null } = {}) {
  const { rows } = await db.query(
    `INSERT INTO public.records
       (species_slug, species_name, condition, gps, recorded_by, recorded_at, status, visit_of)
     VALUES ($1, $2, 'healthy', $3, 'Test botanist', '2031-06-01T02:03:04Z', 'published', $4)
     RETURNING id`,
    [slug, name, gps, visitOf],
  );
  return rows[0].id;
}

async function shownSpot(id) {
  const [row] = await selectAs(db, null, 'SELECT gps FROM public.records_public WHERE id = $1', [
    id,
  ]);
  return row.gps;
}

before(async () => {
  db = await newDatabase(upTo029);
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
  for (const [key, row] of Object.entries(species)) {
    await db.query(
      `INSERT INTO public.species
         (id, scientific_name, family, common_names, iucn_code, sarawak_protected,
          rough_area_only, summary)
       VALUES ($1, $2, 'Testaceae', '{Test plant}', $3, $4, $5, 'A plant for the tests.')`,
      [key, nameOf(key), row.iucn, row.protected, row.rough],
    );
  }
  for (const key of Object.keys(species)) records[key] = await addRecord(key);
  // A visit named as a common species, to a Data Deficient plant
  records.visit = await addRecord('plain', { visitOf: records.dd });
  // A Data Deficient plant whose name isn't its species' name
  records.misnamed = await addRecord('dd', { name: 'Testus something else' });
  // A plant with no species
  records.unmatched = await addRecord(null, { name: 'Unknown fern' });

  const { rows } = await db.query('SELECT id, gps FROM public.records_public ORDER BY id');
  publicBefore = rows;
  for (const key of Object.keys(species)) roughBefore[key] = (await stored(key)).rough_area_only;
  await db.exec(readSql('030_spot_unless_threatened.sql'));
});

after(async () => {
  await db.close();
});

describe('before 030', () => {
  test('the old trigger kept Data Deficient and Not Evaluated species rough', async () => {
    assert.equal(roughBefore.dd, true);
    assert.equal(roughBefore.ne, true);
    assert.equal(roughBefore.plain, false);
    const shown = Object.fromEntries(publicBefore.map((row) => [row.id, row.gps]));
    assert.equal(shown[records.dd].accuracyM, 440);
    assert.equal(shown[records.ne].accuracyM, 440);
    assert.equal(shown[records.plain].accuracyM, 5);
  });
});

describe('running 030', () => {
  test('only unprotected DD and NE species stop being rough area only', async () => {
    for (const [key, row] of Object.entries(species)) {
      assert.equal((await stored(key)).rough_area_only, row.after, key);
    }
  });

  test('the change shows in their history, and nothing else gets a line', async () => {
    for (const key of ['dd', 'ne']) {
      assert.deepEqual(await historyOf(key), [{ rough_area_only: { from: true, to: false } }], key);
    }
    for (const key of ['ddProtected', 'vu', 'marked', 'plain']) {
      assert.deepEqual(await historyOf(key), [], key);
    }
  });

  test('the public sees the exact spot and time of a DD or NE plant now', async () => {
    for (const key of ['dd', 'ne', 'plain']) {
      assert.deepEqual(await shownSpot(records[key]), gps, key);
    }
    const [row] = await selectAs(
      db,
      null,
      'SELECT recorded_at FROM public.records_public WHERE id = $1',
      [records.dd],
    );
    assert.equal(row.recorded_at.toISOString(), '2031-06-01T02:03:04.000Z');
  });

  test('a visit to a DD plant shows its spot too, since the first record does', async () => {
    assert.deepEqual(await shownSpot(records.visit), gps);
  });

  test('threatened, protected, marked, misnamed and unmatched plants stay rough', async () => {
    for (const key of ['ddProtected', 'vu', 'marked', 'misnamed', 'unmatched']) {
      assert.equal((await shownSpot(records[key])).accuracyM, 440, key);
    }
  });

  test('the Reports page counts follow the same rule', async () => {
    const [row] = await selectAs(db, officer, 'SELECT public.report_counts() AS counts');
    const { rows } = await db.query(
      "SELECT count(*)::int AS count FROM public.records_public WHERE gps ->> 'accuracyM' = '440'",
    );
    assert.equal(row.counts.hidden_spots, rows[0].count);
  });

  test('running it again changes nothing', async () => {
    const { rows: speciesBefore } = await db.query('SELECT * FROM public.species ORDER BY id');
    const { rows: historyBefore } = await db.query('SELECT * FROM public.species_history');
    await db.exec(readSql('030_spot_unless_threatened.sql'));
    assert.deepEqual((await db.query('SELECT * FROM public.species ORDER BY id')).rows, speciesBefore);
    assert.deepEqual((await db.query('SELECT * FROM public.species_history')).rows, historyBefore);
  });
});

describe('the species trigger after 030', () => {
  function save(id, set) {
    return asUser(db, officer, (tx) => tx.query(`UPDATE public.species SET ${set} WHERE id = $1`, [id]));
  }

  test('an officer can turn rough area only on and off for a DD species', async () => {
    await save('dd', 'rough_area_only = true');
    assert.equal((await stored('dd')).rough_area_only, true);
    await save('dd', 'rough_area_only = false');
    assert.equal((await stored('dd')).rough_area_only, false);
  });

  test('a species that becomes threatened or protected is forced rough again', async () => {
    await save('ne', "iucn_code = 'CR'");
    assert.equal((await stored('ne')).rough_area_only, true);
    await save('plain', 'sarawak_protected = true');
    assert.equal((await stored('plain')).rough_area_only, true);
  });
});

test("030 stops and changes nothing if 029 hasn't been run", async () => {
  const before029 = await newDatabase(SQL_FILES.slice(0, SQL_FILES.indexOf('029_find_plant_by_tag.sql')));
  try {
    await assert.rejects(
      before029.exec(readSql('030_spot_unless_threatened.sql')),
      /030 needs 029/,
    );
    const { rows } = await before029.query(
      "SELECT prosrc FROM pg_proc WHERE proname = 'keep_species_rough'",
    );
    assert.match(rows[0].prosrc, /'LC', 'NT'/);
  } finally {
    await before029.close();
  }
});
