// Checks 007_species_fixes.sql: the fixed facts and photo credits of the sample species, the rough
// area only switch, updated_at, and adding, editing and deleting a species the way the website
// does.
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

// A made up spot near park HQ for the test records, and the two ways the public can see it.
const spot = { lat: 3.8151, lng: 113.7801, accuracyM: 8, capturedAt: '2026-10-16T01:10:00.000Z' };
const exactSpot = { lat: 3.8151, lng: 113.7801, accuracyM: 8 };
const spotSquare = { lat: 3.814, lng: 113.782, accuracyM: 440 };

// The IUCN code and Sarawak protection of each sample species after 007. The Belian and the
// pitcher plant were right in 002 already.
const sampleFacts = {
  'eusideroxylon-zwageri': { iucn_code: 'VU', sarawak_protected: false },
  'nepenthes-ampullaria': { iucn_code: 'LC', sarawak_protected: true },
  'koompassia-excelsa': { iucn_code: 'NT', sarawak_protected: true },
  'shorea-macrophylla': { iucn_code: 'LC', sarawak_protected: true },
  'dipterocarpus-sarawakensis': { iucn_code: 'VU', sarawak_protected: false },
  'paphiopedilum-barbatum': { iucn_code: 'EN', sarawak_protected: true },
};
const sampleIds = Object.keys(sampleFacts);

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

/** How many rows a change touched. Rows the user isn't allowed to change are skipped, so 0. */
async function changed(user, sql, params = []) {
  return (await run(user, sql, params)).affectedRows;
}

function who(user) {
  return user?.name ?? 'someone not signed in';
}

const notAllowed = { code: '42501', message: /permission denied/ };
const turnedDown = { code: '42501', message: /row-level security/ };

/** A new species the way the website's add a species form sends it, with a new ID each time. */
function websiteRow(changes = {}) {
  const id = `testus-${randomUUID()}`;
  return {
    id,
    scientific_name: `Testus ${id.slice('testus-'.length)}`,
    authority: 'L.',
    family: 'Testaceae',
    common_names: ['Test plant'],
    iucn_code: 'LC',
    sarawak_protected: false,
    rough_area_only: false,
    summary: 'A plant for the tests.',
    about: null,
    ...changes,
  };
}

function addSpecies(user, row) {
  return insertAs(db, user, 'public.species', row);
}

// Everything the website's edit form saves. The ID and scientific name never change.
const edits = {
  authority: 'Ashton',
  family: 'Fabaceae',
  common_names: ['Changed plant', 'Second name'],
  iucn_code: 'NT',
  sarawak_protected: true,
  rough_area_only: true,
  summary: 'Changed in the tests.',
  about: 'More about the plant.',
};
const editedColumns = Object.keys(edits);

/** Just the given columns of a row. */
function only(row, columns) {
  return Object.fromEntries(columns.map((column) => [column, row[column]]));
}

/**
 * Saves changes to a species the way the website's edit form does, with
 * supabase.from('species').update(changes).eq('id', id).select('scientific_name'). Gives back the
 * rows that changed, with the time of the change to compare updated_at with.
 */
