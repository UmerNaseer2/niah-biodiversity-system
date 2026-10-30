// Checks 005_phone_sync.sql: who can upload records and photos, what the database turns down, and
// the errors the phone gets back, since the phone decides what to do next from them (see
// docs/sync-design.md). Also checks 010_deleted_records.sql, which turns down a record an officer
// deleted.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import {
  addUser,
  asUser,
  idStartingWith,
  insertAs,
  newDatabase,
  readFixture,
  readSql,
  selectAs,
  SQL_FILES,
} from './harness.js';

const { uploads } = readFixture('phone-upload.json');
const [everyField, unknownSpecies, typedName] = uploads;

// The slug the server keeps for each upload. durio-graveolens is on the phone's species list but
// not in 002, so the server clears it.
const savedSlug = {
  [everyField.name]: 'eusideroxylon-zwageri',
  [unknownSpecies.name]: null,
  [typedName.name]: null,
};

let db;
let botanist;
let otherBotanist;
let visitor;
let officer;
let admin;

before(async () => {
  db = await newDatabase();
  botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
  otherBotanist = await addUser(db, { role: 'botanist', name: 'Second botanist' });
  visitor = await addUser(db, { name: 'Visitor' });
  officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
  admin = await addUser(db, { role: 'admin', name: 'Park admin' });
});

after(async () => {
  await db.close();
});

/** The "every field filled in" upload with a new ID, so each test uploads its own record. */
function freshRow(changes = {}) {
  return { ...structuredClone(everyField.row), id: randomUUID(), ...changes };
}

function upload(user, row) {
  return insertAs(db, user, 'public.records', row);
}

/** Reads a record straight from the table as the postgres user, so no rules get in the way. */
async function storedRecord(id) {
  const { rows } = await db.query('SELECT * FROM public.records WHERE id = $1', [id]);
  return rows[0];
}

