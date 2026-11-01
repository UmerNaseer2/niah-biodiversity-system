// Checks 020: losing the field staff role takes away your own record photos too, and people who
// aren't signed in can't call the helper functions.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, test } from 'node:test';
import {
  SQL_FILES,
  addUser,
  asUser,
  insertAs,
  newDatabase,
  readSql,
  selectAs,
} from './harness.js';

const FILE = '020_record_photo_access.sql';
const SEE_PHOTO = 'SELECT name FROM storage.objects WHERE name = $1';

let db;

before(async () => {
  db = await newDatabase();
});

function photoPath(owner) {
  return `${owner.id}/${randomUUID()}/1.jpg`;
}

async function uploadPhoto(user) {
  const name = photoPath(user);
  await insertAs(db, user, 'storage.objects', {
    bucket_id: 'record-photos',
    name,
    owner: user.id,
  });
  return name;
}

function setRole(user, role) {
  return db.query('UPDATE public.profiles SET role = $1 WHERE id = $2', [role, user.id]);
}

describe('own record photos after a role change', () => {
  test('a botanist sees their own photo, and other botanists do not', async () => {
    const botanist = await addUser(db, { role: 'botanist' });
    const other = await addUser(db, { role: 'botanist' });
    const name = await uploadPhoto(botanist);
    assert.equal((await selectAs(db, botanist, SEE_PHOTO, [name])).length, 1);
    assert.equal((await selectAs(db, other, SEE_PHOTO, [name])).length, 0);
  });

  for (const role of ['visitor', 'researcher']) {
    test(`a botanist made a ${role} can't see their own photo any more`, async () => {
      const botanist = await addUser(db, { role: 'botanist' });
      const name = await uploadPhoto(botanist);
      await setRole(botanist, role);
      assert.equal((await selectAs(db, botanist, SEE_PHOTO, [name])).length, 0);
    });
  }

  test('getting the role back brings the photo back', async () => {
    const botanist = await addUser(db, { role: 'botanist' });
    const name = await uploadPhoto(botanist);
    await setRole(botanist, 'visitor');
    await setRole(botanist, 'botanist');
    assert.equal((await selectAs(db, botanist, SEE_PHOTO, [name])).length, 1);
  });

  test('officers and admins still see every photo, and their own', async () => {
    const botanist = await addUser(db, { role: 'botanist' });
    const officer = await addUser(db, { role: 'conservation_officer' });
    const admin = await addUser(db, { role: 'admin' });
    const fromBotanist = await uploadPhoto(botanist);
    const fromOfficer = await uploadPhoto(officer);
    for (const user of [officer, admin]) {
      assert.equal((await selectAs(db, user, SEE_PHOTO, [fromBotanist])).length, 1);
      assert.equal((await selectAs(db, user, SEE_PHOTO, [fromOfficer])).length, 1);
    }
  });

  test('people who are not signed in still see none', async () => {
    const botanist = await addUser(db, { role: 'botanist' });
    const name = await uploadPhoto(botanist);
    assert.equal((await selectAs(db, null, SEE_PHOTO, [name])).length, 0);
  });
});

describe('who can call the helper functions', () => {
  function call(user, sql) {
    return asUser(db, user, (tx) => tx.query(sql));
  }

  const ROLE_CHECK = "SELECT public.has_any_role(ARRAY['admin'])";
  const PHOTOS_CHECK = "SELECT public.species_photos_ok('x', '[]'::jsonb)";

  test("people who aren't signed in can't call them", async () => {
    await assert.rejects(call(null, ROLE_CHECK), { code: '42501' });
    await assert.rejects(call(null, PHOTOS_CHECK), { code: '42501' });
  });

  test('a signed in user keeps them, because policies run them as that user', async () => {
    const visitor = await addUser(db);
    assert.equal((await call(visitor, ROLE_CHECK)).rows[0].has_any_role, false);
    assert.equal((await call(visitor, PHOTOS_CHECK)).rows[0].species_photos_ok, true);
  });

  test('nobody can call the trigger functions, and the triggers still fire', async () => {
    const visitor = await addUser(db, { name: 'Trigger check' });
    for (const user of [null, visitor]) {
      await assert.rejects(call(user, 'SELECT public.handle_new_user()'), { code: '42501' });
      await assert.rejects(call(user, 'SELECT public.sync_species_slug()'), { code: '42501' });
    }
    // addUser relies on the trigger on auth.users, so this row shows it fired
    const { rows } = await db.query('SELECT name FROM public.profiles WHERE id = $1', [visitor.id]);
    assert.equal(rows[0].name, 'Trigger check');
  });

  test("the public can still read the views that don't need sign in", async () => {
    for (const view of ['records_public', 'species_public', 'species_photos_public']) {
      await call(null, `SELECT * FROM public.${view} LIMIT 1`);
    }
  });

  test('an officer can still save a species with photos', async () => {
    const officer = await addUser(db, { role: 'conservation_officer' });
    const updated = await asUser(db, officer, (tx) =>
      tx.query(
        `UPDATE public.species SET photos = '[]'::jsonb
         WHERE id = (SELECT id FROM public.species LIMIT 1)`,
      ),
    );
    assert.equal(updated.affectedRows, 1);
  });
});

describe('running 020', () => {
  test('running it again changes nothing', async () => {
    const botanist = await addUser(db, { role: 'botanist' });
    const name = await uploadPhoto(botanist);
    await db.exec(readSql(FILE));
    assert.equal((await selectAs(db, botanist, SEE_PHOTO, [name])).length, 1);
    await setRole(botanist, 'visitor');
    assert.equal((await selectAs(db, botanist, SEE_PHOTO, [name])).length, 0);
  });

  test("it stops on its first line if 019 isn't there", async () => {
    const older = await newDatabase(
      SQL_FILES.slice(0, SQL_FILES.indexOf('019_public_record_details.sql')),
    );
    await assert.rejects(older.exec(readSql(FILE)), {
      message: /020 needs 019_public_record_details\.sql/,
    });
  });
});