function editSpecies(user, id, changes) {
  const columns = Object.keys(changes)
    .map((column) => `"${column}"`)
    .join(', ');
  return asUser(db, user, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE public.species SET (${columns}) = (
         SELECT ${columns} FROM json_populate_record(null::public.species, $2::json)
       )
       WHERE id = $1
       RETURNING scientific_name, updated_at, now() AS changed_at`,
      [id, JSON.stringify(changes)],
    );
    return rows;
  });
}

/**
 * Deletes a species the way the website's delete button does, with
 * supabase.from('species').delete().eq('id', id).select('scientific_name'). Gives back the rows
 * that went.
 */
async function deleteSpecies(user, id) {
  const sql = 'DELETE FROM public.species WHERE id = $1 RETURNING scientific_name';
  return (await run(user, sql, [id])).rows;
}

// A week before the tests, for species that haven't changed in a while
const lastWeek = '2026-10-09T00:00:00.000Z';

/** A new species from the website that was last changed a week ago. */
async function speciesFromLastWeek() {
  const row = websiteRow();
  await addSpecies(officer, row);
  await db.query('UPDATE public.species SET updated_at = $1 WHERE id = $2', [lastWeek, row.id]);
  return row;
}

async function updatedAt(id) {
  return new Date((await storedSpecies(id)).updated_at).toISOString();
}

/** Reads a species straight from the table as the postgres user, so no rules get in the way. */
async function storedSpecies(id) {
  const { rows } = await db.query('SELECT * FROM public.species WHERE id = $1', [id]);
  return rows[0];
}

async function sampleFactsNow() {
  const { rows } = await db.query(
    `SELECT id, iucn_code, sarawak_protected FROM public.species WHERE id = ANY($1)`,
    [sampleIds],
  );
  return Object.fromEntries(rows.map(({ id, ...facts }) => [id, facts]));
}

/** Uploads a record of a species like the phone does, publishes it and gives back its ID. */
async function publishedRecordOf(slug) {
  const id = randomUUID();
  await insertAs(db, botanist, 'public.records', {
    ...structuredClone(everyField.row),
    id,
    gps: spot,
    species_slug: slug,
    species_name: `Testus ${slug}`,
    common_name: null,
  });
  await db.query("UPDATE public.records SET status = 'published' WHERE id = $1", [id]);
  return id;
}

/** Where the public sees a record, through records_public. */
async function publicSpot(recordId) {
  const sql = 'SELECT gps FROM public.records_public WHERE id = $1';
  const [shown] = await selectAs(db, null, sql, [recordId]);
  return shown.gps;
}

async function columnsOf(table) {
  const { rows } = await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((row) => row.column_name);
}

describe('the sample species', () => {
  test('have the IUCN code and Sarawak protection 007 gives them', async () => {
    assert.deepEqual(await sampleFactsNow(), sampleFacts);
  });

  test('everyone reads the same facts through species_public', async () => {
    const sql = `SELECT id, iucn_code, sarawak_protected FROM public.species_public
                 WHERE id = ANY($1)`;
    for (const user of [null, visitor, researcher, botanist, officer, admin]) {
      const rows = await selectAs(db, user, sql, [sampleIds]);
      const facts = Object.fromEntries(rows.map(({ id, ...rest }) => [id, rest]));
      assert.deepEqual(facts, sampleFacts, who(user));
    }
  });

  test('have the fixed names and text', async () => {
    const tapang = await storedSpecies('koompassia-excelsa');
    assert.deepEqual(tapang.common_names, ['Tapang', 'Tualang']);

    const engkabang = await storedSpecies('shorea-macrophylla');
    assert.equal(engkabang.newer_name, 'Rubroshorea macrophylla');

    const keruing = await storedSpecies('dipterocarpus-sarawakensis');
    for (const field of ['summary', 'about', 'description', 'habitat']) {
      assert.doesNotMatch(keruing[field], /endangered|endemic/i, field);
    }

    // Kew's Plants of the World Online doesn't list this orchid in Borneo, so nothing says it
    // grows at Niah.
    const orchid = await storedSpecies('paphiopedilum-barbatum');
    for (const field of ['summary', 'about', 'description', 'habitat', 'uses']) {
      assert.doesNotMatch(orchid[field], /niah|borneo|endemic|karst|limestone/i, field);
    }
  });

  test('say their photos are placeholders from Unsplash', async () => {
    for (const id of sampleIds) {
      const { photos } = await storedSpecies(id);
      assert.ok(photos.length > 0, id);
      for (const photo of photos) {
        assert.match(photo.url, /^https:\/\/images\.unsplash\.com\//, id);
        assert.equal(photo.credit, 'Unsplash', id);
        assert.match(photo.caption, /^Placeholder photo from Unsplash/, id);
        assert.equal(photo.isPrimary, true, id);
      }
    }
  });
});

describe('running 007 again', () => {
  test('changes nothing, not even updated_at', async () => {
    const firstTime = (await db.query('SELECT * FROM public.species ORDER BY id')).rows;
    await db.exec(readSql('007_species_fixes.sql'));
    assert.deepEqual((await db.query('SELECT * FROM public.species ORDER BY id')).rows, firstTime);
  });

  test("leaves photos alone that aren't the Unsplash ones of the sample species", async () => {
    const realPhoto = {
      url: 'https://example.test/belian.jpg',
      caption: 'Belian by the HQ trail',
      credit: 'SFC',
      isPrimary: false,
    };
    const stockPhoto = {
      url: 'https://images.unsplash.com/photo-test',
      caption: 'A caption an officer wrote',
      credit: 'Unsplash user',
      isPrimary: true,
    };
    const species = websiteRow();
    await addSpecies(officer, species);
    await db.query('UPDATE public.species SET photos = $1 WHERE id = $2', [
      JSON.stringify([stockPhoto]),
      species.id,
    ]);
    await db.query('UPDATE public.species SET photos = photos || $1 WHERE id = $2', [
      JSON.stringify([realPhoto]),
      'eusideroxylon-zwageri',
    ]);

    await db.exec(readSql('007_species_fixes.sql'));
    assert.deepEqual((await storedSpecies(species.id)).photos, [stockPhoto]);
    const { photos } = await storedSpecies('eusideroxylon-zwageri');
    assert.deepEqual(photos.at(-1), realPhoto);
    assert.equal(photos[0].credit, 'Unsplash');
  });

  test('puts the fixes back after 002 runs again', async () => {
    await db.exec(readSql('002_seed_data.sql'));
    // 002 writes its own facts over the sample species, which is why 007 runs again after it.
    assert.equal((await storedSpecies('koompassia-excelsa')).iucn_code, 'LC');

    await db.exec(readSql('007_species_fixes.sql'));
    assert.deepEqual(await sampleFactsNow(), sampleFacts);
    assert.deepEqual((await storedSpecies('koompassia-excelsa')).common_names, [
      'Tapang',
      'Tualang',
    ]);
    for (const id of sampleIds) {
      const { photos } = await storedSpecies(id);
      assert.ok(photos.every((photo) => photo.credit === 'Unsplash'), id);
    }
  });

  test("stops and changes nothing if 006 hasn't been run", async () => {
    const upTo005 = SQL_FILES.slice(0, SQL_FILES.indexOf('006_role_based_access.sql'));
    const without006 = await newDatabase(upTo005);
    try {
      await assert.rejects(
        without006.exec(readSql('007_species_fixes.sql')),
        /007 needs 006_role_based_access\.sql to be run first/,
      );
      const { rows } = await without006.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'species'
           AND column_name = 'rough_area_only'`,
      );
      assert.deepEqual(rows, []);
    } finally {
      await without006.close();
    }
  });
});

