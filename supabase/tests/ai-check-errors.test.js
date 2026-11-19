// Checks 033_ai_check_errors.sql: every way an AI check can break ends up on the card as a failed
// check with a reason. A trigger that can't start a check saves the error, and
// fail_lost_ai_checks() reads what pg_net wrote down about each request, so a check sent to a
// function that isn't there, or that never answered, doesn't sit on "Checking" for ever.
// PGlite has no pg_net or Vault, so like ai-check.test.js this makes a stand-in for both, with
// pg_net's table of answers (net._http_response) that the tests fill in.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { addUser, asUser, insertAs, newDatabase, readFixture } from './harness.js';

const { uploads } = readFixture('phone-upload.json');
const [everyField] = uploads;

const STAND_IN_NET_AND_VAULT = `
  CREATE SCHEMA net;
  CREATE SEQUENCE net.request_ids;
  CREATE FUNCTION net.http_post(
    url text,
    body jsonb DEFAULT '{}',
    params jsonb DEFAULT '{}',
    headers jsonb DEFAULT '{}',
    timeout_milliseconds integer DEFAULT 5000
  ) RETURNS bigint
  LANGUAGE sql
  AS $$ SELECT nextval('net.request_ids') $$;
  CREATE TABLE net._http_response (
    id bigint,
    status_code integer,
    content_type text,
    headers jsonb,
    content text,
    timed_out boolean,
    error_msg text,
    created timestamptz DEFAULT now()
  );
  CREATE SCHEMA vault;
  CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);
  INSERT INTO vault.decrypted_secrets
  VALUES ('ai_check_url', 'https://example.test/functions/v1/ai-check');
`;

const notAllowed = { code: '42501' };

async function upload(db, user, extra = {}) {
  const row = { ...structuredClone(everyField.row), id: randomUUID(), ...extra };
  await insertAs(db, user, 'public.records', row);
  return row.id;
}

async function checkOf(db, recordId) {
  const { rows } = await db.query('SELECT * FROM public.record_ai_checks WHERE record_id = $1', [
    recordId,
  ]);
  return rows[0];
}

/** What pg_net writes down once the function answers (or doesn't). */
function answer(db, requestId, { code = null, content = null, timedOut = false, error = null }) {
  return db.query(
    `INSERT INTO net._http_response (id, status_code, content, timed_out, error_msg)
     VALUES ($1, $2, $3, $4, $5)`,
    [requestId, code, content, timedOut, error],
  );
}

function sentAgo(db, recordId, interval) {
  return db.query(
    'UPDATE public.record_ai_checks SET requested_at = now() - $2::interval WHERE record_id = $1',
    [recordId, interval],
  );
}

function lookForLost(db, user) {
  return asUser(db, user, (tx) => tx.query('SELECT public.fail_lost_ai_checks() AS marked')).then(
    (result) => result.rows[0].marked,
  );
}

