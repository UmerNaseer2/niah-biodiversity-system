// Checks 031_species_from_record.sql: when an officer approves a record whose name isn't on the
// species list, the species is added as Not Evaluated and every record with that name is linked to
// it. A name that is on the list, spelt with other capitals or spaces, links to that species
// instead. Adding a species links the records that already have its name.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import {
  SQL_FILES,
  addUser,
  asUser,
  insertAs,
  newDatabase,
  readFixture,
  readSql,
  selectAs,
} from './harness.js';

const { uploads } = readFixture('phone-upload.json');
const [everyField] = uploads;

const upTo030 = SQL_FILES.slice(0, SQL_FILES.indexOf('031_species_from_record.sql'));

let db;
let botanist;
let officer;

before(async () => {
  db = await newDatabase();
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
});

after(async () => {
  await db.close();
});

/** Uploads a record as the botanist, with no species unless one is given, and gives back its ID. */
async function upload(name, changes = {}) {
  const row = {
    ...structuredClone(everyField.row),
    id: randomUUID(),
    species_slug: null,
    species_name: name,
    common_name: null,
    ...changes,
  };
  await insertAs(db, botanist, 'public.records', row);
  return row.id;
}

/** Approves or rejects a record as the officer, the way the review page does. */
function review(id, status) {
  return asUser(db, officer, (tx) =>
    tx.query('UPDATE public.records SET status = $2 WHERE id = $1', [id, status]),
  );
}