describe('rough area only', () => {
  test('a plant of an LC species shows its exact spot until the species is marked', async () => {
    const species = websiteRow({ iucn_code: 'LC' });
    await addSpecies(officer, species);
    const recordId = await publishedRecordOf(species.id);
    assert.deepEqual(await publicSpot(recordId), exactSpot);

    const mark = 'UPDATE public.species SET rough_area_only = $1 WHERE id = $2';
    assert.equal(await changed(officer, mark, [true, species.id]), 1);
    assert.deepEqual(await publicSpot(recordId), spotSquare);

    assert.equal(await changed(officer, mark, [false, species.id]), 1);
    assert.deepEqual(await publicSpot(recordId), exactSpot);
  });

  test('an NT species marked when it was added only shows the grid square', async () => {
    const marked = websiteRow({ iucn_code: 'NT', rough_area_only: true });
    const unmarked = websiteRow({ iucn_code: 'NT' });
    await addSpecies(officer, marked);
    await addSpecies(admin, unmarked);
    assert.deepEqual(await publicSpot(await publishedRecordOf(marked.id)), spotSquare);
    assert.deepEqual(await publicSpot(await publishedRecordOf(unmarked.id)), exactSpot);
  });

  test('a species is not marked unless someone marks it', async () => {
    const row = websiteRow();
    delete row.rough_area_only;
    await addSpecies(officer, row);
    assert.equal((await storedSpecies(row.id)).rough_area_only, false);
  });

  test('everyone reads it through species_public', async () => {
    const species = websiteRow({ rough_area_only: true });
    await addSpecies(officer, species);
    const sql = 'SELECT rough_area_only FROM public.species_public WHERE id = $1';
    for (const user of [null, visitor, researcher, botanist, officer, admin]) {
      const rows = await selectAs(db, user, sql, [species.id]);
      assert.deepEqual(rows, [{ rough_area_only: true }], who(user));
    }
  });

  test('only officers and admins change it', async () => {
    const species = websiteRow();
    await addSpecies(officer, species);
    const mark = 'UPDATE public.species SET rough_area_only = true WHERE id = $1';
    for (const user of [visitor, researcher, botanist]) {
      assert.equal(await changed(user, mark, [species.id]), 0, who(user));
    }
    await assert.rejects(run(null, mark, [species.id]), notAllowed);
    assert.equal((await storedSpecies(species.id)).rough_area_only, false);

    assert.equal(await changed(admin, mark, [species.id]), 1);
    assert.equal((await storedSpecies(species.id)).rough_area_only, true);
  });
});