describe('uploading records from the phone', () => {
  for (const { name, record, row } of uploads) {
    test(`a botanist's upload goes in and waits for review (${name})`, async () => {
      await upload(botanist, row);
      const saved = await storedRecord(row.id);

      assert.equal(saved.tag_code, record.tagCode);
      assert.equal(saved.species_name, row.species_name);
      assert.equal(saved.species_slug, savedSlug[name]);
      assert.equal(saved.common_name, row.common_name);
      assert.equal(saved.height_m === null ? null : Number(saved.height_m), row.height_m);
      assert.equal(saved.condition, row.condition);
      assert.equal(saved.notes, row.notes);
      assert.deepEqual(saved.gps, row.gps);
      assert.equal(saved.photo_count, row.photo_count);
      assert.equal(saved.recorded_at.toISOString(), row.recorded_at);

      // Filled in by the server, whatever the phone sends.
      assert.equal(saved.status, 'waiting');
      assert.equal(saved.recorded_by, botanist.name);
      assert.equal(saved.submitted_by, botanist.id);
      assert.ok(saved.uploaded_at instanceof Date);
      assert.equal(saved.review_notes, null);
      assert.equal(saved.reviewed_by, null);
      assert.equal(saved.reviewed_at, null);
    });
  }

  test('officers and admins can upload too, in their own names', async () => {
    for (const user of [officer, admin]) {
      const row = freshRow();
      await upload(user, row);
      const saved = await storedRecord(row.id);
      assert.equal(saved.recorded_by, user.name);
      assert.equal(saved.submitted_by, user.id);
      assert.equal(saved.status, 'waiting');
    }
  });

  test('uploading the same record twice keeps one row and says the ID is taken', async () => {
    const row = freshRow();
    await upload(botanist, row);
    // The phone reads "records_pkey" in the message as "this record is already up there".
    await assert.rejects(upload(botanist, row), {
      code: '23505',
      constraint: 'records_pkey',
      message: /"records_pkey"/,
    });
    const { rows } = await db.query(
      'SELECT count(*)::int AS copies FROM public.records WHERE id = $1',
      [row.id],
    );
    assert.equal(rows[0].copies, 1);
  });

  test('a record sent twice gets the ID error even if the ID rule is newer', async () => {
    // Postgres checks unique rules in the order they were made, unless one is DEFERRABLE. The tag
    // code rule is, so it's checked last. Making the primary key again here makes it the newer
    // rule, and the phone should still get records_pkey back.
    const fresh = await newDatabase();
    try {
      await fresh.exec(`
        ALTER TABLE public.records DROP CONSTRAINT records_pkey;
        ALTER TABLE public.records ADD CONSTRAINT records_pkey PRIMARY KEY (id);
      `);
      const user = await addUser(fresh, { role: 'botanist', name: 'Field botanist' });
      const row = freshRow();
      await insertAs(fresh, user, 'public.records', row);
      await assert.rejects(insertAs(fresh, user, 'public.records', row), {
        code: '23505',
        constraint: 'records_pkey',
      });
    } finally {
      await fresh.close();
    }
  });

  test('two different records with the same tag code are turned down', async () => {
    await upload(botanist, freshRow({ id: idStartingWith('abcdef') }));
    await assert.rejects(upload(otherBotanist, freshRow({ id: idStartingWith('abcdef') })), {
      code: '23505',
      constraint: 'records_tag_code_key',
      message: /"records_tag_code_key"/,
    });
  });

  test("the phone can't fill in the columns the server looks after", async () => {
    const serverColumns = {
      status: 'published',
      recorded_by: 'Somebody else',
      submitted_by: otherBotanist.id,
      uploaded_at: '2020-01-01T00:00:00.000Z',
      review_notes: 'Looks fine',
      reviewed_by: 'Park officer',
      reviewed_at: '2026-10-16T03:00:00.000Z',
      photo_urls: ['https://example.test/photo.jpg'],
    };
    for (const [column, value] of Object.entries(serverColumns)) {
      await assert.rejects(
        upload(botanist, freshRow({ [column]: value })),
        { code: '42501', message: /permission denied/ },
        column,
      );
    }
    await assert.rejects(upload(botanist, freshRow({ tag_code: 'NNP-000000' })), {
      code: '428C9',
    });
  });

  test("visitors and people who aren't signed in can't upload", async () => {
    await assert.rejects(upload(visitor, freshRow()), {
      code: '42501',
      message: /row-level security/,
    });
    await assert.rejects(upload(null, freshRow()), {
      code: '42501',
      message: /permission denied/,
    });
  });

  test('the database turns down values the phone should never send', async () => {
    const gps = everyField.row.gps;
    const gpsCheck = 'records_gps_check';
    const badValues = [
      ['a condition not on the list', { condition: 'burnt' }, 'records_condition_check'],
      ['a height of 0', { height_m: 0 }, 'records_height_m_check'],
      ['a negative height', { height_m: -2 }, 'records_height_m_check'],
      ['a blank species name', { species_name: '   ' }, 'records_species_name_check'],
      ['a long species name', { species_name: 'x'.repeat(201) }, 'records_species_name_check'],
      ['a long common name', { common_name: 'x'.repeat(201) }, 'records_common_name_check'],
      ['long notes', { notes: 'x'.repeat(2001) }, 'records_notes_check'],
      ['a negative photo count', { photo_count: -1 }, 'records_photo_count_check'],
      ['a location as text', { gps: '3.81,113.78' }, gpsCheck],
      ['a location as a list', { gps: [3.81, 113.78] }, gpsCheck],
      ['no accuracy', { gps: { lat: 3.81, lng: 113.78 } }, gpsCheck],
      ['an empty latitude', { gps: { ...gps, lat: null } }, gpsCheck],
      ['a latitude as text', { gps: { ...gps, lat: '3.81' } }, gpsCheck],
      ['a latitude past 90', { gps: { ...gps, lat: 200 } }, gpsCheck],
      ['a longitude past -180', { gps: { ...gps, lng: -181 } }, gpsCheck],
      ['a negative accuracy', { gps: { ...gps, accuracyM: -1 } }, gpsCheck],
      ['an accuracy as text', { gps: { ...gps, accuracyM: '8' } }, gpsCheck],
      ['a capture time as a number', { gps: { ...gps, capturedAt: 1 } }, gpsCheck],
      ['a long capture time', { gps: { ...gps, capturedAt: 'x'.repeat(41) } }, gpsCheck],
      ['an extra location field', { gps: { ...gps, altitude: 40 } }, gpsCheck],
    ];
    for (const [label, changes, constraint] of badValues) {
      const row = freshRow(changes);
      await assert.rejects(upload(botanist, row), { code: '23514', constraint }, label);
    }

    await assert.rejects(upload(botanist, freshRow({ recorded_at: null })), {
      code: '23502',
      message: /"recorded_at"/,
    });
    await assert.rejects(upload(botanist, freshRow({ species_name: null, species_slug: null })), {
      code: '23502',
      message: /"species_name"/,
    });
    await assert.rejects(upload(botanist, freshRow({ height_m: 1000 })), { code: '22003' });
  });

  test('a location without a capture time is fine, like the seed records', async () => {
    const { lat, lng, accuracyM } = everyField.row.gps;
    const row = freshRow({ gps: { lat, lng, accuracyM } });
    await upload(botanist, row);
    assert.deepEqual((await storedRecord(row.id)).gps, { lat, lng, accuracyM });
  });

  test('a new record stays off the public view until an officer publishes it', async () => {
    const row = freshRow();
    await upload(botanist, row);
    const sql = 'SELECT gps FROM public.records_public WHERE id = $1';
    assert.deepEqual(await selectAs(db, null, sql, [row.id]), []);

    await db.query("UPDATE public.records SET status = 'published' WHERE id = $1", [row.id]);
    const published = await selectAs(db, null, sql, [row.id]);
    assert.equal(published.length, 1);
    // Belian is threatened, so the public only gets the middle of its grid square. Worked out by
    // hand: 3.8152 and 113.7801 sit in the squares that start at 3.812 and 113.780.
    assert.deepEqual(published[0].gps, { lat: 3.814, lng: 113.782, accuracyM: 440 });
  });

  test('deleting a species keeps its records and only clears the slug', async () => {
    await db.query(
      `INSERT INTO public.species (id, scientific_name, family, iucn_code)
       VALUES ('ficus-benjamina', 'Ficus benjamina', 'Moraceae', 'LC')`,
    );
    const row = freshRow({
      species_slug: 'ficus-benjamina',
      species_name: 'Ficus benjamina',
      common_name: null,
    });
    await upload(botanist, row);
    assert.equal((await storedRecord(row.id)).species_slug, 'ficus-benjamina');

    await db.query("DELETE FROM public.species WHERE id = 'ficus-benjamina'");
    const saved = await storedRecord(row.id);
    assert.equal(saved.species_slug, null);
    assert.equal(saved.species_name, 'Ficus benjamina');
  });
});

