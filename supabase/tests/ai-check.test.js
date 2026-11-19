// Checks 032_ai_photo_check.sql: when a waiting record and all its photos are on the server, the
// database sends it to the ai-check function, once, with a new token. That only officers and
// admins read the answers, that nobody reads the token, that "Check again" only works for them,
// and that a broken check never stops a record or a photo from uploading.
// PGlite has no pg_net or Vault, so the first database here shows what happens on a project where
// it isn't set up, and the second one gets a stand-in for both that writes down each request.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { addUser, asUser, insertAs, newDatabase, readFixture, selectAs } from './harness.js';

const { uploads } = readFixture('phone-upload.json');
const [everyField] = uploads;
const FUNCTION_URL = 'https://example.test/functions/v1/ai-check';

// A stand-in for pg_net that keeps each request instead of sending it, and for Vault with the
// function's address in it
const STAND_IN_NET_AND_VAULT = `
  CREATE SCHEMA net;
  CREATE TABLE net.sent (
    id serial PRIMARY KEY,
    url text,
    body jsonb,
    headers jsonb,
    timeout_milliseconds integer
  );
  CREATE FUNCTION net.http_post(
    url text,
    body jsonb DEFAULT '{}',
    params jsonb DEFAULT '{}',
    headers jsonb DEFAULT '{}',
    timeout_milliseconds integer DEFAULT 5000
  ) RETURNS bigint
  LANGUAGE sql
  AS $$
    INSERT INTO net.sent (url, body, headers, timeout_milliseconds)
    VALUES ($1, $2, $4, $5)
    RETURNING id::bigint
  $$;
  CREATE SCHEMA vault;
  CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);
  INSERT INTO vault.decrypted_secrets VALUES ('ai_check_url', '${FUNCTION_URL}');
`;

const notAllowed = { code: '42501' };

/** Uploads a record like the phone does and gives back its ID. */
async function upload(db, user, extra = {}) {
  const row = { ...structuredClone(everyField.row), id: randomUUID(), ...extra };
  await insertAs(db, user, 'public.records', row);
  return row.id;
}

/** Uploads a record's photo like the phone does, to <account>/<record>/<n>.jpg. */
function uploadPhoto(db, user, recordId, position, bucket = 'record-photos') {
  return insertAs(db, user, 'storage.objects', {
    bucket_id: bucket,
    name: `${user.id}/${recordId}/${position}.jpg`,
    owner: user.id,
  });
}

/** The check's row as the postgres user, token and all. */
async function checkOf(db, recordId) {
  const { rows } = await db.query('SELECT * FROM public.record_ai_checks WHERE record_id = $1', [
    recordId,
  ]);
  return rows[0];
}

async function sentFor(db, recordId) {
  const { rows } = await db.query(
    "SELECT * FROM net.sent WHERE body ->> 'record_id' = $1 ORDER BY id",
    [recordId],
  );
  return rows;
}

function askAgain(db, user, recordId) {
  return asUser(db, user, (tx) =>
    tx.query('SELECT public.request_ai_check($1) AS answer', [recordId]),
  ).then((result) => result.rows[0].answer);
}