describe('adding a species from the website', () => {
  test('officers and admins add one, and its slug is its ID', async () => {
    for (const user of [officer, admin]) {
      const row = websiteRow({ about: 'Grows in the tests.' });
      await addSpecies(user, row);
      const saved = await storedSpecies(row.id);
      assert.equal(saved.slug, row.id, who(user));
      assert.equal(saved.scientific_name, row.scientific_name);
      assert.deepEqual(saved.common_names, ['Test plant']);
      assert.equal(saved.about, 'Grows in the tests.');
      assert.deepEqual(saved.photos, []);

      const sql = 'SELECT id, slug, scientific_name FROM public.species_public WHERE id = $1';
      assert.deepEqual(await selectAs(db, null, sql, [row.id]), [
        { id: row.id, slug: row.id, scientific_name: row.scientific_name },
      ]);
    }
  });

  test('everyone else is turned down', async () => {
    const row = websiteRow();
    for (const user of [visitor, researcher, botanist]) {
      await assert.rejects(addSpecies(user, row), turnedDown, who(user));
    }
    await assert.rejects(addSpecies(null, row), notAllowed);
    assert.equal(await storedSpecies(row.id), undefined);
  });

  test('a species that is already there gives 23505', async () => {
    const row = websiteRow();
    await addSpecies(officer, row);
    await assert.rejects(addSpecies(admin, { ...row, summary: 'Added twice.' }), {
      code: '23505',
      constraint: 'species_pkey',
    });
    assert.equal((await storedSpecies(row.id)).summary, 'A plant for the tests.');
  });

  test('the database turns down an IUCN code or family the form never sends', async () => {
    await assert.rejects(addSpecies(officer, websiteRow({ iucn_code: 'EX' })), { code: '23514' });
    await assert.rejects(addSpecies(officer, websiteRow({ family: null })), { code: '23502' });
    await assert.rejects(addSpecies(officer, websiteRow({ rough_area_only: null })), {
      code: '23502',
    });
  });
});

