// Checks 013_edit_history.sql: the history of changes to records and species. That every save
// that changes something adds a row saying who and when, that where a plant is never gets copied
// into it, who can read it, and that nobody can change it through the API.
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

// A made up spot near park HQ, and another one a little way off
const spot = { lat: 3.81391, lng: 113.77874, accuracyM: 8 };
const otherSpot = { lat: 3.81402, lng: 113.77861, accuracyM: 6 };

let db;
let visitor;
let researcher;
let botanist;
let officer;
let admin;

before(async () => {
  db = await newDatabase();
  visitor = await addUser(db, { name: 'Visitor' });
  researcher = await addUser(db, { role: 'researcher', name: 'Researcher' });
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
  admin = await addUser(db, { role: 'admin', name: 'Park admin' });
});

after(async () => {
  await db.close();
});

/** Runs one statement as a user, like one request through the Supabase API. */
function run(user, sql, params = []) {
  return asUser(db, user, (tx) => tx.query(sql, params));
}

/** Uploads a record like the phone does, at the made up spot, and gives back its ID. */
async function upload(user = botanist) {
  const row = { ...structuredClone(everyField.row), id: randomUUID(), gps: spot };
  await insertAs(db, user, 'public.records', row);
  return row.id;
}

/** Adds a species the way the website's add a species form does, and gives back its ID. */
async function newSpecies() {
  const id = `testus-${randomUUID()}`;
  await insertAs(db, officer, 'public.species', {
    id,
    scientific_name: `Testus ${id.slice('testus-'.length)}`,
    family: 'Testaceae',
    common_names: ['Test plant'],
    iucn_code: 'LC',
    sarawak_protected: false,
    rough_area_only: false,
    summary: 'A plant for the tests.',
  });
  return id;
}

/** The history straight from the table as the postgres user, oldest first. */
async function historyOf(table, column, id) {
  const { rows } = await db.query(
    `SELECT * FROM public.${table} WHERE ${column} = $1 ORDER BY id`,
    [id],
  );
  return rows;
}

const recordHistory = (id) => historyOf('record_history', 'record_id', id);
const speciesHistory = (id) => historyOf('species_history', 'species_id', id);

const notAllowed = { code: '42501', message: /permission denied/ };

describe('record history', () => {
  test("an officer's edit adds a row with their name, the time and only what changed", async () => {
    const id = await upload();
    assert.deepEqual(await recordHistory(id), [], 'an upload is not a change');

    const before = new Date();
    await run(officer, "UPDATE public.records SET condition = 'dead', height_m = 13 WHERE id = $1", [
      id,
    ]);
    const [row] = await recordHistory(id);
    assert.equal(row.changed_by, officer.id);
    assert.equal(row.changed_by_name, officer.name);
    assert.ok(row.changed_at >= new Date(before.getTime() - 1000));
    // updated_at changes too, but 008 fills that in, so it isn't news
    assert.deepEqual(row.changes, {
      condition: { from: 'damaged', to: 'dead' },
      height_m: { from: 12.5, to: 13 },
    });
  });

  test('where the plant is never goes in, only whether it had a spot', async () => {
    const id = await upload();
    await run(officer, 'UPDATE public.records SET gps = $2 WHERE id = $1', [id, otherSpot]);
    await run(officer, 'UPDATE public.records SET gps = null WHERE id = $1', [id]);
    await run(officer, 'UPDATE public.records SET gps = $2 WHERE id = $1', [id, spot]);

    const rows = await recordHistory(id);
    assert.deepEqual(
      rows.map((row) => row.changes),
      [
        { gps: { had: true, has: true } },
        { gps: { had: true, has: false } },
        { gps: { had: false, has: true } },
      ],
    );
    const everything = JSON.stringify(rows);
    for (const number of ['3.81', '113.7', 'accuracyM']) {
      assert.ok(!everything.includes(number), number);
    }
  });

  test('a review says who reviewed it, without reviewed_by and reviewed_at again', async () => {
    const id = await upload();
    await run(
      admin,
      "UPDATE public.records SET status = 'published', review_notes = 'Checked' WHERE id = $1",
      [id],
    );
    const [row] = await recordHistory(id);
    assert.equal(row.changed_by_name, admin.name);
    assert.deepEqual(row.changes, {
      status: { from: 'waiting', to: 'published' },
      review_notes: { from: null, to: 'Checked' },
    });
  });

  test("a save that doesn't change anything adds no row", async () => {
    const id = await upload();
    await run(officer, 'UPDATE public.records SET notes = notes, condition = condition WHERE id = $1', [
      id,
    ]);
    assert.deepEqual(await recordHistory(id), []);
  });

  test('a botanist fixing their own waiting record is in the history too', async () => {
    const id = await upload(botanist);
    await run(botanist, "UPDATE public.records SET notes = 'Fixed a typo' WHERE id = $1", [id]);
    const [row] = await recordHistory(id);
    assert.equal(row.changed_by_name, botanist.name);
    assert.deepEqual(row.changes, {
      notes: { from: everyField.row.notes, to: 'Fixed a typo' },
    });
  });

  test('a change in the SQL editor has no name, because nobody is signed in', async () => {
    const id = await upload();
    await db.query("UPDATE public.records SET condition = 'healthy' WHERE id = $1", [id]);
    const [row] = await recordHistory(id);
    assert.equal(row.changed_by, null);
    assert.equal(row.changed_by_name, null);
    assert.deepEqual(row.changes, { condition: { from: 'damaged', to: 'healthy' } });
  });

  test('deleting a record deletes its history, so nothing about the plant stays behind', async () => {
    const id = await upload();
    await run(officer, "UPDATE public.records SET notes = 'Near the big fig' WHERE id = $1", [id]);
    assert.equal((await recordHistory(id)).length, 1);
    await run(officer, 'DELETE FROM public.records WHERE id = $1', [id]);
    assert.deepEqual(await recordHistory(id), []);
  });
});