describe('a record an officer deleted', () => {
  /** Deletes a record the way the website's delete page does, and says how many rows went. */
  async function deleteAs(user, id) {
    const result = await asUser(db, user, (tx) =>
      tx.query('DELETE FROM public.records WHERE id = $1', [id]),
    );
    return result.affectedRows;
  }

  async function storedDeletion(id) {
    const { rows } = await db.query('SELECT * FROM public.deleted_records WHERE id = $1', [id]);
    return rows[0];
  }

  test('is remembered with who deleted it and when, and nothing else', async () => {
    const row = freshRow();
    await upload(botanist, row);
    assert.equal(await deleteAs(officer, row.id), 1);

    const deletion = await storedDeletion(row.id);
    assert.deepEqual(Object.keys(deletion).sort(), ['deleted_at', 'deleted_by', 'id']);
    assert.equal(deletion.deleted_by, officer.id);
    assert.ok(deletion.deleted_at instanceof Date);
    assert.equal(await storedRecord(row.id), undefined);
  });

  test("can't be uploaded again, and the phone can tell why", async () => {
    const row = freshRow();
    await upload(botanist, row);
    await deleteAs(admin, row.id);

    // The phone reads "deleted_records_pkey" as "an officer deleted this", where "records_pkey"
    // would mean it went up before.
    for (const user of [botanist, officer]) {
      await assert.rejects(
        upload(user, row),
        {
          code: '23505',
          constraint: 'deleted_records_pkey',
          message: /"deleted_records_pkey"/,
        },
        user.name,
      );
    }
    assert.equal(await storedRecord(row.id), undefined);
  });

  test("a botanist can't delete their own record, so it isn't remembered", async () => {
    const row = freshRow();
    await upload(botanist, row);
    assert.equal(await deleteAs(botanist, row.id), 0);
    assert.equal(await storedDeletion(row.id), undefined);
    assert.ok(await storedRecord(row.id));
  });

  test('only officers and admins can see the deleted records', async () => {
    const row = freshRow();
    await upload(botanist, row);
    await deleteAs(officer, row.id);

    const sql = 'SELECT id FROM public.deleted_records WHERE id = $1';
    for (const user of [officer, admin]) {
      assert.equal((await selectAs(db, user, sql, [row.id])).length, 1, user.name);
    }
    for (const user of [botanist, visitor]) {
      assert.equal((await selectAs(db, user, sql, [row.id])).length, 0, user.name);
    }
    await assert.rejects(selectAs(db, null, sql, [row.id]), {
      code: '42501',
      message: /permission denied/,
    });
  });

  test('nobody can change the list through the API', async () => {
    const row = freshRow();
    await upload(botanist, row);
    await deleteAs(officer, row.id);

    const notAllowed = { code: '42501', message: /permission denied/ };
    for (const user of [admin, officer, botanist]) {
      await assert.rejects(
        insertAs(db, user, 'public.deleted_records', { id: randomUUID() }),
        notAllowed,
        `${user.name} adds`,
      );
      await assert.rejects(
        selectAs(db, user, 'DELETE FROM public.deleted_records WHERE id = $1', [row.id]),
        notAllowed,
        `${user.name} removes`,
      );
      await assert.rejects(
        selectAs(db, user, 'UPDATE public.deleted_records SET deleted_by = NULL WHERE id = $1', [
          row.id,
        ]),
        notAllowed,
        `${user.name} changes`,
      );
    }
    assert.equal((await storedDeletion(row.id)).deleted_by, officer.id);

    const { rows } = await db.query(
      `SELECT has_function_privilege('authenticated', 'public.check_deleted_record()', 'EXECUTE')
                AS check_it,
              has_function_privilege('authenticated', 'public.remember_deleted_record()',
                'EXECUTE') AS remember_it`,
    );
    assert.deepEqual(rows, [{ check_it: false, remember_it: false }]);
  });

  test('putting it back in the SQL editor takes it off the list', async () => {
    const row = freshRow();
    await upload(botanist, row);
    await deleteAs(officer, row.id);

    // As the postgres user, like the SQL editor
    const restored = { ...row, recorded_by: botanist.name, submitted_by: botanist.id };
    const columns = Object.keys(restored).join(', ');
    await db.query(
      `INSERT INTO public.records (${columns})
       SELECT ${columns} FROM json_populate_record(null::public.records, $1::json)`,
      [JSON.stringify(restored)],
    );
    assert.equal(await storedDeletion(row.id), undefined);
    assert.ok(await storedRecord(row.id));
    // So the phone hears it went up before
    await assert.rejects(upload(botanist, row), { code: '23505', constraint: 'records_pkey' });
  });

  test('running 010 again keeps the list, and 002 still runs after it', async () => {
    const row = freshRow();
    await upload(botanist, row);
    await deleteAs(officer, row.id);

    await db.exec(readSql('010_deleted_records.sql'));
    await db.exec(readSql('002_seed_data.sql'));
    assert.equal((await storedDeletion(row.id)).deleted_by, officer.id);
    await assert.rejects(upload(botanist, row), { constraint: 'deleted_records_pkey' });
  });

  test("010 stops and changes nothing if 009 hasn't been run", async () => {
    const upTo008 = SQL_FILES.slice(0, SQL_FILES.indexOf('009_species_photos.sql'));
    const without009 = await newDatabase(upTo008);
    try {
      await assert.rejects(
        without009.exec(readSql('010_deleted_records.sql')),
        /010 needs 009_species_photos\.sql to be run first/,
      );
      const { rows } = await without009.query(
        "SELECT to_regclass('public.deleted_records') AS deleted",
      );
      assert.deepEqual(rows, [{ deleted: null }]);
    } finally {
      await without009.close();
    }
  });
});