describe('editing a species from the website', () => {
  test('officers and admins save changes, and updated_at changes by itself', async () => {
    for (const user of [officer, admin]) {
      const row = await speciesFromLastWeek();
      const saved = await editSpecies(user, row.id, edits);
      assert.equal(saved.length, 1, who(user));
      assert.equal(saved[0].scientific_name, row.scientific_name);
      assert.deepEqual(saved[0].updated_at, saved[0].changed_at);

      const stored = await storedSpecies(row.id);
      assert.deepEqual(only(stored, editedColumns), edits);
      assert.equal(stored.slug, row.id);
    }
  });

  test('saving with nothing different leaves updated_at alone', async () => {
    const row = await speciesFromLastWeek();
    assert.equal((await editSpecies(officer, row.id, only(row, editedColumns))).length, 1);
    assert.equal(await updatedAt(row.id), lastWeek);
  });

  test('everyone else changes nothing', async () => {
    const row = await speciesFromLastWeek();
    for (const user of [visitor, researcher, botanist]) {
      assert.deepEqual(await editSpecies(user, row.id, edits), [], who(user));
    }
    await assert.rejects(editSpecies(null, row.id, edits), notAllowed);
    assert.deepEqual(only(await storedSpecies(row.id), editedColumns), only(row, editedColumns));
    assert.equal(await updatedAt(row.id), lastWeek);
  });

  test("a species that isn't there gives back no rows", async () => {
    assert.deepEqual(await editSpecies(officer, 'testus-not-there', edits), []);
  });

  test('nobody can run the updated_at trigger through the API', async () => {
    const { rows } = await db.query(
      `SELECT
         has_function_privilege('anon', 'public.set_species_updated_at()', 'EXECUTE') AS anon,
         has_function_privilege('authenticated', 'public.set_species_updated_at()', 'EXECUTE')
           AS authenticated`,
    );
    assert.deepEqual(rows[0], { anon: false, authenticated: false });
  });

  test('the database turns down values the form never sends', async () => {
    const row = await speciesFromLastWeek();
    const bad = [
      [{ iucn_code: 'EX' }, '23514'],
      [{ family: null }, '23502'],
      [{ rough_area_only: null }, '23502'],
    ];
    for (const [change, code] of bad) {
      await assert.rejects(editSpecies(officer, row.id, { ...edits, ...change }), { code });
    }
    assert.equal(await updatedAt(row.id), lastWeek);
  });
});

describe('deleting a species from the website', () => {
  test('officers and admins delete one, and it leaves the public site', async () => {
    for (const user of [officer, admin]) {
      const row = websiteRow();
      await addSpecies(officer, row);
      assert.deepEqual(
        await deleteSpecies(user, row.id),
        [{ scientific_name: row.scientific_name }],
        who(user),
      );
      assert.equal(await storedSpecies(row.id), undefined);
      const sql = 'SELECT id FROM public.species_public WHERE id = $1';
      assert.deepEqual(await selectAs(db, null, sql, [row.id]), []);
    }
  });

  test('its records stay with their saved names, but only show the grid square', async () => {
    const row = websiteRow({ iucn_code: 'LC' });
    await addSpecies(officer, row);
    const recordId = await publishedRecordOf(row.id);
    assert.deepEqual(await publicSpot(recordId), exactSpot);

    assert.equal((await deleteSpecies(officer, row.id)).length, 1);
    const sql = 'SELECT species_slug, species_name, gps FROM public.records_public WHERE id = $1';
    assert.deepEqual(await selectAs(db, null, sql, [recordId]), [
      { species_slug: null, species_name: `Testus ${row.id}`, gps: spotSquare },
    ]);
  });

  test('everyone else deletes nothing', async () => {
    const row = websiteRow();
    await addSpecies(officer, row);
    for (const user of [visitor, researcher, botanist]) {
      assert.deepEqual(await deleteSpecies(user, row.id), [], who(user));
    }
    await assert.rejects(deleteSpecies(null, row.id), notAllowed);
    assert.equal((await storedSpecies(row.id)).scientific_name, row.scientific_name);
  });

  test("a species that isn't there gives back no rows", async () => {
    assert.deepEqual(await deleteSpecies(officer, 'testus-not-there'), []);
  });
});

describe('the views after 007', () => {
  test('still have the options 004 and 006 gave them', async () => {
    const { rows } = await db.query(
      `SELECT relname, reloptions FROM pg_class
       WHERE oid IN ('public.species_public'::regclass, 'public.records_public'::regclass,
         'public.species_staff'::regclass, 'public.records_staff'::regclass)`,
    );
    const options = Object.fromEntries(rows.map((row) => [row.relname, row.reloptions.sort()]));
    assert.deepEqual(options, {
      species_public: ['security_invoker=false'],
      records_public: ['security_barrier=true', 'security_invoker=false'],
      species_staff: ['security_invoker=true'],
      records_staff: ['security_invoker=true'],
    });
  });

  test('species_staff shows officers every column of the species table', async () => {
    assert.deepEqual(await columnsOf('species_staff'), await columnsOf('species'));
    const sql = 'SELECT rough_area_only FROM public.species_staff WHERE id = $1';
    assert.deepEqual(await selectAs(db, officer, sql, ['koompassia-excelsa']), [
      { rough_area_only: true },
    ]);
  });
});