describe('on a project where it is not set up', () => {
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

  test('a record with no photos is saved as not set up, and nothing is sent', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    const check = await checkOf(db, id);
    assert.equal(check.status, 'not_set_up');
    assert.equal(check.token, null);
    assert.ok(check.requested_at);
  });

  test('Check again says it is not set up', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    assert.equal(await askAgain(db, officer, id), 'not_set_up');
  });

  test('the records from the seed file have no check', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS checks FROM public.record_ai_checks AS c
       JOIN public.records AS r ON r.id = c.record_id
       WHERE r.submitted_by IS NULL`,
    );
    assert.deepEqual(rows, [{ checks: 0 }]);
  });
});

describe('on a project where it is set up', () => {
  let db;
  let visitor;
  let researcher;
  let botanist;
  let officer;
  let admin;

  before(async () => {
    db = await newDatabase();
    await db.exec(STAND_IN_NET_AND_VAULT);
    visitor = await addUser(db, { name: 'Visitor' });
    researcher = await addUser(db, { role: 'researcher', name: 'Researcher' });
    botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
    officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
    admin = await addUser(db, { role: 'admin', name: 'Park admin' });
  });

  after(async () => {
    await db.close();
  });

  test('a record with no photos is sent straight away, with only its ID and a token', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    const check = await checkOf(db, id);
    assert.equal(check.status, 'checking');
    assert.ok(check.token);

    const sent = await sentFor(db, id);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, FUNCTION_URL);
    assert.deepEqual(sent[0].body, { record_id: id, token: check.token });
    assert.deepEqual(sent[0].headers, { 'Content-Type': 'application/json' });
  });

  test('a record with photos waits for the last one, then is sent once', async () => {
    const id = await upload(db, botanist, { photo_count: 3 });
    assert.equal((await checkOf(db, id)).status, 'waiting_for_photos');

    await uploadPhoto(db, botanist, id, 1);
    await uploadPhoto(db, botanist, id, 2);
    assert.equal((await checkOf(db, id)).status, 'waiting_for_photos');
    assert.equal((await sentFor(db, id)).length, 0);

    await uploadPhoto(db, botanist, id, 3);
    const check = await checkOf(db, id);
    assert.equal(check.status, 'checking');
    const sent = await sentFor(db, id);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.token, check.token);
  });

  test('photos in another bucket, or with a path that has no record ID, are left alone', async () => {
    const id = await upload(db, botanist, { photo_count: 1 });
    await insertAs(db, officer, 'storage.objects', {
      bucket_id: 'botanical-photos',
      name: `${randomUUID()}/${id}/1.jpg`,
      owner: officer.id,
    });
    await insertAs(db, botanist, 'storage.objects', {
      bucket_id: 'record-photos',
      name: `${botanist.id}/not-a-record/1.jpg`,
      owner: botanist.id,
    });
    assert.equal((await checkOf(db, id)).status, 'waiting_for_photos');
  });

  test('a photo that arrives after the record is reviewed sends nothing', async () => {
    const id = await upload(db, botanist, { photo_count: 1 });
    await db.query("UPDATE public.records SET status = 'published' WHERE id = $1", [id]);
    await uploadPhoto(db, botanist, id, 1);
    assert.equal((await checkOf(db, id)).status, 'waiting_for_photos');
    assert.equal((await sentFor(db, id)).length, 0);
  });

  test('only officers and admins read the checks, and nobody reads the token', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    const sql = 'SELECT record_id, status FROM public.record_ai_checks WHERE record_id = $1';
    for (const user of [officer, admin]) {
      assert.deepEqual(await selectAs(db, user, sql, [id]), [{ record_id: id, status: 'checking' }]);
      await assert.rejects(
        selectAs(db, user, 'SELECT token FROM public.record_ai_checks'),
        notAllowed,
        user.name,
      );
    }
    for (const user of [botanist, researcher, visitor]) {
      assert.deepEqual(await selectAs(db, user, sql, [id]), [], user.name);
    }
    await assert.rejects(selectAs(db, null, sql, [id]), notAllowed);
  });

  test('nobody saves or changes a check through the API', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    for (const user of [admin, officer, botanist]) {
      await assert.rejects(
        asUser(db, user, (tx) =>
          tx.query(
            "UPDATE public.record_ai_checks SET status = 'done', verdict = 'consistent' WHERE record_id = $1",
            [id],
          ),
        ),
        notAllowed,
        user.name,
      );
      await assert.rejects(
        insertAs(db, user, 'public.record_ai_checks', {
          record_id: randomUUID(),
          status: 'done',
          verdict: 'consistent',
        }),
        notAllowed,
        user.name,
      );
      await assert.rejects(
        asUser(db, user, (tx) =>
          tx.query('DELETE FROM public.record_ai_checks WHERE record_id = $1', [id]),
        ),
        notAllowed,
        user.name,
      );
    }
    assert.equal((await checkOf(db, id)).status, 'checking');
  });

  test('only the triggers send a check', async () => {
    for (const fn of [
      'public.send_ai_check(uuid)',
      'public.ai_check_if_photos_are_in(uuid)',
      'public.start_ai_check()',
      'public.ai_check_on_photo()',
    ]) {
      for (const role of ['anon', 'authenticated']) {
        const { rows } = await db.query(
          'SELECT has_function_privilege($1, $2, $3) AS allowed',
          [role, fn, 'EXECUTE'],
        );
        assert.deepEqual(rows, [{ allowed: false }], `${role} ${fn}`);
      }
    }
  });

  test('Check again sends a waiting record with the photos it has so far', async () => {
    const id = await upload(db, botanist, { photo_count: 2 });
    await uploadPhoto(db, botanist, id, 1);
    assert.equal((await checkOf(db, id)).status, 'waiting_for_photos');

    assert.equal(await askAgain(db, officer, id), 'checking');
    assert.equal((await checkOf(db, id)).status, 'checking');
    assert.equal((await sentFor(db, id)).length, 1);
  });

  test('Check again works for a record from before 032, which has no check yet', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    await db.query('DELETE FROM public.record_ai_checks WHERE record_id = $1', [id]);
    assert.equal(await askAgain(db, admin, id), 'checking');
    assert.equal((await checkOf(db, id)).status, 'checking');
  });

  test("Check again waits while a check is out, and doesn't run twice in a minute", async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    assert.equal(await askAgain(db, officer, id), 'already_checking');

    // A check that never answered can be sent again after 2 minutes
    await db.query(
      "UPDATE public.record_ai_checks SET requested_at = now() - interval '3 minutes' WHERE record_id = $1",
      [id],
    );
    const before = (await checkOf(db, id)).token;
    assert.equal(await askAgain(db, officer, id), 'checking');
    const after = await checkOf(db, id);
    assert.notEqual(after.token, before, 'each request gets a new token');
    assert.equal((await sentFor(db, id)).length, 2);

    // The function answered just now
    await db.query(
      `UPDATE public.record_ai_checks
       SET status = 'done', verdict = 'worth_a_look', note = 'Looks like a fern', token = NULL,
           checked_at = now()
       WHERE record_id = $1`,
      [id],
    );
    assert.equal(await askAgain(db, officer, id), 'too_soon');

    // A minute later it can be checked again, which clears the last answer
    await db.query(
      "UPDATE public.record_ai_checks SET requested_at = now() - interval '61 seconds' WHERE record_id = $1",
      [id],
    );
    assert.equal(await askAgain(db, officer, id), 'checking');
    const again = await checkOf(db, id);
    assert.equal(again.verdict, null);
    assert.equal(again.note, null);
    assert.equal(again.checked_at, null);
  });

  test('Check again only works on waiting records that exist', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    await db.query("UPDATE public.records SET status = 'rejected' WHERE id = $1", [id]);
    assert.equal(await askAgain(db, officer, id), 'not_waiting');
    assert.equal(await askAgain(db, officer, randomUUID()), 'not_found');
  });

  test('only officers and admins can press Check again', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    for (const user of [botanist, researcher, visitor]) {
      await assert.rejects(askAgain(db, user, id), notAllowed, user.name);
    }
    await assert.rejects(askAgain(db, null, id), notAllowed);
  });

  test('deleting a record deletes its check', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    await db.query('DELETE FROM public.records WHERE id = $1', [id]);
    assert.equal(await checkOf(db, id), undefined);
  });

  test('a broken check never stops a record or a photo from uploading', async () => {
    await db.exec(`
      ALTER FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) RENAME TO http_post_working;
      CREATE FUNCTION net.http_post(
        url text, body jsonb, params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}',
        timeout_milliseconds integer DEFAULT 5000
      ) RETURNS bigint LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'pg_net is down';
      END
      $$;
    `);
    try {
      const noPhotos = await upload(db, botanist, { photo_count: 0 });
      const { rows } = await db.query('SELECT 1 FROM public.records WHERE id = $1', [noPhotos]);
      assert.equal(rows.length, 1);
      // 033 saves why on the card
      const failed = await checkOf(db, noPhotos);
      assert.equal(failed.status, 'failed');
      assert.equal(failed.problem, "The check didn't start: pg_net is down");

      const withPhoto = await upload(db, botanist, { photo_count: 1 });
      assert.equal((await checkOf(db, withPhoto)).status, 'waiting_for_photos');
      assert.equal((await uploadPhoto(db, botanist, withPhoto, 1)).affectedRows, 1);
      const photoFailed = await checkOf(db, withPhoto);
      assert.equal(photoFailed.status, 'failed');
      assert.equal(photoFailed.problem, "The check didn't start: pg_net is down");
    } finally {
      await db.exec(`
        DROP FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer);
        ALTER FUNCTION net.http_post_working(text, jsonb, jsonb, jsonb, integer) RENAME TO http_post;
      `);
    }
  });
});