describe('species history', () => {
  test("an officer's edit adds a row with what each column was and is now", async () => {
    const id = await newSpecies();
    assert.deepEqual(await speciesHistory(id), [], 'adding a species is not a change');

    await run(
      officer,
      "UPDATE public.species SET iucn_code = 'VU', common_names = '{Test plant,Tester}' WHERE id = $1",
      [id],
    );
    const [row] = await speciesHistory(id);
    assert.equal(row.changed_by_name, officer.name);
    assert.deepEqual(row.changes, {
      iucn_code: { from: 'LC', to: 'VU' },
      common_names: { from: ['Test plant'], to: ['Test plant', 'Tester'] },
    });
  });

  test('the photos are kept in full, so the history can say which one changed', async () => {
    const id = await newSpecies();
    const photo = {
      url: 'https://example.test/leaf.jpg',
      caption: 'A leaf',
      credit: 'SFC',
      isPrimary: true,
    };
    await run(admin, 'UPDATE public.species SET photos = $2 WHERE id = $1', [
      id,
      JSON.stringify([photo]),
    ]);
    const [row] = await speciesHistory(id);
    assert.equal(row.changed_by_name, admin.name);
    assert.deepEqual(row.changes, { photos: { from: [], to: [photo] } });
  });

  test("a species' spots never go in, only whether it had one", async () => {
    // A new species starts with 001's spots for the park as a whole
    const id = await newSpecies();
    await run(
      officer,
      `UPDATE public.species
       SET coordinates_exact = $2, coordinates_rough = $3, niah_zone = 'Near the cave' WHERE id = $1`,
      [id, JSON.stringify(spot), JSON.stringify(otherSpot)],
    );
    await run(officer, 'UPDATE public.species SET coordinates_exact = null WHERE id = $1', [id]);

    const rows = await speciesHistory(id);
    assert.deepEqual(
      rows.map((row) => row.changes),
      [
        {
          coordinates_exact: { had: true, has: true },
          coordinates_rough: { had: true, has: true },
          niah_zone: { from: 'Niah National Park', to: 'Near the cave' },
        },
        { coordinates_exact: { had: true, has: false } },
      ],
    );
    const everything = JSON.stringify(rows);
    for (const number of ['3.8', '113.7', 'accuracy', 'bufferKm']) {
      assert.ok(!everything.includes(number), number);
    }
  });

  test('deleting a species deletes its history', async () => {
    const id = await newSpecies();
    await run(officer, "UPDATE public.species SET summary = 'Changed' WHERE id = $1", [id]);
    assert.equal((await speciesHistory(id)).length, 1);
    await run(admin, 'DELETE FROM public.species WHERE id = $1', [id]);
    assert.deepEqual(await speciesHistory(id), []);
  });
});

