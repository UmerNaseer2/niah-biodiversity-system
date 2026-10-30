// Checks 014_photo_folder.sql: each record keeps the name of its photo folder, so the website can
// still find its photos after the account that sent it is deleted. That the folder is filled in
// by the server, that nobody can change it through the API, and that adding it to records from
// before 014 doesn't make them look edited.
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

// A made up spot near park HQ
const spot = { lat: 3.81391, lng: 113.77874, accuracyM: 8 };

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

/** Uploads a record like the phone does, at the made up spot, and gives back its ID. */
async function upload(database, user, extra = {}) {
  const row = { ...structuredClone(everyField.row), id: randomUUID(), gps: spot, ...extra };
  await insertAs(database, user, 'public.records', row);
  return row.id;
}

/** A record straight from the table as the postgres user. */
async function folderOf(database, id) {
  const { rows } = await database.query('SELECT * FROM public.records WHERE id = $1', [id]);
  return rows[0];
}

const notAllowed = { code: '42501', message: /permission denied/ };

describe('the photo folder', () => {
  test('a record uploaded like the phone does gets the account that sent it', async () => {
    const id = await upload(db, botanist);
    const row = await folderOf(db, id);
    assert.equal(row.submitted_by, botanist.id);
    assert.equal(row.photo_folder, botanist.id);

    // Officers and admins read it from records_staff, which is what the website uses
    for (const user of [officer, admin]) {
      assert.deepEqual(
        await selectAs(db, user, 'SELECT photo_folder FROM public.records_staff WHERE id = $1', [
          id,
        ]),
        [{ photo_folder: botanist.id }],
        user.name,
      );
    }
  });

  test('the folder stays when the account that sent it is deleted', async () => {
    const leaving = await addUser(db, { role: 'botanist', name: 'Leaving botanist' });
    const id = await upload(db, leaving);
    await db.query('DELETE FROM auth.users WHERE id = $1', [leaving.id]);

    const row = await folderOf(db, id);
    assert.equal(row.submitted_by, null, '005 still empties submitted_by');
    assert.equal(row.photo_folder, leaving.id);
    assert.deepEqual(
      await selectAs(db, officer, 'SELECT photo_folder FROM public.records_staff WHERE id = $1', [
        id,
      ]),
      [{ photo_folder: leaving.id }],
    );
  });

  test("the phone can't pick another account's folder", async () => {
    await assert.rejects(
      upload(db, botanist, { photo_folder: officer.id }),
      notAllowed,
      'the insert grant from 005 leaves it out',
    );
  });

  test('nobody can change the folder through the API', async () => {
    const id = await upload(db, botanist);
    for (const user of [admin, officer, botanist]) {
      await assert.rejects(
        asUser(db, user, (tx) =>
          tx.query('UPDATE public.records SET photo_folder = $1 WHERE id = $2', [user.id, id]),
        ),
        notAllowed,
        user.name,
      );
    }
    assert.equal((await folderOf(db, id)).photo_folder, botanist.id);

    const { rows } = await db.query(
      `SELECT has_function_privilege('authenticated', 'public.keep_photo_folder()', 'EXECUTE')
        AS allowed`,
    );
    assert.deepEqual(rows, [{ allowed: false }]);
  });

  test('a record added in the SQL editor gets its folder from submitted_by, if it has one', async () => {
    const withAccount = randomUUID();
    const withoutAccount = randomUUID();
    for (const [id, submittedBy] of [
      [withAccount, botanist.id],
      [withoutAccount, null],
    ]) {
      await db.query(
        `INSERT INTO public.records
           (id, species_name, condition, recorded_by, recorded_at, submitted_by)
         VALUES ($1, 'Testus sqlus', 'healthy', 'Test person', now(), $2)`,
        [id, submittedBy],
      );
    }
    assert.equal((await folderOf(db, withAccount)).photo_folder, botanist.id);
    assert.equal((await folderOf(db, withoutAccount)).photo_folder, null);
  });

  test("the public and other roles don't see it", async () => {
    const { rows } = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'records_public'
         AND column_name = 'photo_folder'`,
    );
    assert.deepEqual(rows, [], 'records_public names its columns');

    await upload(db, botanist);
    for (const user of [researcher, visitor]) {
      assert.deepEqual(
        await selectAs(db, user, 'SELECT photo_folder FROM public.records_staff'),
        [],
        user.name,
      );
    }
  });
});

describe('running the SQL files', () => {
  test("014 fills in older records' folders without making them look edited", async () => {
    const upTo013 = SQL_FILES.slice(0, SQL_FILES.indexOf('014_photo_folder.sql'));
    const older = await newDatabase(upTo013);
    try {
      const sender = await addUser(older, { role: 'botanist', name: 'Field botanist' });
      const gone = await addUser(older, { role: 'botanist', name: 'Gone botanist' });
      const editor = await addUser(older, { role: 'conservation_officer', name: 'Park officer' });
      const kept = await upload(older, sender);
      const lost = await upload(older, gone);
      await older.query('DELETE FROM auth.users WHERE id = $1', [gone.id]);
      const before = await folderOf(older, kept);
      const historyBefore = await older.query('SELECT * FROM public.record_history');

      await older.exec(readSql('014_photo_folder.sql'));

      const row = await folderOf(older, kept);
      assert.equal(row.photo_folder, sender.id);
      assert.deepEqual(row.updated_at, before.updated_at, "the record doesn't look edited");
      assert.equal(
        (await folderOf(older, lost)).photo_folder,
        null,
        'nothing is left to say where its photos are',
      );
      assert.deepEqual(
        (await older.query('SELECT * FROM public.record_history')).rows,
        historyBefore.rows,
        'no history rows for filling it in',
      );

      // The triggers from 008 and 013 are back on
      await asUser(older, editor, (tx) =>
        tx.query("UPDATE public.records SET condition = 'dead' WHERE id = $1", [kept]),
      );
      assert.notDeepEqual((await folderOf(older, kept)).updated_at, before.updated_at);
      const { rows } = await older.query(
        'SELECT changes FROM public.record_history WHERE record_id = $1',
        [kept],
      );
      assert.deepEqual(rows, [{ changes: { condition: { from: 'damaged', to: 'dead' } } }]);
    } finally {
      await older.close();
    }
  });

  test('running 014 again keeps the folders, and 002 still runs after it', async () => {
    const leaving = await addUser(db, { role: 'botanist', name: 'Another leaving botanist' });
    const id = await upload(db, leaving);
    await db.query('DELETE FROM auth.users WHERE id = $1', [leaving.id]);

    await db.exec(readSql('014_photo_folder.sql'));
    await db.exec(readSql('002_seed_data.sql'));
    assert.equal((await folderOf(db, id)).photo_folder, leaving.id);

    // Every trigger on records is on, and 014's is there once
    const { rows } = await db.query(
      `SELECT tgname, tgenabled FROM pg_trigger
       WHERE tgrelid = 'public.records'::regclass AND NOT tgisinternal
       ORDER BY tgname`,
    );
    assert.ok(
      rows.every((trigger) => trigger.tgenabled === 'O'),
      JSON.stringify(rows),
    );
    assert.equal(rows.filter((trigger) => trigger.tgname === 'keep_photo_folder').length, 1);
    const another = await upload(db, botanist);
    assert.equal((await folderOf(db, another)).photo_folder, botanist.id);
  });

  test("014 stops and changes nothing if 013 hasn't been run", async () => {
    const upTo012 = SQL_FILES.slice(0, SQL_FILES.indexOf('013_edit_history.sql'));
    const without013 = await newDatabase(upTo012);
    try {
      await assert.rejects(
        without013.exec(readSql('014_photo_folder.sql')),
        /014 needs 013_edit_history\.sql to be run first/,
      );
      const { rows } = await without013.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'photo_folder'`,
      );
      assert.deepEqual(rows, []);
    } finally {
      await without013.close();
    }
  });
});