describe('the records already on Supabase', () => {
  test('the seed records get species names, and tag codes that match their species', async () => {
    const { rows } = await db.query(
      `SELECT r.tag_code, r.species_name, r.common_name, r.height_m, s.qr_uuid,
              s.scientific_name, s.common_names[1] AS first_common_name
       FROM public.records AS r
       JOIN public.species AS s ON s.id = r.species_slug
       WHERE r.submitted_by IS NULL`,
    );
    assert.equal(rows.length, 6);
    for (const seed of rows) {
      assert.equal(seed.tag_code, seed.qr_uuid);
      assert.equal(seed.species_name, seed.scientific_name);
      assert.equal(seed.common_name, seed.first_common_name);
      assert.ok(Number(seed.height_m) > 0);
    }
    const belian = await storedRecord('3f2a9c4e-8b1d-4c6a-9e2f-7a1b5c3d9e01');
    assert.equal(belian.tag_code, 'NNP-3F2A9C');
    assert.equal(belian.species_name, 'Eusideroxylon zwageri');
    assert.equal(belian.common_name, 'Belian');
    assert.equal(belian.submitted_by, null);
  });

  test('002 still runs again after 005 without adding anything', async () => {
    const count = async () =>
      (await db.query('SELECT count(*)::int AS n FROM public.records')).rows[0].n;
    const before = await count();
    await db.exec(readSql('002_seed_data.sql'));
    assert.equal(await count(), before);
  });

  test('running 005 a second time stops on the first line', async () => {
    await assert.rejects(db.exec(readSql('005_phone_sync.sql')), {
      code: '42701',
      message: /column "tag_code" of relation "records" already exists/,
    });
  });
});

