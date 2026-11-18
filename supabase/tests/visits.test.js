// Checks 028_record_visits.sql: a later visit to a plant is its own record with visit_of set to
// the plant's first record. Who can upload one, that visits stay one level deep, what happens when
// the first record is deleted, and what the public sees of a plant's visits.
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

// Made up points. Nothing here is a real plant.
const gps = { lat: 3.81391, lng: 113.77874, accuracyM: 8 };

const oneLevel = { code: '23514', constraint: 'records_visit_of_check' };

let db;
let botanist;
let officer;
let admin;
let visitor;

before(async () => {
  db = await newDatabase();
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
  admin = await addUser(db, { role: 'admin', name: 'Park admin' });
  visitor = await addUser(db, { name: 'Visitor' });
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
});

after(async () => {
  await db.close();
});

/** The "every field filled in" upload with a new ID, like the phone sends. */
function freshRow(changes = {}) {
  return { ...structuredClone(everyField.row), id: randomUUID(), ...changes };
}

function upload(user, row) {
  return insertAs(db, user, 'public.records', row);
}

/** Uploads a first record as the botanist and gives back its ID. */
async function firstRecord(changes = {}) {
  const row = freshRow(changes);
  await upload(botanist, row);
  return row.id;
}

/** Uploads a visit to a record as the botanist and gives back its ID. */
async function visitTo(firstId, changes = {}) {
  const row = freshRow({ visit_of: firstId, ...changes });
  await upload(botanist, row);
  return row.id;
}

async function stored(id) {
  const { rows } = await db.query('SELECT * FROM public.records WHERE id = $1', [id]);
  return rows[0];
}

async function setStatus(id, status) {
  await db.query('UPDATE public.records SET status = $2 WHERE id = $1', [id, status]);
}

function deleteAs(user, id) {
  return asUser(db, user, (tx) => tx.query('DELETE FROM public.records WHERE id = $1', [id]));
}

describe('uploading a visit', () => {
  test('a botanist uploads a visit, and it waits for review with its own tag code', async () => {
    const firstId = await firstRecord();
    const visitId = await visitTo(firstId, { condition: 'healthy' });
    const visit = await stored(visitId);
    assert.equal(visit.visit_of, firstId);
    assert.equal(visit.status, 'waiting');
    assert.equal(visit.condition, 'healthy');
    assert.equal(visit.tag_code, `NNP-${visitId.slice(0, 6).toUpperCase()}`);
    // The first record isn't touched
    assert.equal((await stored(firstId)).condition, everyField.row.condition);
  });

  test('officers and admins can upload a visit too', async () => {
    const firstId = await firstRecord();
    for (const user of [officer, admin]) {
      const row = freshRow({ visit_of: firstId });
      await upload(user, row);
      assert.equal((await stored(row.id)).visit_of, firstId, user.name);
    }
  });

  test("visitors and people who aren't signed in can't upload one", async () => {
    const firstId = await firstRecord();
    await assert.rejects(upload(visitor, freshRow({ visit_of: firstId })), { code: '42501' });
    await assert.rejects(upload(null, freshRow({ visit_of: firstId })), { code: '42501' });
  });

  test('a record without visit_of is a first record, as before', async () => {
    const id = await firstRecord();
    assert.equal((await stored(id)).visit_of, null);
  });

  test("a first record that isn't up yet gives 23503, so the phone tries again later", async () => {
    await assert.rejects(upload(botanist, freshRow({ visit_of: randomUUID() })), {
      code: '23503',
      constraint: 'records_visit_of_fkey',
    });
  });

  test('a visit to a record an officer deleted goes up as a record on its own', async () => {
    const firstId = await firstRecord();
    await deleteAs(officer, firstId);
    const visitId = await visitTo(firstId);
    assert.equal((await stored(visitId)).visit_of, null);
  });
});

