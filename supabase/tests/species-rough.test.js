// Checks 015_species_rough_area.sql: every threatened or protected species is rough area only,
// whichever way it's saved, and turning the switch on for the old rows doesn't look like an edit.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { SQL_FILES, addUser, asUser, insertAs, newDatabase, readSql } from './harness.js';

const upTo014 = SQL_FILES.slice(0, SQL_FILES.indexOf('015_species_rough_area.sql'));

let db;
let officer;

before(async () => {
  db = await newDatabase();
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
});

after(async () => {
  await db.close();
});

/** A new species with a new ID each time, not marked rough area only. */
function speciesRow(changes = {}) {
  const id = `testus-${randomUUID()}`;
  return {
    id,
    scientific_name: `Testus ${id.slice('testus-'.length)}`,
    family: 'Testaceae',
    common_names: ['Test plant'],
    iucn_code: 'LC',
    sarawak_protected: false,
    rough_area_only: false,
    summary: 'A plant for the tests.',
    ...changes,
  };
}

async function addSpecies(row) {
  await insertAs(db, officer, 'public.species', row);
  return row.id;
}

function saveSpecies(id, set, params = []) {
  return asUser(db, officer, (tx) =>
    tx.query(`UPDATE public.species SET ${set} WHERE id = $1`, [id, ...params]),
  );
}

async function stored(database, id) {
  const { rows } = await database.query('SELECT * FROM public.species WHERE id = $1', [id]);
  return rows[0];
}

async function historyOf(database, id) {
  const { rows } = await database.query(
    'SELECT changes FROM public.species_history WHERE species_id = $1 ORDER BY id',
    [id],
  );
  return rows.map((row) => row.changes);
}

describe('adding a species', () => {
  for (const [what, changes] of [
    ['a threatened species', { iucn_code: 'VU' }],
    ['a species with no assessment yet', { iucn_code: 'NE' }],
    ['a species short of data', { iucn_code: 'DD' }],
    ['a protected species of least concern', { sarawak_protected: true }],
    ['a protected near threatened species', { iucn_code: 'NT', sarawak_protected: true }],
  ]) {
    test(`${what} is rough area only even if the row says it isn't`, async () => {
      const id = await addSpecies(speciesRow(changes));
      assert.equal((await stored(db, id)).rough_area_only, true);
    });
  }

  test('LC and NT species that are not protected stay how they were sent', async () => {
    for (const iucn_code of ['LC', 'NT']) {
      const off = await addSpecies(speciesRow({ iucn_code }));
      const on = await addSpecies(speciesRow({ iucn_code, rough_area_only: true }));
      assert.equal((await stored(db, off)).rough_area_only, false, iucn_code);
      assert.equal((await stored(db, on)).rough_area_only, true, iucn_code);
    }
  });
});

describe('editing a species', () => {
  test('a threatened species can\'t be turned to an exact spot, and that isn\'t an edit', async () => {
    const id = await addSpecies(speciesRow({ iucn_code: 'EN' }));
    const before = await stored(db, id);

    await saveSpecies(id, 'rough_area_only = false');
    assert.deepEqual(await stored(db, id), before);
    assert.deepEqual(await historyOf(db, id), []);
  });

  test('saving other fields on a threatened species only logs those fields', async () => {
    const id = await addSpecies(speciesRow({ iucn_code: 'CR' }));
    await saveSpecies(id, "summary = 'Changed in the tests.'");
    const [changes, ...rest] = await historyOf(db, id);
    assert.deepEqual(Object.keys(changes), ['summary']);
    assert.deepEqual(rest, []);
  });

  test('a species that becomes threatened gets a true history line', async () => {
    const id = await addSpecies(speciesRow());
    await saveSpecies(id, "iucn_code = 'VU'");
    assert.equal((await stored(db, id)).rough_area_only, true);
    const [changes] = await historyOf(db, id);
    assert.deepEqual(changes.rough_area_only, { from: false, to: true });
    assert.deepEqual(changes.iucn_code, { from: 'LC', to: 'VU' });
  });

  test('a species that stops being threatened stays rough until someone decides', async () => {
    const id = await addSpecies(speciesRow({ iucn_code: 'VU' }));
    await saveSpecies(id, "iucn_code = 'LC'");
    assert.equal((await stored(db, id)).rough_area_only, true);

    await saveSpecies(id, 'rough_area_only = false');
    assert.equal((await stored(db, id)).rough_area_only, false);
  });
});