describe('on a project where it is set up', () => {
  let db;
  let visitor;
  let botanist;
  let officer;
  let admin;

  before(async () => {
    db = await newDatabase();
    await db.exec(STAND_IN_NET_AND_VAULT);
    visitor = await addUser(db, { name: 'Visitor' });
    botanist = await addUser(db, { role: 'botanist', name: 'Field botanist' });
    officer = await addUser(db, { role: 'conservation_officer', name: 'Park officer' });
    admin = await addUser(db, { role: 'admin', name: 'Park admin' });
  });

  after(async () => {
    await db.close();
  });

  test('each check keeps the ID of the request it was sent with', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    const first = await checkOf(db, id);
    assert.equal(first.status, 'checking');
    assert.ok(first.request_id);

    await sentAgo(db, id, '3 minutes');
    await asUser(db, officer, (tx) => tx.query('SELECT public.request_ai_check($1)', [id]));
    const second = await checkOf(db, id);
    assert.ok(Number(second.request_id) > Number(first.request_id));
  });

  test('a function that is not deployed fails the check straight away, with what it said', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    const { request_id: requestId } = await checkOf(db, id);
    await answer(db, requestId, {
      code: 404,
      content: '{"code":"NOT_FOUND","message":"Requested function was not found"}',
    });

    assert.ok((await lookForLost(db, officer)) >= 1);
    const check = await checkOf(db, id);
    assert.equal(check.status, 'failed');
    assert.equal(
      check.problem,
      "The ai-check function said no (HTTP 404): Requested function was not found. Check that it's deployed under the name ai-check.",
    );
    assert.equal(check.token, null);
    assert.ok(check.checked_at);
  });

  test('an error answer from the function shows its error, or its text when it is not JSON', async () => {
    const refused = await upload(db, botanist, { photo_count: 0 });
    await answer(db, (await checkOf(db, refused)).request_id, {
      code: 401,
      content: '{"error":"not a check the database asked for"}',
    });
    const gateway = await upload(db, botanist, { photo_count: 0 });
    await answer(db, (await checkOf(db, gateway)).request_id, { code: 502, content: 'Bad gateway' });

    await lookForLost(db, admin);
    assert.equal(
      (await checkOf(db, refused)).problem,
      'The ai-check function said no (HTTP 401): not a check the database asked for',
    );
    assert.equal(
      (await checkOf(db, gateway)).problem,
      'The ai-check function said no (HTTP 502): Bad gateway',
    );
  });

  test("a request pg_net couldn't send fails straight away, with pg_net's error", async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    await answer(db, (await checkOf(db, id)).request_id, {
      error: 'Could not resolve host: example.test',
    });
    await lookForLost(db, officer);
    const check = await checkOf(db, id);
    assert.equal(check.status, 'failed');
    assert.equal(
      check.problem,
      "The database couldn't reach the ai-check function: Could not resolve host: example.test",
    );
  });

  test('a check the function took is left alone for 3 minutes, then failed', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    await answer(db, (await checkOf(db, id)).request_id, { code: 202, content: '{"ok":true}' });

    await lookForLost(db, officer);
    assert.equal((await checkOf(db, id)).status, 'checking');

    await sentAgo(db, id, '181 seconds');
    await lookForLost(db, officer);
    const check = await checkOf(db, id);
    assert.equal(check.status, 'failed');
    assert.match(check.problem, /took the check but never saved an answer/);
  });

  test('a request that timed out waits the 3 minutes too, since the function may have it', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    await answer(db, (await checkOf(db, id)).request_id, {
      timedOut: true,
      error: 'Timeout of 10000 ms reached',
    });

    await lookForLost(db, officer);
    assert.equal((await checkOf(db, id)).status, 'checking');

    await sentAgo(db, id, '181 seconds');
    await lookForLost(db, officer);
    const check = await checkOf(db, id);
    assert.equal(check.status, 'failed');
    assert.match(check.problem, /didn't answer the database within 10 seconds/);
  });

  test('a check with nothing written down by pg_net fails after 3 minutes', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    await lookForLost(db, officer);
    assert.equal((await checkOf(db, id)).status, 'checking');

    await sentAgo(db, id, '181 seconds');
    await lookForLost(db, officer);
    const check = await checkOf(db, id);
    assert.equal(check.status, 'failed');
    assert.equal(check.problem, 'No answer came back from the ai-check function within 3 minutes.');
  });

  test('finished checks and checks waiting for photos are left alone', async () => {
    const done = await upload(db, botanist, { photo_count: 0 });
    await db.query(
      `UPDATE public.record_ai_checks
       SET status = 'done', verdict = 'consistent', token = NULL, checked_at = now(),
           requested_at = now() - interval '1 hour'
       WHERE record_id = $1`,
      [done],
    );
    const waiting = await upload(db, botanist, { photo_count: 2 });
    await sentAgo(db, waiting, '1 hour');

    await lookForLost(db, officer);
    assert.equal((await checkOf(db, done)).status, 'done');
    assert.equal((await checkOf(db, waiting)).status, 'waiting_for_photos');
  });

  test('it gives back how many it failed', async () => {
    await lookForLost(db, officer);
    assert.equal(await lookForLost(db, officer), 0);
    const id = await upload(db, botanist, { photo_count: 0 });
    await sentAgo(db, id, '10 minutes');
    assert.equal(await lookForLost(db, officer), 1);
  });

  test('only officers and admins can look for lost checks', async () => {
    for (const user of [botanist, visitor]) {
      await assert.rejects(lookForLost(db, user), notAllowed, user.name);
    }
    await assert.rejects(lookForLost(db, null), notAllowed);
  });

  test('nobody reads the request ID or saves a problem through the API', async () => {
    await assert.rejects(
      asUser(db, officer, (tx) => tx.query('SELECT request_id FROM public.record_ai_checks')),
      notAllowed,
    );
    for (const role of ['anon', 'authenticated']) {
      const { rows } = await db.query(
        'SELECT has_function_privilege($1, $2, $3) AS allowed',
        [role, 'public.save_ai_check_problem(uuid, text)', 'EXECUTE'],
      );
      assert.deepEqual(rows, [{ allowed: false }], role);
    }
  });

  test("a problem from a trigger never wipes a check that's done or out", async () => {
    const done = await upload(db, botanist, { photo_count: 0 });
    await db.query(
      `UPDATE public.record_ai_checks
       SET status = 'done', verdict = 'unsure', token = NULL, checked_at = now()
       WHERE record_id = $1`,
      [done],
    );
    const out = await upload(db, botanist, { photo_count: 0 });
    for (const id of [done, out]) {
      await db.query('SELECT public.save_ai_check_problem($1, $2)', [id, 'broken']);
    }
    assert.equal((await checkOf(db, done)).status, 'done');
    assert.equal((await checkOf(db, out)).status, 'checking');

    // and a record that isn't there gets no check
    const missing = randomUUID();
    await db.query('SELECT public.save_ai_check_problem($1, $2)', [missing, 'broken']);
    assert.equal(await checkOf(db, missing), undefined);
  });

  test('a long error is cut to fit the card', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    await answer(db, (await checkOf(db, id)).request_id, { code: 500, content: 'x'.repeat(1000) });
    await lookForLost(db, officer);
    const check = await checkOf(db, id);
    assert.equal(check.status, 'failed');
    assert.ok(check.problem.length <= 300);
  });
});

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

  test('looking for lost checks works without pg_net, on the 3 minute rule', async () => {
    const id = await upload(db, botanist, { photo_count: 0 });
    assert.equal((await checkOf(db, id)).status, 'not_set_up');
    assert.equal(await lookForLost(db, officer), 0);

    // A check from before pg_net went away
    await db.query(
      `UPDATE public.record_ai_checks
       SET status = 'checking', token = gen_random_uuid(), requested_at = now() - interval '5 minutes'
       WHERE record_id = $1`,
      [id],
    );
    assert.equal(await lookForLost(db, officer), 1);
    assert.equal(
      (await checkOf(db, id)).problem,
      'No answer came back from the ai-check function within 3 minutes.',
    );
  });
});