describe('record photos in Storage', () => {
  function photoPath(owner) {
    return `${owner.id}/${randomUUID()}/1.jpg`;
  }

  function uploadPhoto(user, name) {
    return insertAs(db, user, 'storage.objects', {
      bucket_id: 'record-photos',
      name,
      owner: user?.id ?? null,
    });
  }

  test('the bucket is private and only takes images up to 10 MB', async () => {
    const { rows } = await db.query(
      `SELECT public, file_size_limit, allowed_mime_types
       FROM storage.buckets
       WHERE id = 'record-photos'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].public, false);
    assert.equal(Number(rows[0].file_size_limit), 10 * 1024 * 1024);
    assert.deepEqual(rows[0].allowed_mime_types, [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
    ]);
  });

  test('field staff can upload into their own folder only', async () => {
    await uploadPhoto(botanist, photoPath(botanist));
    await uploadPhoto(officer, photoPath(officer));
    await assert.rejects(uploadPhoto(botanist, photoPath(otherBotanist)), { code: '42501' });
    await assert.rejects(uploadPhoto(botanist, `${randomUUID()}.jpg`), { code: '42501' });
  });

  test("visitors and people who aren't signed in can't upload", async () => {
    await assert.rejects(uploadPhoto(visitor, photoPath(visitor)), { code: '42501' });
    await assert.rejects(uploadPhoto(null, `${randomUUID()}/${randomUUID()}/1.jpg`), {
      code: '42501',
    });
  });

  test('only the uploader, officers and admins can see a photo', async () => {
    const name = photoPath(botanist);
    await uploadPhoto(botanist, name);
    const sql = 'SELECT name FROM storage.objects WHERE name = $1';
    for (const user of [botanist, officer, admin]) {
      assert.equal((await selectAs(db, user, sql, [name])).length, 1, user.name);
    }
    for (const user of [otherBotanist, visitor, null]) {
      assert.equal((await selectAs(db, user, sql, [name])).length, 0, user?.name ?? 'anon');
    }
  });
});