describe('species from before 015', () => {
  let old;
  const ids = {};
  const before015 = {};
  let publicBefore;

  before(async () => {
    old = await newDatabase(upTo014);
    for (const [name, iucn_code, sarawak_protected, rough_area_only] of [
      ['threatened', 'VU', false, false],
      ['protected', 'LC', true, false],
      ['plain', 'NT', false, false],
      ['marked', 'LC', false, true],
    ]) {
      const row = speciesRow({ iucn_code, sarawak_protected, rough_area_only });
      await old.query(
        `INSERT INTO public.species (id, scientific_name, family, common_names, iucn_code,
           sarawak_protected, rough_area_only, summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.id,
          row.scientific_name,
          row.family,
          row.common_names,
          iucn_code,
          sarawak_protected,
          rough_area_only,
          row.summary,
        ],
      );
      ids[name] = row.id;
      before015[name] = await stored(old, row.id);
    }
    ({ rows: publicBefore } = await old.query('SELECT * FROM public.records_public ORDER BY id'));
    await old.exec(readSql('015_species_rough_area.sql'));
  });

  after(async () => {
    await old.close();
  });

  test('only the ones that break the rule change', async () => {
    assert.equal((await stored(old, ids.threatened)).rough_area_only, true);
    assert.equal((await stored(old, ids.protected)).rough_area_only, true);
    assert.deepEqual(await stored(old, ids.plain), before015.plain);
    assert.deepEqual(await stored(old, ids.marked), before015.marked);
  });

  test('the sample species are all marked now, since each is threatened or protected', async () => {
    const { rows } = await old.query(
      "SELECT id FROM public.species WHERE id NOT LIKE 'testus-%' AND NOT rough_area_only",
    );
    assert.deepEqual(rows, []);
  });

  test('it looks like nobody edited them', async () => {
    for (const name of ['threatened', 'protected']) {
      const row = await stored(old, ids[name]);
      assert.deepEqual(row.updated_at, before015[name].updated_at, name);
      assert.deepEqual(await historyOf(old, ids[name]), [], name);
    }
    const { rows } = await old.query('SELECT count(*)::int AS count FROM public.species_history');
    assert.deepEqual(rows, [{ count: 0 }]);
  });

  test('the public sees the same records as before', async () => {
    const { rows } = await old.query('SELECT * FROM public.records_public ORDER BY id');
    assert.deepEqual(rows, publicBefore);
  });

  test('the history and updated_at triggers are back on afterwards', async () => {
    const before = await stored(old, ids.plain);
    await old.query("UPDATE public.species SET summary = 'Changed in the tests.' WHERE id = $1", [
      ids.plain,
    ]);
    assert.notDeepEqual((await stored(old, ids.plain)).updated_at, before.updated_at);
    assert.equal((await historyOf(old, ids.plain)).length, 1);
    await old.query('UPDATE public.species SET summary = $2 WHERE id = $1', [
      ids.plain,
      before.summary,
    ]);
  });
});

describe('running the SQL files', () => {
  test('running 015 again changes nothing, and 002 still runs after it', async () => {
    const id = await addSpecies(speciesRow({ iucn_code: 'VU' }));
    const before = await stored(db, id);
    await db.exec(readSql('015_species_rough_area.sql'));
    await db.exec(readSql('002_seed_data.sql'));
    assert.deepEqual(await stored(db, id), before);

    const { rows } = await db.query(
      "SELECT id FROM public.species WHERE id = 'eusideroxylon-zwageri' AND rough_area_only",
    );
    assert.equal(rows.length, 1);

    // The trigger is still there, once
    const { rows: triggers } = await db.query(
      `SELECT count(*)::int AS count FROM pg_trigger
       WHERE tgname = 'keep_species_rough' AND tgrelid = 'public.species'::regclass`,
    );
    assert.deepEqual(triggers, [{ count: 1 }]);
  });

  test("015 stops and changes nothing if 014 hasn't been run", async () => {
    const without014 = await newDatabase(upTo014.slice(0, -1));
    try {
      await assert.rejects(
        without014.exec(readSql('015_species_rough_area.sql')),
        /015 needs 014_photo_folder\.sql to be run first/,
      );
      const { rows } = await without014.query(
        "SELECT count(*)::int AS count FROM pg_proc WHERE proname = 'keep_species_rough'",
      );
      assert.deepEqual(rows, [{ count: 0 }]);
    } finally {
      await without014.close();
    }
  });

  test('nobody can call the trigger function through the API', async () => {
    const { rows } = await db.query(
      `SELECT has_function_privilege('anon', 'public.keep_species_rough()', 'EXECUTE') AS anon,
         has_function_privilege('authenticated', 'public.keep_species_rough()', 'EXECUTE') AS signed_in`,
    );
    assert.deepEqual(rows, [{ anon: false, signed_in: false }]);
  });
});