describe('who can see and change the history', () => {
  test('only officers and admins can read it', async () => {
    const recordId = await upload();
    const speciesId = await newSpecies();
    await run(officer, "UPDATE public.records SET condition = 'dead' WHERE id = $1", [recordId]);
    await run(officer, "UPDATE public.species SET summary = 'Read me' WHERE id = $1", [speciesId]);

    const records = 'SELECT changed_by_name FROM public.record_history WHERE record_id = $1';
    const species = 'SELECT changed_by_name FROM public.species_history WHERE species_id = $1';
    for (const user of [officer, admin]) {
      assert.deepEqual(await selectAs(db, user, records, [recordId]), [
        { changed_by_name: officer.name },
      ]);
      assert.deepEqual(await selectAs(db, user, species, [speciesId]), [
        { changed_by_name: officer.name },
      ]);
    }
    for (const user of [botanist, researcher, visitor]) {
      assert.deepEqual(await selectAs(db, user, records, [recordId]), [], user.name);
      assert.deepEqual(await selectAs(db, user, species, [speciesId]), [], user.name);
    }
    await assert.rejects(selectAs(db, null, records, [recordId]), notAllowed);
    await assert.rejects(selectAs(db, null, species, [speciesId]), notAllowed);
  });

  test('nobody can add to it, change it or empty it through the API', async () => {
    const id = await upload();
    await run(officer, "UPDATE public.records SET condition = 'dead' WHERE id = $1", [id]);
    const before = await recordHistory(id);

    for (const user of [admin, officer]) {
      await assert.rejects(
        insertAs(db, user, 'public.record_history', {
          record_id: id,
          changes: { condition: { from: 'dead', to: 'healthy' } },
        }),
        notAllowed,
        `${user.name} adds`,
      );
      for (const table of ['record_history', 'species_history']) {
        await assert.rejects(
          run(user, `UPDATE public.${table} SET changed_by_name = 'Someone else'`),
          notAllowed,
          `${user.name} changes ${table}`,
        );
        await assert.rejects(
          run(user, `DELETE FROM public.${table}`),
          notAllowed,
          `${user.name} empties ${table}`,
        );
      }
    }
    assert.deepEqual(await recordHistory(id), before);

    const { rows } = await db.query(
      `SELECT
        has_function_privilege('authenticated', 'public.remember_record_change()', 'EXECUTE')
          AS records,
        has_function_privilege('authenticated', 'public.remember_species_change()', 'EXECUTE')
          AS species,
        has_function_privilege('authenticated',
          'public.changed_columns(jsonb, jsonb, text[], text[])', 'EXECUTE') AS changes`,
    );
    assert.deepEqual(rows, [{ records: false, species: false, changes: false }]);
  });

  test('a row keeps the name after the account is deleted', async () => {
    const leaving = await addUser(db, { role: 'conservation_officer', name: 'Leaving officer' });
    const id = await upload();
    await run(leaving, "UPDATE public.records SET condition = 'dead' WHERE id = $1", [id]);
    await db.query('DELETE FROM auth.users WHERE id = $1', [leaving.id]);

    const [row] = await recordHistory(id);
    assert.equal(row.changed_by, null);
    assert.equal(row.changed_by_name, leaving.name);
  });
});

describe('running the SQL files', () => {
  test('running 013 again keeps the history, and 002 still runs after it', async () => {
    const id = await upload();
    await run(officer, "UPDATE public.records SET condition = 'dead' WHERE id = $1", [id]);
    const before = await recordHistory(id);

    await db.exec(readSql('013_edit_history.sql'));
    await db.exec(readSql('002_seed_data.sql'));
    assert.deepEqual(await recordHistory(id), before);

    // The triggers are still there, once each
    await run(officer, "UPDATE public.records SET condition = 'healthy' WHERE id = $1", [id]);
    assert.equal((await recordHistory(id)).length, before.length + 1);
    assert.deepEqual(await selectAs(db, botanist, 'SELECT * FROM public.record_history'), []);
  });

  test("013 stops and changes nothing if 012 hasn't been run", async () => {
    const upTo011 = SQL_FILES.slice(0, SQL_FILES.indexOf('012_report_counts.sql'));
    const without012 = await newDatabase(upTo011);
    try {
      await assert.rejects(
        without012.exec(readSql('013_edit_history.sql')),
        /013 needs 012_report_counts\.sql to be run first/,
      );
      const { rows } = await without012.query(
        "SELECT to_regclass('public.record_history') AS records, " +
          "to_regclass('public.species_history') AS species",
      );
      assert.deepEqual(rows, [{ records: null, species: null }]);
    } finally {
      await without012.close();
    }
  });
});