describe('visits stay one level deep', () => {
  test("a record can't be a visit to itself", async () => {
    const row = freshRow();
    await assert.rejects(upload(botanist, { ...row, visit_of: row.id }), oneLevel);
  });

  test("a visit can't point at another visit", async () => {
    const firstId = await firstRecord();
    const visitId = await visitTo(firstId);
    await assert.rejects(upload(botanist, freshRow({ visit_of: visitId })), {
      ...oneLevel,
      message: /first record of the plant/,
    });
  });

  test("a record that has visits can't become a visit, even in the SQL editor", async () => {
    const plantA = await firstRecord();
    const plantB = await firstRecord();
    await visitTo(plantB);
    await assert.rejects(
      db.query('UPDATE public.records SET visit_of = $1 WHERE id = $2', [plantA, plantB]),
      { ...oneLevel, message: /already has visits/ },
    );
    // The SQL editor can still move a visit to another plant
    const visitId = await visitTo(plantB);
    await db.query('UPDATE public.records SET visit_of = $1 WHERE id = $2', [plantA, visitId]);
    assert.equal((await stored(visitId)).visit_of, plantA);
  });

  test('nobody can change visit_of through the API', async () => {
    const plantA = await firstRecord();
    const visitId = await visitTo(await firstRecord());
    for (const user of [officer, admin, botanist]) {
      await assert.rejects(
        selectAs(db, user, 'UPDATE public.records SET visit_of = $1 WHERE id = $2', [
          plantA,
          visitId,
        ]),
        { code: '42501' },
        user.name,
      );
    }
  });

  test('nobody can run the check through the API', async () => {
    const { rows } = await db.query(
      `SELECT has_function_privilege('anon', 'public.check_visit_of()', 'EXECUTE') AS anon,
         has_function_privilege('authenticated', 'public.check_visit_of()', 'EXECUTE')
           AS authenticated`,
    );
    assert.deepEqual(rows[0], { anon: false, authenticated: false });
  });
});

describe('deleting a first record', () => {
  test('its visits stay, as records on their own, and the change shows in their history', async () => {
    const firstId = await firstRecord();
    const visitId = await visitTo(firstId);
    const before = await stored(visitId);
    assert.equal((await deleteAs(officer, firstId)).affectedRows, 1);

    const visit = await stored(visitId);
    assert.equal(visit.visit_of, null);
    assert.ok(visit.updated_at >= before.updated_at);
    const { rows } = await db.query(
      'SELECT changes FROM public.record_history WHERE record_id = $1',
      [visitId],
    );
    assert.deepEqual(
      rows.map((row) => row.changes.visit_of),
      [{ from: firstId, to: null }],
    );
  });
});

describe('what staff see', () => {
  test('officers and admins read visit_of in records_staff', async () => {
    const firstId = await firstRecord();
    const visitId = await visitTo(firstId);
    for (const user of [officer, admin]) {
      const rows = await selectAs(
        db,
        user,
        'SELECT id FROM public.records_staff WHERE visit_of = $1',
        [firstId],
      );
      assert.deepEqual(
        rows.map((row) => row.id),
        [visitId],
        user.name,
      );
    }
  });

  test('a botanist and a visitor still get nothing from records_staff', async () => {
    for (const user of [botanist, visitor]) {
      assert.deepEqual(
        await selectAs(db, user, 'SELECT id FROM public.records_staff WHERE visit_of IS NOT NULL'),
        [],
        user.name,
      );
    }
  });
});

