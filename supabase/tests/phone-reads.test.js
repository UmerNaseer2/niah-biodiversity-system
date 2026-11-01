// Checks what the phone reads back when it syncs (mobile/src/sync/supabase-api.ts): what officers
// decided about its records, the species list, and the name and role on the Profile tab. The phone
// sends these exact queries, so if a later SQL file takes a column away it should fail here first.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { addUser, asUser, insertAs, newDatabase, readFixture, selectAs } from './harness.js';

const { uploads } = readFixture('phone-upload.json');
const [everyField] = uploads;

// The same columns the phone asks for.
const READ_REVIEWS = 'SELECT id, status, review_notes FROM public.records WHERE id = ANY($1::uuid[])';
const READ_SPECIES =
  'SELECT id, scientific_name, common_names FROM public.species_public ORDER BY id LIMIT 500';
const READ_PROFILE = 'SELECT name, role FROM public.profiles WHERE id = $1';

let db;
let botanist;
let otherBotanist;
let visitor;
let officer;

before(async () => {
  db = await newDatabase();
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
  otherBotanist = await addUser(db, { role: 'botanist', name: 'Second botanist' });
  visitor = await addUser(db, { name: 'Visitor' });
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
});

after(async () => {
  await db.close();
});

async function uploadAs(user) {
  const row = { ...structuredClone(everyField.row), id: randomUUID() };
  await insertAs(db, user, 'public.records', row);
  return row.id;
}

function reviewAs(user, id, status, notes) {
  return asUser(db, user, (tx) =>
    tx.query('UPDATE public.records SET status = $2, review_notes = $3 WHERE id = $1', [
      id,
      status,
      notes,
    ]),
  );
}

describe('reading back what officers decided', () => {
  test('a new upload reads back as waiting, with no reason', async () => {
    const id = await uploadAs(botanist);
    assert.deepEqual(await selectAs(db, botanist, READ_REVIEWS, [[id]]), [
      { id, status: 'waiting', review_notes: null },
    ]);
  });

  test('a rejected record reads back with the reason the officer gave', async () => {
    const id = await uploadAs(botanist);
    await reviewAs(officer, id, 'rejected', 'The photos are too blurry.');
    assert.deepEqual(await selectAs(db, botanist, READ_REVIEWS, [[id]]), [
      { id, status: 'rejected', review_notes: 'The photos are too blurry.' },
    ]);
  });

  test('an approved record reads back as published', async () => {
    const id = await uploadAs(botanist);
    await reviewAs(officer, id, 'published', null);
    const [row] = await selectAs(db, botanist, READ_REVIEWS, [[id]]);
    assert.equal(row.status, 'published');
  });

  test("a botanist can't read the decision on someone else's waiting or rejected record", async () => {
    const waiting = await uploadAs(otherBotanist);
    const rejected = await uploadAs(otherBotanist);
    await reviewAs(officer, rejected, 'rejected', 'Wrong species.');
    assert.deepEqual(await selectAs(db, botanist, READ_REVIEWS, [[waiting, rejected]]), []);
  });

  test('a record that has gone from the server just reads back as nothing', async () => {
    assert.deepEqual(await selectAs(db, botanist, READ_REVIEWS, [[randomUUID()]]), []);
  });

  test('someone who lost the botanist role gets nothing back, and no error', async () => {
    const id = await uploadAs(botanist);
    await db.query("UPDATE public.profiles SET role = 'visitor' WHERE id = $1", [botanist.id]);
    try {
      assert.deepEqual(await selectAs(db, botanist, READ_REVIEWS, [[id]]), []);
    } finally {
      await db.query("UPDATE public.profiles SET role = 'botanist' WHERE id = $1", [botanist.id]);
    }
  });
});

describe('downloading the species list', () => {
  test('a signed in botanist can read the list the form suggests names from', async () => {
    const rows = await selectAs(db, botanist, READ_SPECIES);
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['common_names', 'id', 'scientific_name']);
      assert.equal(typeof row.id, 'string');
      assert.equal(typeof row.scientific_name, 'string');
    }
  });

  test('the same list works for a visitor account, so a new phone can read it', async () => {
    assert.deepEqual(
      await selectAs(db, visitor, READ_SPECIES),
      await selectAs(db, botanist, READ_SPECIES),
    );
  });
});

describe('the name and role on the Profile tab', () => {
  test('people can read their own', async () => {
    assert.deepEqual(await selectAs(db, botanist, READ_PROFILE, [botanist.id]), [
      { name: 'Field botanist', role: 'botanist' },
    ]);
    assert.deepEqual(await selectAs(db, visitor, READ_PROFILE, [visitor.id]), [
      { name: 'Visitor', role: 'visitor' },
    ]);
  });
});