async function recordOf(id) {
  const { rows } = await db.query(
    'SELECT species_slug, species_name, status FROM public.records WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function speciesOf(id) {
  const { rows } = await db.query('SELECT * FROM public.species WHERE id = $1', [id]);
  return rows[0];
}

async function speciesNamed(name) {
  const { rows } = await db.query(
    'SELECT id FROM public.species WHERE lower(scientific_name) = lower($1) ORDER BY id',
    [name],
  );
  return rows.map((row) => row.id);
}

describe('approving a record whose name is not on the species list', () => {
  test('adds the species as Not Evaluated and links the record', async () => {
    const id = await upload('  Testus   NEWLY  added ', { common_name: ' Test  tree ' });
    await review(id, 'published');

    assert.deepEqual(await recordOf(id), {
      species_slug: 'testus-newly-added',
      species_name: 'Testus NEWLY added',
      status: 'published',
    });
    const added = await speciesOf('testus-newly-added');
    assert.equal(added.slug, 'testus-newly-added');
    assert.equal(added.scientific_name, 'Testus NEWLY added');
    assert.equal(added.family, '');
    assert.deepEqual(added.common_names, ['Test tree']);
    assert.equal(added.iucn_code, 'NE');
    assert.equal(added.sarawak_protected, false);
    assert.equal(added.rough_area_only, false);
  });

  test('the plant then shows on the species list and at its exact spot', async () => {
    const id = await upload('Testus on the list');
    await review(id, 'published');

    const listed = await selectAs(db, null, 'SELECT id FROM public.species_public WHERE id = $1', [
      'testus-on-the-list',
    ]);
    assert.equal(listed.length, 1);
    const [shown] = await selectAs(
      db,
      null,
      'SELECT species_slug, gps FROM public.records_public WHERE id = $1',
      [id],
    );
    assert.equal(shown.species_slug, 'testus-on-the-list');
    assert.deepEqual(shown.gps, {
      lat: everyField.row.gps.lat,
      lng: everyField.row.gps.lng,
      accuracyM: everyField.row.gps.accuracyM,
    });
  });

  test('links the other records with that name, waiting or not, and spells them the same', async () => {
    const waiting = await upload('testus SHARED name');
    const rejected = await upload('Testus shared  Name');
    await review(rejected, 'rejected');
    const approved = await upload('Testus shared name');
    await review(approved, 'published');

    assert.deepEqual(await speciesNamed('testus shared name'), ['testus-shared-name']);
    for (const id of [waiting, rejected, approved]) {
      const row = await recordOf(id);
      assert.equal(row.species_slug, 'testus-shared-name', id);
      assert.equal(row.species_name, 'Testus shared name', id);
    }
    assert.equal((await recordOf(waiting)).status, 'waiting');
    assert.equal((await recordOf(rejected)).status, 'rejected');
  });

  test('a record that is only waiting or rejected adds nothing', async () => {
    const waiting = await upload('Testus still waiting');
    const rejected = await upload('Testus turned down');
    await review(rejected, 'rejected');

    assert.equal((await recordOf(waiting)).species_slug, null);
    assert.equal((await recordOf(rejected)).species_slug, null);
    assert.deepEqual(await speciesNamed('Testus still waiting'), []);
    assert.deepEqual(await speciesNamed('Testus turned down'), []);
  });

  test('a name already on the list with other capitals links to that species', async () => {
    await db.query(
      `INSERT INTO public.species (id, scientific_name, family, iucn_code)
       VALUES ('testus-listed', 'Testus listed', 'Testaceae', 'LC')`,
    );
    const id = await upload(' TESTUS   Listed');
    await review(id, 'published');

    assert.deepEqual(await recordOf(id), {
      species_slug: 'testus-listed',
      species_name: 'Testus listed',
      status: 'published',
    });
    assert.deepEqual(await speciesNamed('Testus listed'), ['testus-listed']);
  });

  test('an ID that is taken gets a number on the end', async () => {
    await db.query(
      `INSERT INTO public.species (id, scientific_name, family, iucn_code)
       VALUES ('testus-clash', 'Some other name', 'Testaceae', 'LC')`,
    );
    const id = await upload('Testus clash');
    await review(id, 'published');
    assert.equal((await recordOf(id)).species_slug, 'testus-clash-2');
  });

  test('the ID only has small letters, numbers and hyphens', async () => {
    const odd = await upload('Ficus sp. (Test Á)');
    await review(odd, 'published');
    assert.equal((await recordOf(odd)).species_slug, 'ficus-sp-test');

    const symbols = await upload('?!');
    await review(symbols, 'published');
    const slug = (await recordOf(symbols)).species_slug;
    assert.match(slug, /^plant(-\d+)?$/);
    assert.equal((await speciesOf(slug)).scientific_name, '?!');
  });

  test('a published record that already has a species is left alone', async () => {
    await db.query(
      `INSERT INTO public.species (id, scientific_name, family, iucn_code)
       VALUES ('testus-chosen', 'Testus chosen', 'Testaceae', 'LC')`,
    );
    const id = await upload('Testus written differently', { species_slug: 'testus-chosen' });
    await review(id, 'published');
    assert.equal((await recordOf(id)).species_slug, 'testus-chosen');
    assert.deepEqual(await speciesNamed('Testus written differently'), []);
  });
});

describe('taking a species off the list', () => {
  test("doesn't add it back, even when its records are edited", async () => {
    const id = await upload('Testus taken off');
    await review(id, 'published');
    await db.query("DELETE FROM public.species WHERE id = 'testus-taken-off'");
    assert.equal((await recordOf(id)).species_slug, null);

    await asUser(db, officer, (tx) =>
      tx.query("UPDATE public.records SET notes = 'Checked again' WHERE id = $1", [id]),
    );
    assert.equal((await recordOf(id)).species_slug, null);
    assert.deepEqual(await speciesNamed('Testus taken off'), []);
  });

  test('renaming the published record links it again', async () => {
    const id = await upload('Testus renamed');
    await review(id, 'published');
    await db.query("DELETE FROM public.species WHERE id = 'testus-renamed'");
    await asUser(db, officer, (tx) =>
      tx.query("UPDATE public.records SET species_name = 'Testus renamed again' WHERE id = $1", [
        id,
      ]),
    );
    assert.equal((await recordOf(id)).species_slug, 'testus-renamed-again');
  });
});

describe('adding a species on the Species page', () => {
  test('links the records that already have its name', async () => {
    const published = await upload('Testus added later');
    await db.query(
      "UPDATE public.records SET status = 'published', species_slug = NULL WHERE id = $1",
      [published],
    );
    // Taken off again, so the record is published with no species, like one from before 031
    await db.query("DELETE FROM public.species WHERE id = 'testus-added-later'");
    const waiting = await upload('TESTUS added later');
    assert.equal((await recordOf(published)).species_slug, null);

    await asUser(db, officer, (tx) =>
      tx.query(
        `INSERT INTO public.species (id, scientific_name, family, iucn_code)
         VALUES ('testus-added-later-by-hand', 'Testus added later', 'Testaceae', 'LC')`,
      ),
    );
    assert.equal((await recordOf(published)).species_slug, 'testus-added-later-by-hand');
    assert.equal((await recordOf(waiting)).species_slug, 'testus-added-later-by-hand');
  });
});

describe('who can use it', () => {
  test('nobody can call the functions through the API', async () => {
    const calls = [
      "SELECT public.plant_name_key('x')",
      "SELECT public.link_records_to_species('x')",
      "SELECT public.species_for_plant_name('Testus api', null)",
    ];
    for (const user of [null, botanist, officer]) {
      for (const sql of calls) {
        await assert.rejects(selectAs(db, user, sql), /permission denied/, sql);
      }
    }
    assert.deepEqual(await speciesNamed('Testus api'), []);
  });
});

describe('running the SQL file', () => {
  test('needs 030 first', async () => {
    const early = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('030_spot_unless_threatened.sql')),
    );
    try {
      await assert.rejects(early.exec(readSql('031_species_from_record.sql')), /needs 030/);
    } finally {
      await early.close();
    }
  });

  test('adds and links the records approved before it, and running it again changes nothing', async () => {
    const old = await newDatabase(upTo030);
    try {
      await old.query(
        `INSERT INTO public.species (id, scientific_name, family, iucn_code)
         VALUES ('testus-old-listed', 'Testus old listed', 'Testaceae', 'LC')`,
      );
      const insert = `INSERT INTO public.records
          (species_slug, species_name, common_name, condition, recorded_by, recorded_at, status)
        VALUES (NULL, $1, $2, 'healthy', 'Test botanist', $3, $4)
        RETURNING id`;
      const add = async (name, common, at, status = 'published') =>
        (await old.query(insert, [name, common, at, status])).rows[0].id;
      const first = await add('Testus old one', 'First name', '2031-01-01T00:00:00Z');
      const second = await add('testus OLD one', 'Second name', '2031-02-01T00:00:00Z');
      const listed = await add('testus old LISTED', null, '2031-03-01T00:00:00Z');
      const waiting = await add('Testus old waiting', null, '2031-04-01T00:00:00Z', 'waiting');

      await old.exec(readSql('031_species_from_record.sql'));

      const slugOf = async (id) =>
        (await old.query('SELECT species_slug FROM public.records WHERE id = $1', [id])).rows[0]
          .species_slug;
      assert.equal(await slugOf(first), 'testus-old-one');
      assert.equal(await slugOf(second), 'testus-old-one');
      assert.equal(await slugOf(listed), 'testus-old-listed');
      assert.equal(await slugOf(waiting), null);
      const { rows } = await old.query(
        "SELECT common_names FROM public.species WHERE id = 'testus-old-one'",
      );
      assert.deepEqual(rows[0].common_names, ['First name']);

      const count = async () =>
        Number((await old.query('SELECT count(*) FROM public.species')).rows[0].count);
      const before = await count();
      await old.exec(readSql('031_species_from_record.sql'));
      assert.equal(await count(), before);
    } finally {
      await old.close();
    }
  });
});