describe('what the public sees', () => {
  /** A published plant with one published visit, one waiting visit and one turned down. */
  async function plantWithVisits(slug, name) {
    const at = '2031-05-01T02:03:04Z';
    const firstId = await firstRecord({ species_slug: slug, species_name: name, gps });
    await setStatus(firstId, 'published');
    const approved = await visitTo(firstId, {
      species_slug: 'testus-common',
      species_name: 'Testus common',
      condition: 'healthy',
      gps,
      recorded_at: at,
    });
    await setStatus(approved, 'published');
    const waiting = await visitTo(firstId);
    const turnedDown = await visitTo(firstId);
    await setStatus(turnedDown, 'rejected');
    return { firstId, approved, waiting, turnedDown };
  }

  const linksSql = 'SELECT id, visit_of FROM public.record_visits_public WHERE visit_of = $1';
  const recordSql = 'SELECT gps, recorded_at, condition FROM public.records_public WHERE id = $1';

  test('only approved visits are listed, for visitors and people not signed in', async () => {
    const plant = await plantWithVisits('testus-common', 'Testus common');
    for (const user of [null, visitor, botanist]) {
      const rows = await selectAs(db, user, linksSql, [plant.firstId]);
      assert.deepEqual(rows, [{ id: plant.approved, visit_of: plant.firstId }]);
    }
    const waiting = await selectAs(db, null, recordSql, [plant.waiting]);
    assert.deepEqual(waiting, []);
  });

  test("a visit to a plant that isn't approved isn't linked to it", async () => {
    const plant = await plantWithVisits('testus-common', 'Testus common');
    await setStatus(plant.firstId, 'waiting');
    assert.deepEqual(await selectAs(db, null, linksSql, [plant.firstId]), []);
  });

  test('a visit to a plant with a shown spot shows its own spot and time', async () => {
    const plant = await plantWithVisits('testus-common', 'Testus common');
    const [visit] = await selectAs(db, null, recordSql, [plant.approved]);
    assert.deepEqual(visit.gps, gps);
    assert.equal(visit.recorded_at.toISOString(), '2031-05-01T02:03:04.000Z');
    assert.equal(visit.condition, 'healthy');
  });

  test("a visit to a hidden plant never shows the exact spot, even under a common name", async () => {
    const plant = await plantWithVisits('testus-rare', 'Testus rare');
    const [visit] = await selectAs(db, null, recordSql, [plant.approved]);
    assert.notEqual(visit.gps.lat, gps.lat);
    assert.equal(visit.gps.accuracyM, 440);
    // Only the day, in park time
    assert.equal(visit.recorded_at.toISOString(), '2031-04-30T16:00:00.000Z');
  });

  test('a visit to a plant set to rough area only hides its spot too', async () => {
    await db.query(
      `INSERT INTO public.species (id, slug, scientific_name, family, common_names, iucn_code)
       VALUES ('testus-rough', 'testus-rough', 'Testus rough', 'Testaceae', '{Test plant}', 'LC')`,
    );
    await db.query("UPDATE public.species SET rough_area_only = true WHERE id = 'testus-rough'");
    const plant = await plantWithVisits('testus-rough', 'Testus rough');
    const [visit] = await selectAs(db, null, recordSql, [plant.approved]);
    assert.equal(visit.gps.accuracyM, 440);
  });

  test('records_public and record_visits_public read the same way as the other public views', async () => {
    const { rows } = await db.query(
      `SELECT relname, reloptions FROM pg_class
       WHERE oid IN ('public.records_public'::regclass, 'public.record_visits_public'::regclass)`,
    );
    for (const row of rows) {
      assert.ok(row.reloptions.includes('security_barrier=true'), row.relname);
      assert.ok(row.reloptions.includes('security_invoker=false'), row.relname);
    }
    for (const role of ['anon', 'authenticated']) {
      const { rows: writable } = await db.query(
        `SELECT p FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS p
         WHERE has_table_privilege($1, 'public.record_visits_public', p)`,
        [role],
      );
      assert.deepEqual(writable, [], role);
    }
  });
});

describe('running 028', () => {
  test('running it again keeps everything working', async () => {
    const firstId = await firstRecord();
    await db.exec(readSql('028_record_visits.sql'));
    await db.exec(readSql('028_record_visits.sql'));
    const visitId = await visitTo(firstId);
    assert.equal((await stored(visitId)).visit_of, firstId);
    await assert.rejects(upload(botanist, freshRow({ visit_of: visitId })), oneLevel);
    const { rows } = await db.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.records'::regclass AND conname LIKE 'records_visit_of%'
       ORDER BY 1`,
    );
    assert.deepEqual(
      rows.map((row) => row.conname),
      ['records_visit_of_check', 'records_visit_of_fkey'],
    );
  });

  test('019 can still run again after it, and 028 after that puts the visit rule back', async () => {
    await db.exec(readSql('019_public_record_details.sql'));
    await db.exec(readSql('028_record_visits.sql'));
    const { rows } = await db.query(
      `SELECT pg_get_viewdef('public.records_public'::regclass) AS definition`,
    );
    assert.match(rows[0].definition, /visit_of/);
  });

  test("028 stops and changes nothing if 027 hasn't been run", async () => {
    const without027 = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('027_iot_daily_summary.sql')),
    );
    try {
      await assert.rejects(without027.exec(readSql('028_record_visits.sql')), {
        message: /028 needs 027_iot_daily_summary\.sql to be run first/,
      });
      const { rows } = await without027.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'visit_of'`,
      );
      assert.deepEqual(rows, []);
    } finally {
      await without027.close();
    }
  });
});
