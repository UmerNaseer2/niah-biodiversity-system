// Checks 029_find_plant_by_tag.sql: field staff can find a plant by its tag when someone else
// recorded it, see only what they need to add a visit, and then upload that visit.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import {
  addUser,
  asUser,
  insertAs,
  newDatabase,
  readFixture,
  readSql,
  selectAs,
  SQL_FILES,
} from './harness.js';

const { uploads } = readFixture('phone-upload.json');
const [everyField] = uploads;

let db;
let botanist;
let otherBotanist;
let officer;
let admin;
let visitor;

before(async () => {
  db = await newDatabase();
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
  otherBotanist = await addUser(db, { role: 'botanist', name: 'Second botanist' });
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
  admin = await addUser(db, { role: 'admin', name: 'Park admin' });
  visitor = await addUser(db, { name: 'Visitor' });
});

after(async () => {
  await db.close();
});

/** The "every field filled in" upload with a new ID, like the phone sends. */
function freshRow(changes = {}) {
  return { ...structuredClone(everyField.row), id: randomUUID(), ...changes };
}

/** Uploads a record as this user and gives back its ID. */
async function upload(user, changes = {}) {
  const row = freshRow(changes);
  await insertAs(db, user, 'public.records', row);
  return row.id;
}

function tagOf(id) {
  return `NNP-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function find(user, code) {
  return selectAs(db, user, 'SELECT * FROM public.find_plant_by_tag($1)', [code]);
}

describe('finding a plant someone else recorded', () => {
  test("a botanist finds another botanist's plant that's still waiting for review", async () => {
    const id = await upload(otherBotanist);
    // They can't read it the normal way (006)
    assert.deepEqual(
      await selectAs(db, botanist, 'SELECT id FROM public.records WHERE id = $1', [id]),
      [],
    );
    const [plant, ...more] = await find(botanist, tagOf(id));
    assert.equal(more.length, 0);
    assert.equal(plant.id, id);
    assert.equal(plant.tag_code, tagOf(id));
    assert.equal(plant.species_name, everyField.row.species_name);
    assert.equal(plant.common_name, everyField.row.common_name);
    assert.equal(plant.species_slug, everyField.row.species_slug);
    assert.equal(plant.condition, everyField.row.condition);
    assert.equal(plant.status, 'waiting');
    assert.equal(plant.visit_count, 0);
    assert.equal(plant.last_visit_at, null);
    assert.equal(plant.last_visit_condition, null);
  });

  test('it never gives back the spot, the notes, the photos or who recorded it', async () => {
    const id = await upload(otherBotanist);
    const [plant] = await find(botanist, tagOf(id));
    assert.deepEqual(Object.keys(plant).sort(), [
      'common_name',
      'condition',
      'id',
      'last_visit_at',
      'last_visit_condition',
      'recorded_at',
      'species_name',
      'species_slug',
      'status',
      'tag_code',
      'visit_count',
    ]);
  });

  test('officers and admins can look up a plant too', async () => {
    const id = await upload(botanist);
    for (const user of [officer, admin]) {
      const [plant] = await find(user, tagOf(id));
      assert.equal(plant?.id, id, user.name);
    }
  });

  test('the code can be typed in lower case and with spaces around it', async () => {
    const id = await upload(otherBotanist);
    const [plant] = await find(botanist, `  ${tagOf(id).toLowerCase()} `);
    assert.equal(plant?.id, id);
  });

  test('a code nobody has, or something that isn\'t a tag code, finds nothing', async () => {
    assert.deepEqual(await find(botanist, 'NNP-000000'), []);
    assert.deepEqual(await find(botanist, 'NNP-12'), []);
    assert.deepEqual(await find(botanist, "NNP-ABCDEF' OR true --"), []);
    assert.deepEqual(await find(botanist, ''), []);
    assert.deepEqual(await find(botanist, null), []);
  });

  test("a visit's own code gives the plant it's a visit to, with the newest visit", async () => {
    const firstId = await upload(otherBotanist);
    await upload(officer, {
      visit_of: firstId,
      condition: 'healthy',
      recorded_at: '2026-11-01T02:00:00Z',
    });
    const newest = await upload(otherBotanist, {
      visit_of: firstId,
      condition: 'dead',
      recorded_at: '2026-11-10T02:00:00Z',
    });
    for (const code of [tagOf(firstId), tagOf(newest)]) {
      const [plant] = await find(botanist, code);
      assert.equal(plant.id, firstId, code);
      assert.equal(plant.visit_count, 2);
      assert.equal(new Date(plant.last_visit_at).toISOString(), '2026-11-10T02:00:00.000Z');
      assert.equal(plant.last_visit_condition, 'dead');
    }
  });

  test('approved and rejected plants are found too, with their status', async () => {
    const approved = await upload(otherBotanist);
    const rejected = await upload(otherBotanist);
    await db.query("UPDATE public.records SET status = 'published' WHERE id = $1", [approved]);
    await db.query("UPDATE public.records SET status = 'rejected' WHERE id = $1", [rejected]);
    assert.equal((await find(botanist, tagOf(approved)))[0].status, 'published');
    assert.equal((await find(botanist, tagOf(rejected)))[0].status, 'rejected');
  });

  test("a plant an officer deleted isn't found", async () => {
    const id = await upload(otherBotanist);
    await asUser(db, officer, (tx) => tx.query('DELETE FROM public.records WHERE id = $1', [id]));
    assert.deepEqual(await find(botanist, tagOf(id)), []);
  });
});

describe('who can look up a plant', () => {
  test("visitors and people who aren't signed in can't", async () => {
    const id = await upload(botanist);
    await assert.rejects(find(visitor, tagOf(id)), { code: '42501' });
    await assert.rejects(find(null, tagOf(id)), { code: '42501' });
  });
});

describe('adding a visit to a plant found this way', () => {
  test("a botanist uploads a visit to a plant they can't read, and still can't read it", async () => {
    const firstId = await upload(otherBotanist);
    const [plant] = await find(botanist, tagOf(firstId));
    const visitId = await upload(botanist, { visit_of: plant.id, condition: 'damaged' });
    const { rows } = await db.query('SELECT visit_of, status FROM public.records WHERE id = $1', [
      visitId,
    ]);
    assert.deepEqual(rows[0], { visit_of: firstId, status: 'waiting' });
    assert.deepEqual(
      await selectAs(db, botanist, 'SELECT id FROM public.records WHERE id = $1', [firstId]),
      [],
    );
    // The botanist sees their own visit
    assert.equal(
      (await selectAs(db, botanist, 'SELECT id FROM public.records WHERE id = $1', [visitId]))
        .length,
      1,
    );
    const [after] = await find(botanist, tagOf(firstId));
    assert.equal(after.visit_count, 1);
    assert.equal(after.last_visit_condition, 'damaged');
  });
});

describe('running 029', () => {
  test('running it again keeps everything working', async () => {
    const again = await newDatabase();
    try {
      await again.exec(readSql('029_find_plant_by_tag.sql'));
      const someone = await addUser(again, { role: 'botanist' });
      const row = freshRow();
      await insertAs(again, someone, 'public.records', row);
      const rows = await selectAs(again, someone, 'SELECT id FROM public.find_plant_by_tag($1)', [
        tagOf(row.id),
      ]);
      assert.equal(rows[0]?.id, row.id);
    } finally {
      await again.close();
    }
  });

  test("029 stops and changes nothing if 028 hasn't been run", async () => {
    const before028 = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('028_record_visits.sql')),
    );
    try {
      await assert.rejects(before028.exec(readSql('029_find_plant_by_tag.sql')), /029 needs 028/);
      const { rows } = await before028.query(
        "SELECT 1 FROM pg_proc WHERE proname = 'find_plant_by_tag'",
      );
      assert.equal(rows.length, 0);
    } finally {
      await before028.close();
    }
  });
});
